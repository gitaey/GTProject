package com.gtp.domain.mymap.service;

import com.gtp.domain.mymap.config.MyMapProperties;
import com.gtp.domain.mymap.dto.RefStatusResponse;
import com.gtp.domain.mymap.dto.RefStatusResponse.Coverage;
import com.gtp.domain.mymap.dto.RefStatusResponse.RefDataset;
import com.gtp.domain.mymap.port.RefLoadMetaReader;
import com.gtp.domain.mymap.port.RefLoadMetaReader.LoadRecord;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.time.Clock;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.OffsetDateTime;
import java.time.YearMonth;
import java.time.ZoneId;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * U27 참조 자료 적재 상태 — "이 지도의 건물·지적 자료가 언제 기준인가". 적재 기록(ref.load_meta)만 읽는다(SELECT 1회).
 * 기록을 읽지 못하면 예외 대신 4개 항목 모두 UNAVAILABLE로 답한다(설정 패널이 "읽지 못함"으로 보여 준다).
 */
@Slf4j
@Service
public class RefStatusService {

    public static final ZoneId KST = ZoneId.of("Asia/Seoul");

    static final String READY = "READY";
    static final String SWAPPING = "SWAPPING";
    static final String PARTIAL = "PARTIAL";
    static final String MISSING = "MISSING";
    static final String UNAVAILABLE = "UNAVAILABLE";

    private static final String SOURCE_ADDRESS = "행정안전부 도로명주소 건물DB 전체분(juso.go.kr)";
    private static final String SOURCE_PARCEL = "국토교통부 연속지적도형정보(브이월드 데이터 다운로드)";
    private static final String CYCLE = "매월";

    private final RefLoadMetaReader reader;
    private final MyMapProperties props;
    private final Clock clock;

    @Autowired
    public RefStatusService(RefLoadMetaReader reader, MyMapProperties props) {
        this(reader, props, Clock.system(KST));
    }

    /** 시각을 고정해 판정하는 시험용(스프링은 위의 @Autowired 생성자를 쓴다) */
    public RefStatusService(RefLoadMetaReader reader, MyMapProperties props, Clock clock) {
        this.reader = reader;
        this.props = props;
        this.clock = clock;
    }

    /** 항목 정의: id · 이름 · 적재 기록 dataset 값(parcel이면 null) · 출처 · 오래됨 기준 일수 */
    private record Def(String id, String label, String dataset, String source, int staleDays, boolean parcel) {
    }

    private List<Def> defs() {
        MyMapProperties.Ref ref = props.getRef();
        MyMapProperties.Address a = ref.getAddress();
        int addr = ref.getStaleDays().getAddress();
        return List.of(
                new Def("building", "도로명주소 건물DB", RefLoadMetaReader.datasetOf(a.getBuildingTable()), SOURCE_ADDRESS, addr, false),
                new Def("road-code", "도로명코드", RefLoadMetaReader.datasetOf(a.getRoadCodeTable()), SOURCE_ADDRESS, addr, false),
                new Def("related-jibun", "관련지번", RefLoadMetaReader.datasetOf(a.getRelatedJibunTable()), SOURCE_ADDRESS, addr, false),
                new Def("parcel", "연속지적도", RefLoadMetaReader.PARCEL, SOURCE_PARCEL, ref.getStaleDays().getParcel(), true));
    }

    public RefStatusResponse status() {
        OffsetDateTime now = OffsetDateTime.now(clock).withNano(0);
        LocalDate today = LocalDate.now(clock);
        List<Def> defs = defs();
        List<LoadRecord> records = null;
        try {
            records = reader.records();
        } catch (RuntimeException e) {
            // 표가 없거나 DB가 막혔다 — 이 응답 하나만 "읽지 못함"으로 하고 앱은 정상. 메시지에 접속 정보가 섞일 수 있어 클래스 이름만 남긴다
            log.warn("[나만의지도] 참조 자료 적재 기록을 읽지 못했습니다(load_meta): {}", e.getClass().getSimpleName());
        }
        List<RefDataset> out = new ArrayList<>(defs.size());
        for (Def d : defs) {
            if (records == null) {
                out.add(empty(d, UNAVAILABLE, null));
                continue;
            }
            List<LoadRecord> mine = records.stream().filter(r -> d.dataset().equals(r.dataset())).toList();
            out.add(d.parcel() ? parcel(d, mine, today) : single(d, mine, today));
        }
        return new RefStatusResponse(now, out);
    }

    // ---------------------------------------------------------------- 항목 만들기

    /** 기록이 없거나 읽지 못한 항목: 값은 모두 null, stale=false */
    private RefDataset empty(Def d, String status, Coverage coverage) {
        return new RefDataset(d.id(), d.label(), d.source(), CYCLE, status, null, null, null, null, null, false, d.staleDays(), coverage);
    }

    private static boolean known(LoadRecord r) {
        return READY.equalsIgnoreCase(r.status()) || SWAPPING.equalsIgnoreCase(r.status());
    }

    /** 주소 3종: 데이터셋당 한 줄(sido '00'). 여러 줄이면 기준월이 가장 늦은 줄(같으면 적재 시각이 늦은 줄) */
    private RefDataset single(Def d, List<LoadRecord> mine, LocalDate today) {
        if (mine.isEmpty()) return empty(d, MISSING, null);
        List<LoadRecord> usable = mine.stream().filter(RefStatusService::known).toList();
        if (usable.isEmpty()) return empty(d, UNAVAILABLE, null);   // READY·SWAPPING이 아닌 모르는 상태값뿐
        LoadRecord best = usable.stream().max(Comparator
                .comparing((LoadRecord r) -> nz(r.version()))
                .thenComparing(r -> r.loadedAt() == null ? LocalDateTime.MIN : r.loadedAt())).orElseThrow();
        String status = SWAPPING.equalsIgnoreCase(best.status()) ? SWAPPING : READY;
        String version = blankToNull(best.version());
        return new RefDataset(d.id(), d.label(), d.source(), CYCLE, status, version, version, best.baseDate(), toKst(best.loadedAt()),
                best.rowCount(), stale(best.baseDate(), version, d.staleDays(), today), d.staleDays(), null);
    }

    /** 연속지적도: 시도별 한 줄. 기준월·기준일은 가장 이른 값, 적재 시각은 가장 늦은 값, 행 수는 합계 */
    private RefDataset parcel(Def d, List<LoadRecord> mine, LocalDate today) {
        MyMapProperties.Ref ref = props.getRef();
        List<String> expected = ref.getExpectedSidoCodes();
        List<String> restricted = ref.getAllowedSidoCodes();
        // 지역 제한이 있으면 그 지역만 "기대"한다(의도한 일부 적재를 PARTIAL로 보이지 않게)
        List<String> target = restricted.isEmpty() ? expected : expected.stream().filter(restricted::contains).toList();
        if (mine.isEmpty()) return empty(d, MISSING, new Coverage(0, target.size(), false));
        List<LoadRecord> usable = mine.stream().filter(RefStatusService::known).filter(r -> r.sido() != null).toList();
        if (usable.isEmpty()) return empty(d, UNAVAILABLE, null);

        Map<String, String> versions = new HashMap<>();
        Set<String> swapping = new HashSet<>();
        for (LoadRecord r : usable) {
            versions.put(r.sido(), nz(r.version()));
            if (SWAPPING.equalsIgnoreCase(r.status())) swapping.add(r.sido());
        }
        com.gtp.domain.mymap.port.Coverage cov = new com.gtp.domain.mymap.port.Coverage(versions, swapping);
        int loadedExpected = (int) target.stream().filter(versions::containsKey).count();
        String status = !swapping.isEmpty() ? SWAPPING
                : (!target.isEmpty() && loadedExpected < target.size()) ? PARTIAL : READY;

        String earliest = usable.stream().map(r -> blankToNull(r.version())).filter(v -> v != null).min(Comparator.naturalOrder()).orElse(null);
        String latest = usable.stream().map(r -> blankToNull(r.version())).filter(v -> v != null).max(Comparator.naturalOrder()).orElse(null);
        LocalDate baseDate = usable.stream().map(LoadRecord::baseDate).filter(x -> x != null).min(Comparator.naturalOrder()).orElse(null);
        LocalDateTime loaded = usable.stream().map(LoadRecord::loadedAt).filter(x -> x != null).max(Comparator.naturalOrder()).orElse(null);
        Long rows = null;
        for (LoadRecord r : usable) {
            if (r.rowCount() != null) rows = (rows == null ? 0L : rows) + r.rowCount();
        }
        Coverage coverage = new Coverage(loadedExpected, target.size(), cov.isNationwide(expected, restricted));
        return new RefDataset(d.id(), d.label(), d.source(), CYCLE, status, earliest, latest, baseDate, toKst(loaded), rows,
                stale(baseDate, earliest, d.staleDays(), today), d.staleDays(), coverage);
    }

    // ---------------------------------------------------------------- 날짜

    /**
     * 오래됨: 기준일(없으면 기준월의 말일)에서 오늘까지가 staleDays를 <b>넘으면</b> true(딱 그 일수는 아님).
     * 기준일도 기준월도 읽을 수 없으면 판단하지 않는다(false).
     */
    static boolean stale(LocalDate baseDate, String version, int staleDays, LocalDate today) {
        LocalDate ref = baseDate;
        if (ref == null && version != null) {
            try {
                ref = YearMonth.parse(version).atEndOfMonth();
            } catch (RuntimeException e) {
                return false;
            }
        }
        return ref != null && ChronoUnit.DAYS.between(ref, today) > staleDays;
    }

    /** 적재 기록의 timestamp(시간대 없음)는 서버 한국 시각으로 본다 */
    private static OffsetDateTime toKst(LocalDateTime t) {
        return t == null ? null : t.atZone(KST).toOffsetDateTime().withNano(0);
    }

    private static String nz(String s) {
        return s == null ? "" : s;
    }

    private static String blankToNull(String s) {
        return s == null || s.isBlank() ? null : s.trim();
    }
}
