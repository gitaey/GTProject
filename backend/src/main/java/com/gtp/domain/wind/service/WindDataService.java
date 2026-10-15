package com.gtp.domain.wind.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.annotation.PostConstruct;
import com.gtp.domain.wind.entity.WindFrameEntity;
import com.gtp.domain.wind.entity.WindScalarEntity;
import com.gtp.domain.wind.repository.WindFrameRepository;
import com.gtp.domain.wind.repository.WindScalarRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.data.domain.PageRequest;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.time.ZonedDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.locks.ReentrantLock;

/**
 * 기상청 API허브의 국지예보모델(LDAPS, 약 1km 격자) 풍속/풍향·기온·습도(·강수량) 데이터를 받아
 * Lambert Conformal Conic 격자를 위경도 정규 격자로 리샘플링한 뒤 JSON으로 저장한다.
 * LDAPS는 하루 4회(KST 03/09/15/21시) <b>발표</b>되며, forecastHour(leadHour) 0 ~ wind.forecast-hours-1을
 * 시간별 프레임으로 저장해두면 프론트에서 매시간 다음 프레임으로 넘어가며 보여줄 수 있다.
 *
 * <ul>
 *   <li>바람: U/V를 ol-wind가 바로 소비하는 grib2json으로(<code>tbl_wind_frame</code>). 0.1 m/s로 반올림.</li>
 *   <li>스칼라(기온·습도·강수량, <code>wind.fields</code>로 변수별 on/off): (사이클, 예보시간, 변수)당 1행의 정수 양자화 JSON(<code>tbl_wind_scalar</code>).</li>
 *   <li>재격자: 출력 칸마다 LCC 순변환으로 원본 격자 좌표를 구해 <b>이중선형 보간</b>한다(역방향 — 빈 칸이 생기지 않는다).
 *       원본 격자 밖 칸·원본 값이 없는 칸은 JSON <code>null</code>(= 자료 없음, 0이 아니다). 계산은 {@link LdapsRegridder}.</li>
 *   <li>갱신: 매시 30분에 시도한다. 최신 사이클의 <b>바람</b>이 "완전"(forecastHours개 예보시간이 모두 저장됨)하면 새 바람은 받지 않고,
 *       설정된 스칼라 중 빠진 (예보시간, 변수)만 받는다(같은 키가 연속 3회 실패하면 서버가 다시 뜰 때까지 포기). 미생산이면 다음 시각에 다시 시도한다.</li>
 *   <li>정리: 최신 "완전한" 바람 사이클보다 오래된 사이클(바람·스칼라 모두)만 지운다. 새 사이클이 완성되기 전에는 옛 완전한 사이클을 지우지 않는다.</li>
 * </ul>
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class WindDataService {

    private static final ZoneId KST = ZoneId.of("Asia/Seoul");
    private static final int[] CYCLE_HOURS_KST = {3, 9, 15, 21};

    /** 스칼라 한 (예보시간, 변수)가 연속으로 이만큼 실패하면 그 사이클에서는 포기한다(서버를 다시 띄우면 다시 시도) */
    static final int MAX_SCALAR_FAILURES = 3;

    /**
     * 스칼라 변수 카탈로그. code = 서버·프론트 공통 코드, kmaCode = API허브 dataTypeCd, scale = 정수화 단위,
     * validMin/validMax = 이 밖의 원값은 결측 표시값(-999 등)으로 보고 자료 없음 처리, clampMin/clampMax = 보간 뒤 자르기(없으면 NaN)
     */
    enum ScalarVar {
        TEMP("temp", "Temp", "C", 0.1, -100, 70, Double.NaN, Double.NaN),
        HUMI("humi", "Humi", "%", 1.0, -1, 120, 0.0, 100.0),
        RAIN("rain", "Rain", "mm", 0.1, -0.5, 2000, 0.0, Double.NaN);

        final String code, kmaCode, unit;
        final double scale, validMin, validMax, clampMin, clampMax;

        ScalarVar(String code, String kmaCode, String unit, double scale, double validMin, double validMax, double clampMin, double clampMax) {
            this.code = code; this.kmaCode = kmaCode; this.unit = unit; this.scale = scale;
            this.validMin = validMin; this.validMax = validMax; this.clampMin = clampMin; this.clampMax = clampMax;
        }

        static ScalarVar of(String code) {
            for (ScalarVar v : values()) if (v.code.equals(code)) return v;
            return null;
        }
    }

    private final WindFrameRepository windFrameRepository;
    private final WindScalarRepository windScalarRepository;
    private final TransactionTemplate transactionTemplate;
    private final ObjectMapper objectMapper = new ObjectMapper();

    @Value("${kma.api-key}")
    private String kmaApiKey;

    @Value("${kma.base-url:https://apihub.kma.go.kr/api/typ02/openApi/KIMModelInfoService/getKIMLdapsUnisAll}")
    private String kmaBaseUrl;

    /* 사이클당 시간별 프레임 수(leadHour 0 ~ N-1). 사이클이 "완전하다"는 판단 기준이기도 하다 */
    @Value("${wind.forecast-hours}")
    private int forecastHours;

    /* 출력(리샘플링 결과) 격자 해상도(도). 0.02도 ≈ 2km */
    @Value("${wind.output.resolution-deg:0.02}")
    private double outputResolutionDeg;

    /**
     * 받아서 저장할 스칼라 변수(쉼표 구분: temp,humi,rain). 비우면 스칼라 호출 0(v1과 같다) — 기상청 일일 호출 한도를 아끼는 손잡이.
     * rain은 시간당/누적 의미가 확인될 때까지 기본값에서 뺀다.
     */
    @Value("${wind.fields:}")
    private String fieldsConfig;

    /* 같은 서버 안에서 갱신(수동 POST와 스케줄)이 동시에 두 번 돌아 같은 프레임이 이중 저장되는 것을 막는다 */
    private final ReentrantLock refreshLock = new ReentrantLock();

    /* false면 스케줄 갱신을 하지 않는다. 같은 DB를 보는 로컬 개발 서버가 운영과 이중으로 갱신하지 않게 application-local.yml에서 끈다 */
    @Value("${wind.scheduler.enabled:true}")
    private boolean schedulerEnabled;

    /** 스칼라 (사이클/예보시간/변수) 연속 실패 횟수 — refreshLock 안에서만 쓴다 */
    private final Map<String, Integer> scalarFailures = new HashMap<>();

    /** 재격자 계획 캐시(원본 기하·해상도별) — 변수마다 같은 계획을 다시 만들지 않는다 */
    private final Map<String, LdapsRegridder.Plan> plans = new ConcurrentHashMap<>();

    private final HttpClient httpClient = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(15))
            .followRedirects(HttpClient.Redirect.NORMAL)
            .build();

    /** 설정 문자열을 마지막으로 해석한 결과 — 같은 설정이면 다시 해석하지 않아 경고도 한 번만 남는다(/frames가 요청마다 부른다) */
    private String parsedConfig;
    private List<ScalarVar> parsedVars = List.of();

    /** 기동 때 한 번 해석해 알 수 없는 변수 이름 경고를 미리 남긴다 */
    @PostConstruct
    void initFields() {
        configuredVars();
    }

    /** 설정에서 켠 스칼라 변수(알 수 없는 이름은 경고만 하고 건너뜀). 설정이 바뀔 때만 다시 해석한다 */
    synchronized List<ScalarVar> configuredVars() {
        if (parsedConfig != null && parsedConfig.equals(fieldsConfig == null ? "" : fieldsConfig)) return parsedVars;
        List<ScalarVar> out = new ArrayList<>();
        String cfg = fieldsConfig == null ? "" : fieldsConfig;
        for (String raw : cfg.split(",")) {
            String code = raw.trim().toLowerCase();
            if (code.isEmpty()) continue;
            ScalarVar v = ScalarVar.of(code);
            if (v == null) log.warn("[바람길] wind.fields의 알 수 없는 변수 '{}' 무시 (temp·humi·rain만 지원)", code);
            else if (!out.contains(v)) out.add(v);
        }
        parsedConfig = cfg;
        parsedVars = List.copyOf(out);
        return parsedVars;
    }

    /** 설정에서 켠 스칼라 변수 코드 집합(컨트롤러가 메타 fields를 거를 때 쓴다) */
    public Set<String> configuredVarCodes() {
        Set<String> s = new HashSet<>();
        for (ScalarVar v : configuredVars()) s.add(v.code);
        return s;
    }

    /* LDAPS는 KST 03/09/15/21시에 발표된다. 생산 후 다운로드 가능해지기까지의 지연이 날마다 달라서 발표 시각에 맞추지 않고
       매시 30분마다 시도한다. 최신 사이클이 이미 완전하면 DB 조회 한 번(+정리)으로 끝나 기상청을 부르지 않는다. */
    @Scheduled(cron = "0 30 * * * *", zone = "Asia/Seoul")
    public void scheduledRefresh() {
        if (!schedulerEnabled) {
            log.info("[바람길] wind.scheduler.enabled=false 이므로 스케줄 갱신을 건너뜀");
            return;
        }
        try {
            refresh();
        } catch (Exception e) {
            log.error("[바람길] LDAPS 데이터 갱신 실패", e);
        }
    }

    public void refresh() {
        if (!refreshLock.tryLock()) {
            log.info("[바람길] 다른 갱신이 진행 중이라 건너뜀");
            return;
        }
        try {
            doRefresh();
        } finally {
            refreshLock.unlock();
        }
    }

    private static String baseTimeOf(LocalDate d, int h) {
        return d.format(DateTimeFormatter.BASIC_ISO_DATE) + String.format("%02d00", h);
    }

    private void doRefresh() {
        ZonedDateTime[] candidates = recentCycles(ZonedDateTime.now(KST), 8);

        ZonedDateTime chosen = null;
        for (ZonedDateTime candidate : candidates) {
            LocalDate d = candidate.toLocalDate();
            int h = candidate.getHour();
            long have = windFrameRepository.countDistinctForecastHours(d, h);
            if (have >= forecastHours) {
                log.info("[바람길] 최신 LDAPS 사이클({} {}KST)의 바람이 이미 완전({}개)", d, h, have);
                fillScalars(d, h);
                pruneOldCycles();
                return;
            }
            String probeBaseTime = baseTimeOf(d, h);
            if (isCycleAvailable(probeBaseTime)) {
                chosen = candidate;
                if (have > 0) log.info("[바람길] {} {}KST 사이클이 {}/{}개만 저장돼 있어 빠진 프레임을 채움", d, h, have, forecastHours);
                break;
            }
            log.info("[바람길] {} {}KST 사이클은 아직 데이터가 없어 이전 사이클로 재시도", d, h);
        }

        if (chosen == null) {
            log.warn("[바람길] 사용 가능한 LDAPS 사이클을 찾지 못함 (최근 {}개 사이클 전부 NO_DATA)", candidates.length);
            return;
        }

        LocalDate cycleDate = chosen.toLocalDate();
        int cycleHour = chosen.getHour();

        log.info("[바람길] LDAPS {} {}KST 사이클 다운로드 시작 (leadHour 0~{})", cycleDate, cycleHour, forecastHours - 1);
        String baseTime = baseTimeOf(cycleDate, cycleHour);

        // 바람 먼저(완전한 사이클 판정 기준 — 스칼라 때문에 바람 전환이 늦어지지 않게)
        for (int leadHour = 0; leadHour < forecastHours; leadHour++) {
            try {
                if (windFrameRepository.existsByCycleDateAndCycleHourAndForecastHour(cycleDate, cycleHour, leadHour)) {
                    continue; // 이미 저장된 프레임(이전 회차에서 받았거나 다른 서버가 저장)
                }
                String json = fetchAndBuildFrame(baseTime, leadHour);

                ZonedDateTime validKst = cycleDate.atStartOfDay(KST).plusHours(cycleHour + leadHour);
                LocalDateTime validUtc = validKst.withZoneSameInstant(ZoneOffset.UTC).toLocalDateTime();

                try {
                    windFrameRepository.save(WindFrameEntity.builder()
                            .cycleDate(cycleDate)
                            .cycleHour(cycleHour)
                            .forecastHour(leadHour)
                            .validTime(validUtc)
                            .dataJson(json)
                            .build());
                } catch (DataIntegrityViolationException dup) {
                    // 프레임 유니크 인덱스(ux_wind_frame_key)가 있을 때 — 다른 서버가 먼저 저장했다. 다음 회차에 exists로 건너뛴다
                    log.info("[바람길] {} {}KST leadHour {} 프레임은 다른 서버가 먼저 저장함", cycleDate, cycleHour, leadHour);
                }
            } catch (Exception e) {
                log.error("[바람길] leadHour {} 프레임 처리 실패 — 다음 회차에 이 프레임만 다시 받음", leadHour, e);
            }
        }

        fillScalars(cycleDate, cycleHour);
        pruneOldCycles();
        long now = windFrameRepository.countDistinctForecastHours(cycleDate, cycleHour);
        if (now >= forecastHours) log.info("[바람길] LDAPS {} {}KST 사이클 갱신 완료 ({}개)", cycleDate, cycleHour, now);
        else log.warn("[바람길] LDAPS {} {}KST 사이클이 {}/{}개뿐 — 다음 회차에 빠진 프레임을 다시 받음 (옛 완전한 사이클은 지우지 않음)", cycleDate, cycleHour, now, forecastHours);
    }

    /**
     * 설정된 스칼라 변수 중 이 사이클에 빠진 (예보시간, 변수)만 받아 저장한다. 이미 있으면 호출 0.
     * 한 키가 연속 {@value #MAX_SCALAR_FAILURES}회 실패하면 서버가 다시 뜰 때까지 포기한다. 스칼라 쪽 어떤 오류도 바람 갱신을 막지 않는다.
     */
    void fillScalars(LocalDate cycleDate, int cycleHour) {
        List<ScalarVar> vars = configuredVars();
        if (vars.isEmpty()) return;
        try {
            Set<String> have = new HashSet<>();
            for (Object[] row : windScalarRepository.findKeysByCycle(cycleDate, cycleHour)) have.add(((Number) row[0]).intValue() + "/" + row[1]);
            String baseTime = baseTimeOf(cycleDate, cycleHour);
            int saved = 0, failed = 0, gaveUp = 0;
            for (int lead = 0; lead < forecastHours; lead++) {
                for (ScalarVar var : vars) {
                    if (have.contains(lead + "/" + var.code)) continue;
                    String key = cycleDate + "/" + cycleHour + "/" + lead + "/" + var.code;
                    if (scalarFailures.getOrDefault(key, 0) >= MAX_SCALAR_FAILURES) { gaveUp++; continue; }
                    try {
                        String json = fetchAndBuildScalar(baseTime, lead, var);
                        ZonedDateTime validKst = cycleDate.atStartOfDay(KST).plusHours(cycleHour + lead);
                        LocalDateTime validUtc = validKst.withZoneSameInstant(ZoneOffset.UTC).toLocalDateTime();
                        try {
                            windScalarRepository.save(WindScalarEntity.builder()
                                    .cycleDate(cycleDate).cycleHour(cycleHour).forecastHour(lead).varCode(var.code)
                                    .validTime(validUtc).dataJson(json).build());
                        } catch (DataIntegrityViolationException dup) {
                            log.info("[바람길] {} {}KST lead {} {}는 다른 서버가 먼저 저장함", cycleDate, cycleHour, lead, var.code);
                        }
                        scalarFailures.remove(key);
                        saved++;
                    } catch (Exception e) {
                        int n = scalarFailures.merge(key, 1, Integer::sum);
                        failed++;
                        if (n >= MAX_SCALAR_FAILURES) log.error("[바람길] {} lead {} {} 연속 {}회 실패 — 이 사이클에서는 포기", cycleDate + " " + cycleHour + "KST", lead, var.code, n, e);
                        else log.warn("[바람길] {} {}KST lead {} {} 받기 실패({}회째) — 다음 회차에 다시: {}", cycleDate, cycleHour, lead, var.code, n, e.toString());
                    }
                }
            }
            if (saved + failed + gaveUp > 0) log.info("[바람길] 스칼라 {} {}KST: 저장 {}·실패 {}·포기 {}", cycleDate, cycleHour, saved, failed, gaveUp);
        } catch (Exception e) {
            log.error("[바람길] 스칼라 변수 처리 중 오류 — 바람 갱신은 계속함", e);
        }
    }

    /**
     * 최신 "완전한" 사이클(예보시간 forecastHours개가 모두 있는 사이클)보다 오래된 사이클을 지우고, 그 사이클 안의 중복 프레임을 정리한다.
     * 완전한 사이클이 하나도 없으면(첫 설치·forecast-hours를 늘린 직후) 가장 늦은 사이클을 기준으로 한다.
     * 기준보다 새로운(아직 모자란) 사이클은 건드리지 않는다 — 다음 회차에 채워야 하고, 다른 서버가 방금 저장한 것일 수도 있다.
     * 지우는 조건이 "기준보다 오래된 것만"(&lt;)이라 키를 읽은 뒤 더 새 사이클이 저장돼도 지우지 않는다.
     * 스칼라 변수도 같은 기준 사이클로 정리한다(스칼라 쪽 오류는 바람 정리를 막지 않는다).
     * 프레임 한 줄이 수 MB라서 옛 사이클이 남으면 DB와 /api/wind 응답이 급격히 느려진다.
     */
    public void pruneOldCycles() {
        List<Object[]> keys = windFrameRepository.findCompleteCycleKeysDesc(forecastHours, PageRequest.of(0, 1));
        if (keys.isEmpty()) keys = windFrameRepository.findCycleKeysDesc(PageRequest.of(0, 1));
        if (keys.isEmpty()) return;
        LocalDate cycleDate = (LocalDate) keys.get(0)[0];
        int cycleHour = ((Number) keys.get(0)[1]).intValue();
        Integer oldDeleted = transactionTemplate.execute(status -> windFrameRepository.deleteCyclesOlderThan(cycleDate, cycleHour));
        Integer dupDeleted = transactionTemplate.execute(status -> windFrameRepository.deleteDuplicateFramesInCycle(cycleDate, cycleHour));
        if ((oldDeleted != null && oldDeleted > 0) || (dupDeleted != null && dupDeleted > 0)) {
            log.info("[바람길] 프레임 정리: 옛 사이클 {}개·같은 사이클 중복 {}개 삭제 (기준 사이클 {} {}KST)", oldDeleted, dupDeleted, cycleDate, cycleHour);
        }
        try {
            Integer sOld = transactionTemplate.execute(status -> windScalarRepository.deleteCyclesOlderThan(cycleDate, cycleHour));
            Integer sDup = transactionTemplate.execute(status -> windScalarRepository.deleteDuplicatesInCycle(cycleDate, cycleHour));
            if ((sOld != null && sOld > 0) || (sDup != null && sDup > 0)) {
                log.info("[바람길] 스칼라 정리: 옛 사이클 {}개·중복 {}개 삭제 (기준 사이클 {} {}KST)", sOld, sDup, cycleDate, cycleHour);
            }
            // 기준 사이클보다 "오래된" 사이클의 실패 카운터만 비운다(메모리가 쌓이지 않게).
            // 기준(최신 완전 사이클)보다 새로운 — 지금 한창 받는 — 사이클의 카운터는 남겨야 "연속 3회 실패 포기"가 회차를 넘어 이어진다
            scalarFailures.keySet().removeIf(k -> failureKeyOlderThan(k, cycleDate, cycleHour));
        } catch (Exception e) {
            log.error("[바람길] 스칼라 정리 중 오류 — 바람 정리는 끝남", e);
        }
    }

    /** 실패 카운터 키(`날짜/시/예보시간/변수`)의 사이클이 (cycleDate, cycleHour)보다 오래됐는지. 읽을 수 없는 키는 오래된 것으로 보고 지운다 */
    static boolean failureKeyOlderThan(String key, LocalDate cycleDate, int cycleHour) {
        try {
            String[] p = key.split("/", 3);
            LocalDate d = LocalDate.parse(p[0]);
            int h = Integer.parseInt(p[1]);
            return d.isBefore(cycleDate) || (d.equals(cycleDate) && h < cycleHour);
        } catch (RuntimeException e) {
            return true;
        }
    }

    /**
     * now 시점 기준, 가장 최근 발표 사이클(now 이하의 03·09·15·21시)부터 과거로 count개의 KST 사이클 시각을 반환.
     * 00:00~02:59에는 전날 21시가 첫 후보다.
     */
    static ZonedDateTime[] recentCycles(ZonedDateTime now, int count) {
        ZonedDateTime[] result = new ZonedDateTime[count];
        ZonedDateTime nowKst = now.withZoneSameInstant(KST);
        int idx = -1;
        for (int i = 0; i < CYCLE_HOURS_KST.length; i++) {
            if (CYCLE_HOURS_KST[i] <= nowKst.getHour()) idx = i;
        }
        LocalDate day = nowKst.toLocalDate();
        if (idx < 0) { // 첫 사이클(03시) 전 — 전날의 마지막 사이클부터
            day = day.minusDays(1);
            idx = CYCLE_HOURS_KST.length - 1;
        }
        for (int i = 0; i < count; i++) {
            result[i] = day.atStartOfDay(KST).plusHours(CYCLE_HOURS_KST[idx]);
            idx--;
            if (idx < 0) {
                idx = CYCLE_HOURS_KST.length - 1;
                day = day.minusDays(1);
            }
        }
        return result;
    }

    /** 해당 사이클의 데이터가 실제로 준비됐는지 가볍게 확인 (leadHour=0, Wspd만 조회) */
    private boolean isCycleAvailable(String baseTime) {
        try {
            String url = kmaBaseUrl
                    + "?baseTime=" + baseTime
                    + "&leadHour=0&dataTypeCd=Wspd&dataType=JSON&authKey=" + kmaApiKey;
            HttpRequest request = HttpRequest.newBuilder(URI.create(url))
                    .timeout(Duration.ofSeconds(20))
                    .GET()
                    .build();
            HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() != 200) return false;
            @SuppressWarnings("unchecked")
            Map<String, Object> root = objectMapper.readValue(response.body(), Map.class);
            Map<String, Object> resp = (Map<String, Object>) root.get("response");
            Map<String, Object> header = (Map<String, Object>) resp.get("header");
            return "00".equals(header.get("resultCode"));
        } catch (Exception e) {
            return false;
        }
    }

    private String fetchAndBuildFrame(String baseTime, int leadHour) throws Exception {
        LdapsGrid speedGrid = fetchGrid(baseTime, leadHour, "Wspd");
        LdapsGrid dirGrid = fetchGrid(baseTime, leadHour, "Wdir");
        return buildFrameJson(speedGrid, dirGrid, baseTime, leadHour);
    }

    private String fetchAndBuildScalar(String baseTime, int leadHour, ScalarVar var) throws Exception {
        LdapsGrid g = fetchGrid(baseTime, leadHour, var.kmaCode);
        return buildScalarJson(g, var, baseTime, leadHour);
    }

    private LdapsRegridder.Plan planFor(LdapsGrid g) {
        String key = g.gridKm + "|" + g.x0 + "|" + g.y0 + "|" + g.xdim + "|" + g.ydim + "|" + outputResolutionDeg;
        return plans.computeIfAbsent(key, k -> LdapsRegridder.plan(g.gridKm, g.x0, g.y0, g.xdim, g.ydim, outputResolutionDeg));
    }

    /**
     * 원본 LCC 격자(풍속·풍향) → 위경도 정규 격자 grib2json.
     * <p>역방향 보간: 출력 칸의 위경도를 LCC 순변환(toGrid)해 원본 격자의 소수 좌표를 구하고, 둘러싼 네 원본 점의 U/V를 이중선형으로 섞는다.
     * 네 점 중 값이 없는 점은 빼고 남은 점의 가중치로 다시 나누며, 전부 없거나 원본 격자 밖이면 그 칸은 null(자료 없음)이다.
     * (옛 방식 — 원본 점을 출력 칸에 "던져 넣기" — 은 원본 점 간격이 출력 칸보다 크면 칸이 비어 0 m/s로 남았다.)
     */
    String buildFrameJson(LdapsGrid speedGrid, LdapsGrid dirGrid, String baseTime, int leadHour) throws Exception {
        int xdim = speedGrid.xdim, ydim = speedGrid.ydim;
        if (dirGrid.xdim != xdim || dirGrid.ydim != ydim) throw new IllegalStateException("풍속·풍향 격자 크기가 다름");
        if (speedGrid.values.length < xdim * ydim || dirGrid.values.length < xdim * ydim) throw new IllegalStateException("격자 값 개수 부족");

        // 기상학적 풍향(바람이 불어오는 방향, 북=0, 시계방향) -> U/V 성분. 값이 없으면 NaN
        double[] srcU = new double[xdim * ydim];
        double[] srcV = new double[xdim * ydim];
        for (int k = 0; k < srcU.length; k++) {
            double speed = speedGrid.values[k];
            double dir = dirGrid.values[k];
            if (Double.isNaN(speed) || Double.isNaN(dir)) {
                srcU[k] = Double.NaN;
                srcV[k] = Double.NaN;
                continue;
            }
            double rad = Math.toRadians(270.0 - dir);
            srcU[k] = speed * Math.cos(rad);
            srcV[k] = speed * Math.sin(rad);
        }
        LdapsRegridder.Plan plan = planFor(speedGrid);
        Double[][] out = LdapsRegridder.regrid(plan, srcU, srcV);
        return buildGribJson(plan.nx, plan.ny, plan.lo1, plan.la1, plan.lo2, plan.la2, plan.dx, plan.dy, out[0], out[1], baseTime, leadHour);
    }

    /**
     * 원본 스칼라 격자(기온·습도·강수량) → 위경도 정규 격자, 정수로 양자화한 단일 기록 JSON.
     * <pre>{"header":{lo1,la1,lo2,la2,nx,ny,dx,dy,refTime,forecastTime,var,unit,scale},"data":[정수|null,...]}</pre>
     * 값 = data[i] × scale. 결측 표시값(validMin~validMax 밖)·원본 격자 밖은 null(자료 없음). 습도는 0~100, 강수는 0 이상으로 자른다.
     */
    String buildScalarJson(LdapsGrid g, ScalarVar var, String baseTime, int leadHour) throws Exception {
        int n = g.xdim * g.ydim;
        if (g.values.length < n) throw new IllegalStateException("격자 값 개수 부족");
        double[] src = new double[n];
        for (int k = 0; k < n; k++) {
            double v = g.values[k];
            src[k] = (Double.isNaN(v) || v < var.validMin || v > var.validMax) ? Double.NaN : v;
        }
        LdapsRegridder.Plan plan = planFor(g);
        Double[] out = LdapsRegridder.regrid(plan, src)[0];
        Integer[] q = new Integer[out.length];
        for (int i = 0; i < out.length; i++) {
            Double v = out[i];
            if (v == null) continue;
            double x = v;
            if (!Double.isNaN(var.clampMin) && x < var.clampMin) x = var.clampMin;
            if (!Double.isNaN(var.clampMax) && x > var.clampMax) x = var.clampMax;
            q[i] = (int) Math.round(x / var.scale);
        }
        Map<String, Object> header = new LinkedHashMap<>();
        header.put("lo1", plan.lo1);
        header.put("la1", plan.la1);
        header.put("lo2", plan.lo2);
        header.put("la2", plan.la2);
        header.put("nx", plan.nx);
        header.put("ny", plan.ny);
        header.put("dx", plan.dx);
        header.put("dy", plan.dy);
        header.put("refTime", baseTime);
        header.put("forecastTime", leadHour);
        header.put("var", var.code);
        header.put("unit", var.unit);
        header.put("scale", var.scale);
        Map<String, Object> record = new LinkedHashMap<>();
        record.put("header", header);
        record.put("data", q);
        return objectMapper.writeValueAsString(record);
    }

    private LdapsGrid fetchGrid(String baseTime, int leadHour, String dataTypeCd) throws Exception {
        String url = kmaBaseUrl
                + "?baseTime=" + baseTime
                + "&leadHour=" + leadHour
                + "&dataTypeCd=" + dataTypeCd
                + "&dataType=JSON"
                + "&authKey=" + kmaApiKey;

        HttpRequest request = HttpRequest.newBuilder(URI.create(url))
                .timeout(Duration.ofSeconds(60))
                .GET()
                .build();

        HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
        if (response.statusCode() != 200) {
            throw new RuntimeException("KMA API 호출 실패: HTTP " + response.statusCode() + " (" + dataTypeCd + ")");
        }

        @SuppressWarnings("unchecked")
        Map<String, Object> root = objectMapper.readValue(response.body(), Map.class);
        Map<String, Object> resp = (Map<String, Object>) root.get("response");
        Map<String, Object> header = (Map<String, Object>) resp.get("header");
        if (!"00".equals(header.get("resultCode"))) {
            throw new RuntimeException("KMA API 오류: " + header.get("resultMsg") + " (" + dataTypeCd + ")");
        }
        Map<String, Object> body = (Map<String, Object>) resp.get("body");
        Map<String, Object> items = (Map<String, Object>) body.get("items");
        List<Map<String, Object>> item = (List<Map<String, Object>>) items.get("item");
        Map<String, Object> data = item.get(0);

        LdapsGrid grid = new LdapsGrid();
        grid.gridKm = Double.parseDouble(data.get("gridKm").toString());
        grid.xdim = Integer.parseInt(data.get("xdim").toString());
        grid.ydim = Integer.parseInt(data.get("ydim").toString());
        grid.x0 = Double.parseDouble(data.get("x0").toString());
        grid.y0 = Double.parseDouble(data.get("y0").toString());

        String[] parts = data.get("value").toString().split(",");
        grid.values = new double[parts.length];
        for (int i = 0; i < parts.length; i++) {
            try {
                grid.values[i] = Double.parseDouble(parts[i]);
            } catch (NumberFormatException e) {
                grid.values[i] = Double.NaN;
            }
        }
        return grid;
    }

    private String buildGribJson(int nx, int ny, double lo1, double la1, double lo2, double la2,
                                  double dx, double dy, Double[] uData, Double[] vData,
                                  String baseTime, int leadHour) throws Exception {
        List<Map<String, Object>> result = new java.util.ArrayList<>();
        result.add(gribRecord(nx, ny, lo1, la1, lo2, la2, dx, dy, 2, "U-component_of_wind", uData, baseTime, leadHour));
        result.add(gribRecord(nx, ny, lo1, la1, lo2, la2, dx, dy, 3, "V-component_of_wind", vData, baseTime, leadHour));
        return objectMapper.writeValueAsString(result);
    }

    private Map<String, Object> gribRecord(int nx, int ny, double lo1, double la1, double lo2, double la2,
                                            double dx, double dy, int parameterNumber, String parameterName,
                                            Double[] data, String baseTime, int leadHour) {
        Map<String, Object> header = new LinkedHashMap<>();
        header.put("parameterCategory", 2);
        header.put("parameterNumber", parameterNumber);
        header.put("parameterNumberName", parameterName);
        header.put("parameterUnit", "m.s-1");
        header.put("lo1", lo1);
        header.put("la1", la1);
        header.put("lo2", lo2);
        header.put("la2", la2);
        header.put("nx", nx);
        header.put("ny", ny);
        header.put("dx", dx);
        header.put("dy", dy);
        header.put("refTime", baseTime);
        header.put("forecastTime", leadHour);

        // 풍속 성분은 0.1 m/s 단위면 충분하다(마우스 표시가 소수 1자리, 입자 화면 차이 없음 — 크기가 약 25% 줄어든다). -0.0은 0.0으로.
        // 이미 저장된 프레임은 고치지 않는다(id별 내용 불변). 자료가 없는 칸은 null 그대로 둔다 — JSON null = "값 없음"(풍속 0과 다르다).
        // ol-wind(wind-core Field.isValid)는 null을 무효 칸으로 보고, 입자는 그 칸에서 사라지며 프론트 windAt·오버레이도 null을 "자료 없음"으로 처리한다
        Double[] rounded = new Double[data.length];
        for (int i = 0; i < data.length; i++) rounded[i] = data[i] == null ? null : Math.round(data[i] * 10.0) / 10.0 + 0.0;

        Map<String, Object> record = new HashMap<>();
        record.put("header", header);
        record.put("data", rounded);
        return record;
    }

    static class LdapsGrid {
        double gridKm;
        int xdim, ydim;
        double x0, y0;
        double[] values;
    }
}
