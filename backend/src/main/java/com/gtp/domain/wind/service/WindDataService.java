package com.gtp.domain.wind.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.gtp.domain.wind.entity.WindFrameEntity;
import com.gtp.domain.wind.repository.WindFrameRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

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
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 기상청 API허브의 국지예보모델(LDAPS, 1km 격자) 풍속/풍향 데이터를 받아
 * U/V 성분으로 변환하고, Lambert Conformal Conic 격자를 위경도 정규 격자로
 * 리샘플링한 뒤 ol-wind가 바로 소비할 수 있는 grib2json 포맷 JSON으로 저장한다.
 * LDAPS는 하루 4회(KST 03/09/15/21시) 생산되며, forecastHour(leadHour) 0~5를
 * 시간별 프레임으로 저장해두면 프론트에서 매시간 다음 프레임으로 넘어가며 보여줄 수 있다.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class WindDataService {

    private static final ZoneId KST = ZoneId.of("Asia/Seoul");
    private static final int[] CYCLE_HOURS_KST = {3, 9, 15, 21};

    private final WindFrameRepository windFrameRepository;
    private final ObjectMapper objectMapper = new ObjectMapper();

    @Value("${kma.api-key}")
    private String kmaApiKey;

    @Value("${kma.base-url:https://apihub.kma.go.kr/api/typ02/openApi/KIMModelInfoService/getKIMLdapsUnisAll}")
    private String kmaBaseUrl;

    @Value("${wind.forecast-hours}")
    private int forecastHours;

    /* 출력(리샘플링 결과) 격자 해상도(도). 0.05도 ≈ 5km */
    @Value("${wind.output.resolution-deg:0.05}")
    private double outputResolutionDeg;

    /* 원본 LDAPS(1km, 637x793) 격자를 그대로 쓰면 50만 점이라 너무 크다.
       인덱스 기준으로 이 간격만큼 건너뛰며 샘플링한다. */
    @Value("${wind.source-stride:3}")
    private int sourceStride;

    private final HttpClient httpClient = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(15))
            .followRedirects(HttpClient.Redirect.NORMAL)
            .build();

    /* LDAPS는 KST 03/09/15/21시에 생산된다. 생산 후 다운로드 가능해지기까지의
       지연을 감안해 각 사이클 + 1시간 뒤에 갱신을 시도한다. */
    @Scheduled(cron = "0 30 4,10,16,22 * * *", zone = "Asia/Seoul")
    public void scheduledRefresh() {
        try {
            refresh();
        } catch (Exception e) {
            log.error("[바람길] LDAPS 데이터 갱신 실패", e);
        }
    }

    @Transactional
    public void refresh() {
        ZonedDateTime[] candidates = recentCycles(ZonedDateTime.now(KST), 8);

        ZonedDateTime chosen = null;
        for (ZonedDateTime candidate : candidates) {
            LocalDate d = candidate.toLocalDate();
            int h = candidate.getHour();
            if (windFrameRepository.existsByCycleDateAndCycleHour(d, h)) {
                log.info("[바람길] 이미 최신 LDAPS 사이클({} {}KST) 데이터가 있어 건너뜀", d, h);
                return;
            }
            String probeBaseTime = d.format(DateTimeFormatter.BASIC_ISO_DATE) + String.format("%02d00", h);
            if (isCycleAvailable(probeBaseTime)) {
                chosen = candidate;
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
        String baseTime = cycleDate.format(DateTimeFormatter.BASIC_ISO_DATE) + String.format("%02d00", cycleHour);

        for (int leadHour = 0; leadHour < forecastHours; leadHour++) {
            try {
                String json = fetchAndBuildFrame(baseTime, leadHour);

                ZonedDateTime validKst = cycleDate.atStartOfDay(KST).plusHours(cycleHour + leadHour);
                LocalDateTime validUtc = validKst.withZoneSameInstant(ZoneOffset.UTC).toLocalDateTime();

                windFrameRepository.save(WindFrameEntity.builder()
                        .cycleDate(cycleDate)
                        .cycleHour(cycleHour)
                        .forecastHour(leadHour)
                        .validTime(validUtc)
                        .dataJson(json)
                        .build());
            } catch (Exception e) {
                log.error("[바람길] leadHour {} 프레임 처리 실패", leadHour, e);
            }
        }

        windFrameRepository.deleteAllExceptCycle(cycleDate, cycleHour);
        log.info("[바람길] LDAPS {} {}KST 사이클 갱신 완료", cycleDate, cycleHour);
    }

    /** now 시점 기준, 최신 사이클부터 과거로 count개의 KST 사이클 시각을 반환 */
    private ZonedDateTime[] recentCycles(ZonedDateTime now, int count) {
        ZonedDateTime[] result = new ZonedDateTime[count];
        ZonedDateTime cursor = now.withMinute(0).withSecond(0).withNano(0);
        int hour = cursor.getHour();
        int cycleHour = CYCLE_HOURS_KST[0];
        for (int h : CYCLE_HOURS_KST) {
            if (h <= hour) cycleHour = h;
        }
        cursor = cursor.withHour(cycleHour);
        if (hour < CYCLE_HOURS_KST[0]) {
            cursor = cursor.minusDays(1);
        }

        for (int i = 0; i < count; i++) {
            result[i] = cursor;
            int idx = indexOf(cycleHour);
            if (idx == 0) {
                cursor = cursor.minusDays(1).withHour(CYCLE_HOURS_KST[CYCLE_HOURS_KST.length - 1]);
                cycleHour = CYCLE_HOURS_KST[CYCLE_HOURS_KST.length - 1];
            } else {
                cycleHour = CYCLE_HOURS_KST[idx - 1];
                cursor = cursor.withHour(cycleHour);
            }
        }
        return result;
    }

    private int indexOf(int cycleHour) {
        for (int i = 0; i < CYCLE_HOURS_KST.length; i++) {
            if (CYCLE_HOURS_KST[i] == cycleHour) return i;
        }
        return 0;
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

        LccProjection projection = new LccProjection(speedGrid.gridKm, speedGrid.x0, speedGrid.y0);

        double minLon = Double.MAX_VALUE, maxLon = -Double.MAX_VALUE;
        double minLat = Double.MAX_VALUE, maxLat = -Double.MAX_VALUE;

        int sampledCols = (speedGrid.xdim + sourceStride - 1) / sourceStride;
        int sampledRows = (speedGrid.ydim + sourceStride - 1) / sourceStride;
        double[] sampledLon = new double[sampledCols * sampledRows];
        double[] sampledLat = new double[sampledCols * sampledRows];
        double[] sampledU = new double[sampledCols * sampledRows];
        double[] sampledV = new double[sampledCols * sampledRows];
        int sampledCount = 0;

        for (int j = 0; j < speedGrid.ydim; j += sourceStride) {
            for (int i = 0; i < speedGrid.xdim; i += sourceStride) {
                int srcIdx = j * speedGrid.xdim + i;
                double speed = speedGrid.values[srcIdx];
                double dir = dirGrid.values[srcIdx];
                if (Double.isNaN(speed) || Double.isNaN(dir)) continue;

                double[] lonLat = projection.toLonLat(i, j);
                double lon = lonLat[0], lat = lonLat[1];

                // 기상학적 풍향(바람이 불어오는 방향, 북=0, 시계방향) -> U/V 성분
                double rad = Math.toRadians(270.0 - dir);
                double u = speed * Math.cos(rad);
                double v = speed * Math.sin(rad);

                sampledLon[sampledCount] = lon;
                sampledLat[sampledCount] = lat;
                sampledU[sampledCount] = u;
                sampledV[sampledCount] = v;
                sampledCount++;

                if (lon < minLon) minLon = lon;
                if (lon > maxLon) maxLon = lon;
                if (lat < minLat) minLat = lat;
                if (lat > maxLat) maxLat = lat;
            }
        }

        double dx = outputResolutionDeg;
        double dy = outputResolutionDeg;
        int nx = (int) Math.round((maxLon - minLon) / dx) + 1;
        int ny = (int) Math.round((maxLat - minLat) / dy) + 1;
        double la1 = maxLat; // 북쪽부터
        double lo1 = minLon; // 서쪽부터

        double[] outU = new double[nx * ny];
        double[] outV = new double[nx * ny];
        boolean[] filled = new boolean[nx * ny];

        for (int k = 0; k < sampledCount; k++) {
            int col = (int) Math.round((sampledLon[k] - lo1) / dx);
            int row = (int) Math.round((la1 - sampledLat[k]) / dy);
            if (col < 0 || col >= nx || row < 0 || row >= ny) continue;
            int outIdx = row * nx + col;
            outU[outIdx] = sampledU[k];
            outV[outIdx] = sampledV[k];
            filled[outIdx] = true;
        }

        return buildGribJson(nx, ny, lo1, la1, minLon + (nx - 1) * dx, maxLat - (ny - 1) * dy, dx, dy, outU, outV, baseTime, leadHour);
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
                                  double dx, double dy, double[] uData, double[] vData,
                                  String baseTime, int leadHour) throws Exception {
        List<Map<String, Object>> result = new java.util.ArrayList<>();
        result.add(gribRecord(nx, ny, lo1, la1, lo2, la2, dx, dy, 2, "U-component_of_wind", uData, baseTime, leadHour));
        result.add(gribRecord(nx, ny, lo1, la1, lo2, la2, dx, dy, 3, "V-component_of_wind", vData, baseTime, leadHour));
        return objectMapper.writeValueAsString(result);
    }

    private Map<String, Object> gribRecord(int nx, int ny, double lo1, double la1, double lo2, double la2,
                                            double dx, double dy, int parameterNumber, String parameterName,
                                            double[] data, String baseTime, int leadHour) {
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

        Map<String, Object> record = new HashMap<>();
        record.put("header", header);
        record.put("data", data);
        return record;
    }

    private static class LdapsGrid {
        double gridKm;
        int xdim, ydim;
        double x0, y0;
        double[] values;
    }
}
