package com.gtp.domain.mymap.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.gtp.domain.mymap.XlsxTestUtil.Fmt;
import com.gtp.domain.mymap.XlsxTestUtil.Formula;
import com.gtp.domain.mymap.config.MyMapImportExecutor;
import com.gtp.domain.mymap.config.MyMapProperties;
import com.gtp.domain.mymap.entity.UserMap;
import com.gtp.domain.mymap.infra.FakePnuParcelProvider;
import com.gtp.domain.mymap.model.ImportMode;
import com.gtp.domain.mymap.port.Coverage;
import com.gtp.domain.mymap.port.ParcelShape;
import com.gtp.domain.mymap.port.PnuParcelProvider;
import com.gtp.domain.mymap.repository.UserMapRepository;
import com.gtp.domain.mymap.service.UserMapImportJob.Request;
import com.gtp.global.exception.CustomException;
import com.gtp.global.gis.GisErrorCode;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.jdbc.core.JdbcTemplate;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.*;
import java.util.concurrent.atomic.AtomicInteger;

import static com.gtp.domain.mymap.XlsxTestUtil.row;
import static com.gtp.domain.mymap.XlsxTestUtil.write;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.*;

/** 가짜 필지(FakePnuParcelProvider) + H2로 가져오기 작업의 사유별 결과·진행률·정리를 확인한다. 운영 DB·전국 데이터는 쓰지 않는다. */
@DataJpaTest
class UserMapImportJobTest {

    static final String OWNER = "alice";
    static final String SEOUL = "1114010300100310000";
    static final String SEJONG = "3611010300107180000";

    @Autowired
    UserMapRepository repo;
    @Autowired
    JdbcTemplate jdbc;
    @TempDir
    Path dir;

    MyMapProperties props;
    FakePnuParcelProvider fake;
    PnuParcelProvider provider;
    UserMapImportStore store;
    ImportGuard guard;
    UserMapImportJob job;

    @BeforeEach
    void setUp() {
        props = new MyMapProperties();
        props.getRef().setSwapPollMillis(5);
        props.getRef().setSwapWaitSeconds(1);
        fake = FakePnuParcelProvider.fromClasspath(new ObjectMapper());
        provider = fake;
        store = spy(new UserMapImportStore(jdbc));
        guard = new ImportGuard();
        rebuild();
    }

    private void rebuild() {
        job = new UserMapImportJob(provider, store, jdbc, props, new MyMapImportExecutor(1, 1), guard);
    }

    // ---------- 도우미 ----------

    private long layer(String kind, int total) {
        UserMap m = repo.saveAndFlush(UserMap.builder().name("t").ownerId(OWNER).sourceType("EXCEL").sourceKind(kind)
                .sourceSrid("EPSG:4326").progressTotal(total).build());
        return m.getId();
    }

    private Path xlsx(List<List<Object>> rows) {
        return write(dir.resolve(UUID.randomUUID() + ".xlsx"), rows);
    }

    private Map<String, Object> layerRow(long id) {
        return jdbc.queryForMap("SELECT * FROM tbl_user_map WHERE id = ?", id);
    }

    private int featureCount(long id) {
        return jdbc.queryForObject("SELECT count(*) FROM tbl_user_map_feature WHERE user_map_id = ?", Integer.class, id);
    }

    private List<Map<String, Object>> features(long id) {
        return jdbc.query("SELECT row_no, pnu, geometry_json, properties_json FROM tbl_user_map_feature WHERE user_map_id = ? ORDER BY row_no, id",
                (rs, i) -> {
                    Map<String, Object> m = new LinkedHashMap<>();
                    m.put("row_no", rs.getObject("row_no"));
                    m.put("pnu", rs.getString("pnu"));
                    m.put("geometry", rs.getString("geometry_json"));
                    m.put("properties", rs.getString("properties_json"));
                    return m;
                }, id);
    }

    private List<Map<String, Object>> failures(long id) {
        return jdbc.query("SELECT row_no, reason_code, input_value, row_json FROM tbl_user_map_import_failure WHERE user_map_id = ? ORDER BY row_no",
                (rs, i) -> {
                    Map<String, Object> m = new LinkedHashMap<>();
                    m.put("row_no", rs.getInt("row_no"));
                    m.put("reason", rs.getString("reason_code"));
                    m.put("input", rs.getString("input_value"));
                    m.put("row_json", rs.getString("row_json"));
                    return m;
                }, id);
    }

    private Request pnuRequest(long id, Path file, int total) {
        return new Request(id, OWNER, ImportMode.PNU, file, total, "PNU", null, null, "EPSG:4326");
    }

    private Request coordRequest(long id, Path file, int total, String srid) {
        return new Request(id, OWNER, ImportMode.COORD, file, total, null, "위도", "경도", srid);
    }

    private Map<String, String> reasons(long id) {
        Map<String, String> m = new LinkedHashMap<>();
        failures(id).forEach(f -> m.put(String.valueOf(f.get("row_no")), (String) f.get("reason")));
        return m;
    }

    private static final ObjectMapper OM = new ObjectMapper();

    // ---------- PNU ----------

    @Test
    void PNU_혼합_파일은_사유별로_정확히_나뉜다() throws Exception {
        List<List<Object>> rows = new ArrayList<>();
        rows.add(row("PNU", "이름", "직원수"));
        rows.add(row(SEOUL, "서울", new Fmt(1100, "#,##0")));            // 2  매칭
        rows.add(row(SEJONG, "세종", 900));                              // 3  매칭
        rows.add(row("1114010300100999990", "없는필지", 1));             // 4  PARCEL_NOT_FOUND
        rows.add(row(new Fmt(1.11401030010031E18, "0"), "숫자서식", 1)); // 5  PNU_NUMERIC_CELL
        rows.add(row("1.11401E+18", "지수", 1));                         // 6  PNU_EXP_NOTATION
        rows.add(row("12345", "짧음", new Fmt(1500, "#,##0")));          // 7  PNU_FORMAT
        rows.add(row(null, "키없음", null));                             // 8  EMPTY
        rows.add(row(null, null, null));                                 // 9  완전히 빈 행 — 건너뜀(실패도 아님)
        rows.add(row(SEOUL, "서울2", 1));                                // 10 중복 PNU — 행마다 피처
        rows.add(row("9999999999199990000", "코드없음", 1));             // 11 OUT_OF_COVERAGE(적재 안 된 시도 99)
        Path file = xlsx(rows);
        long id = layer("EXCEL_PNU", 9);
        assertThat(guard.tryAcquire(OWNER)).isTrue();

        job.execute(pnuRequest(id, file, 9));

        Map<String, Object> l = layerRow(id);
        assertThat(l.get("STATUS")).isEqualTo("READY");
        assertThat(l.get("FEATURE_COUNT")).isEqualTo(3);
        assertThat(l.get("MATCHED_COUNT")).isEqualTo(3);
        assertThat(l.get("FAILED_COUNT")).isEqualTo(6);
        assertThat(l.get("PROGRESS_DONE")).isEqualTo(9);
        assertThat(l.get("PROGRESS_TOTAL")).isEqualTo(9);
        assertThat(l.get("PARCEL_VERSION")).isEqualTo("FAKE");
        assertThat(l.get("GEOM_TYPE")).isEqualTo("POLYGON");
        assertThat(l.get("ERROR_MESSAGE")).isNull();

        assertThat(reasons(id)).containsExactly(
                Map.entry("4", "PARCEL_NOT_FOUND"), Map.entry("5", "PNU_NUMERIC_CELL"), Map.entry("6", "PNU_EXP_NOTATION"),
                Map.entry("7", "PNU_FORMAT"), Map.entry("8", "EMPTY"), Map.entry("11", "OUT_OF_COVERAGE"));

        List<Map<String, Object>> f = features(id);
        assertThat(f).extracting(m -> m.get("row_no")).containsExactly(2, 3, 10);   // 엑셀 행 번호(머리글 = 1)
        assertThat(f).extracting(m -> m.get("pnu")).containsExactly(SEOUL, SEJONG, SEOUL);
        assertThat((String) f.get(0).get("geometry")).startsWith("{\"type\":\"Polygon\"");   // 필지 모양 스냅샷
        JsonNode props0 = OM.readTree((String) f.get(0).get("properties"));
        assertThat(props0.get("PNU").asText()).isEqualTo(SEOUL);
        assertThat(props0.get("이름").asText()).isEqualTo("서울");
        assertThat(props0.get("직원수").asText()).isEqualTo("1100");   // 서식(1,100) 없이 숫자 그대로

        // 실패 행 원본은 엑셀에서 보이던 그대로(고쳐서 다시 올릴 수 있게)
        JsonNode r7 = OM.readTree((String) failures(id).get(3).get("row_json"));
        assertThat(r7.get("직원수").asText()).isEqualTo("1,500");   // 실패 행 원본은 서식 그대로(속성용 값 1500이 아니라)
        JsonNode r8 = OM.readTree((String) failures(id).get(4).get("row_json"));
        assertThat(r8.get("PNU").asText()).isEmpty();
        assertThat(r8.get("이름").asText()).isEqualTo("키없음");
        assertThat(failures(id).get(0).get("input")).isEqualTo("1114010300100999990");

        assertThat(Files.exists(file)).isFalse();            // 처리한 원본은 지운다
        assertThat(guard.isActive(OWNER)).isFalse();         // 자물쇠를 푼다
    }

    @Test
    void 지역_제한_훅을_켜면_목록_밖_시도는_OUT_OF_COVERAGE() {
        props.getRef().setAllowedSidoCodes(List.of("36"));
        Path file = xlsx(List.of(row("PNU", "이름"), row(SEOUL, "서울"), row(SEJONG, "세종")));
        long id = layer("EXCEL_PNU", 2);
        job.execute(pnuRequest(id, file, 2));

        assertThat(layerRow(id).get("STATUS")).isEqualTo("READY");
        assertThat(reasons(id)).containsExactly(Map.entry("2", "OUT_OF_COVERAGE"));
        assertThat(features(id)).extracting(m -> m.get("pnu")).containsExactly(SEJONG);
    }

    @Test
    void 지적도_자료가_없으면_FAILED이고_피처를_남기지_않는다() {
        provider = new PnuParcelProvider() {
            public Map<String, ParcelShape> findByPnus(Collection<String> p) {
                return Map.of();
            }

            public Coverage coverage() {
                return Coverage.unavailable();
            }
        };
        rebuild();
        Path file = xlsx(List.of(row("PNU"), row(SEOUL)));
        long id = layer("EXCEL_PNU", 1);
        job.execute(pnuRequest(id, file, 1));

        Map<String, Object> l = layerRow(id);
        assertThat(l.get("STATUS")).isEqualTo("FAILED");
        assertThat((String) l.get("ERROR_MESSAGE")).contains("준비되지 않았습니다");
        assertThat(featureCount(id)).isZero();
        assertThat(Files.exists(file)).isFalse();
    }

    @Test
    void 매칭이_0건이어도_READY이고_보고서용_실패_행이_남는다() {
        Path file = xlsx(List.of(row("PNU"), row("1114010300100999990"), row("1114010300100999980")));
        long id = layer("EXCEL_PNU", 2);
        job.execute(pnuRequest(id, file, 2));

        Map<String, Object> l = layerRow(id);
        assertThat(l.get("STATUS")).isEqualTo("READY");
        assertThat(l.get("MATCHED_COUNT")).isEqualTo(0);
        assertThat(l.get("FAILED_COUNT")).isEqualTo(2);
        assertThat(l.get("GEOM_TYPE")).isNull();
        assertThat(l.get("PARCEL_VERSION")).isNull();   // 매칭에 쓰인 시도가 없으면 기준월도 없다
        assertThat(failures(id)).hasSize(2);
    }

    @Test
    void 기준월은_매칭에_쓰인_시도의_가장_이른_달() {
        provider = new PnuParcelProvider() {
            public Map<String, ParcelShape> findByPnus(Collection<String> p) {
                return fake.findByPnus(p);
            }

            public Coverage coverage() {
                return new Coverage(Map.of("11", "2026-08", "36", "2026-10", "41", "2026-01"), Set.of());
            }
        };
        rebuild();
        Path file = xlsx(List.of(row("PNU"), row(SEOUL), row(SEJONG)));
        long id = layer("EXCEL_PNU", 2);
        job.execute(pnuRequest(id, file, 2));
        assertThat(layerRow(id).get("PARCEL_VERSION")).isEqualTo("2026-08");   // 41(2026-01)은 쓰이지 않았다
    }

    @Test
    void 행_수_한도_뒤의_행은_처리하지_않고_ROW_LIMIT_하나만_남긴다() {
        props.getLimits().setMaxRowsPnu(3);
        List<List<Object>> rows = new ArrayList<>();
        rows.add(row("PNU"));
        for (int i = 0; i < 6; i++) rows.add(row(SEOUL));
        Path file = xlsx(rows);
        long id = layer("EXCEL_PNU", 6);
        job.execute(pnuRequest(id, file, 6));

        Map<String, Object> l = layerRow(id);
        assertThat(l.get("MATCHED_COUNT")).isEqualTo(3);
        assertThat(l.get("FAILED_COUNT")).isEqualTo(1);
        assertThat(reasons(id)).containsExactly(Map.entry("5", "ROW_LIMIT"));
        assertThat(featureCount(id)).isEqualTo(3);
    }

    @Test
    void 좌표_모드도_행_수_한도_뒤의_행은_ROW_LIMIT_하나만() {
        props.getLimits().setMaxRowsCoord(2);
        List<List<Object>> rows = new ArrayList<>();
        rows.add(row("위도", "경도"));
        for (int i = 0; i < 4; i++) rows.add(row(37.5663, 126.9779));
        long id = layer("EXCEL_COORD", 4);
        job.execute(coordRequest(id, xlsx(rows), 4, "EPSG:4326"));
        assertThat(layerRow(id).get("MATCHED_COUNT")).isEqualTo(2);
        assertThat(reasons(id)).containsExactly(Map.entry("4", "ROW_LIMIT"));
    }

    @Test
    void 진행률은_500행마다_남기고_끝에_정리한다() {
        int n = 1200;
        List<List<Object>> rows = new ArrayList<>();
        rows.add(row("위도", "경도"));
        for (int i = 0; i < n; i++) rows.add(row(37.5663, 126.9779));
        Path file = xlsx(rows);
        long id = layer("EXCEL_COORD", n);
        job.execute(coordRequest(id, file, n, "EPSG:4326"));

        verify(store, times(2)).updateProgress(eq(id), anyInt(), anyInt());   // 500, 1000행에서
        verify(store).updateProgress(id, 500, n);
        verify(store).updateProgress(id, 1000, n);
        Map<String, Object> l = layerRow(id);
        assertThat(l.get("STATUS")).isEqualTo("READY");
        assertThat(l.get("PROGRESS_DONE")).isEqualTo(n);
        assertThat(featureCount(id)).isEqualTo(n);
    }

    @Test
    void PNU_진행률도_500행마다_조회_묶음과_함께_남긴다() {
        int n = 1100;
        List<List<Object>> rows = new ArrayList<>();
        rows.add(row("PNU"));
        for (int i = 0; i < n; i++) rows.add(row(i % 2 == 0 ? SEOUL : SEJONG));
        long id = layer("EXCEL_PNU", n);
        AtomicInteger lookups = new AtomicInteger();
        provider = new PnuParcelProvider() {
            public Map<String, ParcelShape> findByPnus(Collection<String> p) {
                lookups.incrementAndGet();
                return fake.findByPnus(p);
            }

            public Coverage coverage() {
                return fake.coverage();
            }
        };
        rebuild();
        job.execute(pnuRequest(id, xlsx(rows), n));

        verify(store, times(2)).updateProgress(eq(id), anyInt(), anyInt());
        assertThat(lookups.get()).isEqualTo(3);   // 500 + 500 + 100행
        assertThat(layerRow(id).get("MATCHED_COUNT")).isEqualTo(n);
    }

    @Test
    void 시도_파티션_교체중이면_끝날_때까지_기다렸다가_매칭한다() throws Exception {
        fake.setSwapping(Set.of("11"));
        Thread unlock = new Thread(() -> {
            try {
                Thread.sleep(120);
            } catch (InterruptedException ignored) {
            }
            fake.setSwapping(Set.of());
        });
        props.getRef().setSwapWaitSeconds(10);
        Path file = xlsx(List.of(row("PNU"), row(SEOUL)));
        long id = layer("EXCEL_PNU", 1);
        long t0 = System.nanoTime();
        unlock.start();
        job.execute(pnuRequest(id, file, 1));
        unlock.join();

        assertThat((System.nanoTime() - t0) / 1_000_000).isGreaterThanOrEqualTo(100);
        assertThat(layerRow(id).get("STATUS")).isEqualTo("READY");
        assertThat(layerRow(id).get("MATCHED_COUNT")).isEqualTo(1);
    }

    @Test
    void 교체가_끝나지_않으면_기다리다_FAILED() {
        fake.setSwapping(Set.of("11"));
        props.getRef().setSwapWaitSeconds(0);
        Path file = xlsx(List.of(row("PNU"), row(SEOUL)));
        long id = layer("EXCEL_PNU", 1);
        job.execute(pnuRequest(id, file, 1));

        assertThat(layerRow(id).get("STATUS")).isEqualTo("FAILED");
        assertThat((String) layerRow(id).get("ERROR_MESSAGE")).contains("준비되지 않았습니다");
        assertThat(featureCount(id)).isZero();
    }

    @Test
    void 교체중이_아닌_시도만_있으면_기다리지_않는다() {
        fake.setSwapping(Set.of("41"));     // 이 파일과 상관없는 시도
        Path file = xlsx(List.of(row("PNU"), row(SEOUL)));
        long id = layer("EXCEL_PNU", 1);
        props.getRef().setSwapWaitSeconds(0);
        job.execute(pnuRequest(id, file, 1));
        assertThat(layerRow(id).get("STATUS")).isEqualTo("READY");
    }

    // ---------- 좌표 ----------

    @Test
    void 좌표_모드_사유별_결과() throws Exception {
        List<List<Object>> rows = new ArrayList<>();
        rows.add(row("위도", "경도", "이름"));
        rows.add(row(37.5663, 126.9779, "서울"));                          // 2  매칭
        rows.add(row("36.48", "127.289", "세종(문자열 좌표)"));             // 3  매칭
        rows.add(row(null, null, "좌표없음"));                              // 4  EMPTY (예전에는 조용히 건너뜀)
        rows.add(row("abc", 127.0, "글자"));                                // 5  COORD_INVALID
        rows.add(row(126.9, 37.5, "뒤집힘"));                               // 6  COORD_OUT_OF_RANGE
        rows.add(row(new Formula("36+0.48"), 127.289, "수식"));             // 7  매칭(수식 값)
        rows.add(row(0, 0, "영점"));                                        // 8  COORD_OUT_OF_RANGE
        rows.add(row(37.5, null, "경도없음"));                              // 9  COORD_INVALID
        rows.add(row("NaN", 127.0, "엔에이엔"));                            // 10 COORD_INVALID (숫자가 아닌 값)
        rows.add(row(null, null, null));                                    // 11 완전히 빈 행 — 건너뜀(실패도 아님)
        rows.add(row(37.4, 127.1, "마지막"));                               // 12 매칭
        Path file = xlsx(rows);
        long id = layer("EXCEL_COORD", 10);
        job.execute(coordRequest(id, file, 10, "EPSG:4326"));

        Map<String, Object> l = layerRow(id);
        assertThat(l.get("STATUS")).isEqualTo("READY");
        assertThat(l.get("MATCHED_COUNT")).isEqualTo(4);
        assertThat(l.get("FAILED_COUNT")).isEqualTo(6);
        assertThat(l.get("GEOM_TYPE")).isEqualTo("POINT");
        assertThat(l.get("PARCEL_VERSION")).isNull();
        assertThat(reasons(id)).containsExactly(Map.entry("4", "EMPTY"), Map.entry("5", "COORD_INVALID"), Map.entry("6", "COORD_OUT_OF_RANGE"),
                Map.entry("8", "COORD_OUT_OF_RANGE"), Map.entry("9", "COORD_INVALID"), Map.entry("10", "COORD_INVALID"));

        List<Map<String, Object>> f = features(id);
        assertThat(f).extracting(m -> m.get("row_no")).containsExactly(2, 3, 7, 12);
        JsonNode g = OM.readTree((String) f.get(0).get("geometry"));
        assertThat(g.get("type").asText()).isEqualTo("Point");
        assertThat(g.get("coordinates").get(0).asDouble()).isEqualTo(126.9779);
        assertThat(g.get("coordinates").get(1).asDouble()).isEqualTo(37.5663);
        assertThat(f.get(0).get("pnu")).isNull();
        assertThat(failures(id).get(1).get("input")).isEqualTo("abc, 127");
    }

    @Test
    void 좌표_모드_TM_좌표를_4326으로_바꿔_저장한다() throws Exception {
        // GDAL/PROJ로 구한 서울시청 값: 5186 (198047.5268, 551862.8350), 5179 (953892.2108, 1952009.9410), 3857 (14135115.1700, 4518338.4220)
        Object[][] cases = {
                {"EPSG:5186", 551862.8350, 198047.5268},
                {"EPSG:5179", 1952009.9410, 953892.2108},
                {"EPSG:3857", 4518338.4220, 14135115.1700}};
        for (Object[] c : cases) {
            Path file = xlsx(List.of(row("위도", "경도"), row(c[1], c[2])));
            long id = layer("EXCEL_COORD", 1);
            job.execute(coordRequest(id, file, 1, (String) c[0]));
            assertThat(layerRow(id).get("STATUS")).as((String) c[0]).isEqualTo("READY");
            JsonNode g = OM.readTree((String) features(id).get(0).get("geometry"));
            assertThat(g.get("coordinates").get(0).asDouble()).as(c[0] + " lon").isCloseTo(126.9779, org.assertj.core.data.Offset.offset(2e-5));
            assertThat(g.get("coordinates").get(1).asDouble()).as(c[0] + " lat").isCloseTo(37.5663, org.assertj.core.data.Offset.offset(2e-5));
        }
    }

    @Test
    void 좌표_모드_지원하지_않는_좌표계나_없는_컬럼은_FAILED() {
        long id = layer("EXCEL_COORD", 1);
        job.execute(coordRequest(id, xlsx(List.of(row("위도", "경도"), row(37.5, 127.0))), 1, "EPSG:9999"));
        assertThat(layerRow(id).get("STATUS")).isEqualTo("FAILED");
        assertThat((String) layerRow(id).get("ERROR_MESSAGE")).contains("EPSG:9999");

        long id2 = layer("EXCEL_COORD", 1);
        job.execute(new Request(id2, OWNER, ImportMode.COORD, xlsx(List.of(row("a", "b"), row(1, 2))), 1, null, "위도", "경도", "EPSG:4326"));
        assertThat(layerRow(id2).get("STATUS")).isEqualTo("FAILED");
        assertThat((String) layerRow(id2).get("ERROR_MESSAGE")).isEqualTo(GisErrorCode.INVALID_COORDINATE_COLUMN.getMessage());
    }

    // ---------- 실패·정리 ----------

    @Test
    void PNU_컬럼이_머리글에_없으면_FAILED() {
        long id = layer("EXCEL_PNU", 1);
        job.execute(new Request(id, OWNER, ImportMode.PNU, xlsx(List.of(row("A"), row(SEOUL))), 1, "PNU", null, null, "EPSG:4326"));
        assertThat(layerRow(id).get("STATUS")).isEqualTo("FAILED");
        assertThat((String) layerRow(id).get("ERROR_MESSAGE")).isEqualTo("PNU에 쓸 컬럼을 선택하세요.");
    }

    @Test
    void 주소_모드는_FAILED_지원_안_함() {
        long id = layer("EXCEL_ADDRESS", 1);
        job.execute(new Request(id, OWNER, ImportMode.ADDRESS, xlsx(List.of(row("주소"), row("서울"))), 1, null, null, null, "EPSG:4326"));
        assertThat(layerRow(id).get("STATUS")).isEqualTo("FAILED");
    }

    @Test
    void 예상하지_못한_오류는_일반_메시지로_FAILED이고_중간_피처와_실패_행을_지운다() {
        provider = new PnuParcelProvider() {
            public Map<String, ParcelShape> findByPnus(Collection<String> p) {
                throw new IllegalStateException("DB 연결이 끊겼습니다 — 개인 주소 서울시 어딘가 123");
            }

            public Coverage coverage() {
                return fake.coverage();
            }
        };
        rebuild();
        Path file = xlsx(List.of(row("PNU"), row("12345"), row(SEOUL)));
        long id = layer("EXCEL_PNU", 2);
        guard.tryAcquire(OWNER);
        job.execute(pnuRequest(id, file, 2));

        Map<String, Object> l = layerRow(id);
        assertThat(l.get("STATUS")).isEqualTo("FAILED");
        assertThat(l.get("ERROR_MESSAGE")).isEqualTo(UserMapImportJob.GENERIC_FAILURE);    // 내부 오류 문구·행 내용을 사용자에게 내지 않는다
        assertThat(featureCount(id)).isZero();
        assertThat(failures(id)).isEmpty();
        assertThat(Files.exists(file)).isFalse();
        assertThat(guard.isActive(OWNER)).isFalse();
    }

    @Test
    void 중간_묶음에서_실패하면_먼저_넣은_피처와_실패_행도_지운다() {
        AtomicInteger calls = new AtomicInteger();
        provider = new PnuParcelProvider() {
            public Map<String, ParcelShape> findByPnus(Collection<String> p) {
                if (calls.incrementAndGet() >= 2) throw new IllegalStateException("두 번째 묶음에서 DB 오류");
                return fake.findByPnus(p);
            }

            public Coverage coverage() {
                return fake.coverage();
            }
        };
        rebuild();
        List<List<Object>> rows = new ArrayList<>();
        rows.add(row("PNU"));
        rows.add(row("12345"));                                   // 첫 묶음 안의 실패 행(진행률 저장 때 DB에 들어간다)
        for (int i = 0; i < 1200; i++) rows.add(row(SEOUL));
        long id = layer("EXCEL_PNU", 1201);
        job.execute(pnuRequest(id, xlsx(rows), 1201));

        assertThat(calls.get()).isEqualTo(2);
        assertThat(layerRow(id).get("STATUS")).isEqualTo("FAILED");
        assertThat(featureCount(id)).isZero();      // 첫 묶음 피처 499개가 남지 않는다
        assertThat(failures(id)).isEmpty();          // 먼저 저장한 실패 행도 지운다
    }

    @Test
    void 마무리_직전에_레이어가_지워지면_넣어_둔_실패_행을_지운다() {
        Path file = xlsx(List.of(row("PNU"), row("12345"), row(SEOUL)));
        long id = layer("EXCEL_PNU", 2);
        doAnswer(inv -> {
            // 사용자가 삭제(피처 → 레이어 순서) 하는 사이에 작업이 마지막 저장을 시도한다
            jdbc.update("DELETE FROM tbl_user_map_feature WHERE user_map_id = ?", id);
            jdbc.update("DELETE FROM tbl_user_map WHERE id = ?", id);
            return inv.callRealMethod();
        }).when(store).insertFailures(eq(id), org.mockito.ArgumentMatchers.anyList());

        job.execute(pnuRequest(id, file, 2));

        assertThat(failures(id)).isEmpty();
        assertThat(featureCount(id)).isZero();
        verify(store, never()).markFailed(eq(id), org.mockito.ArgumentMatchers.anyString());
    }

    @Test
    void 깨진_엑셀은_FAILED() throws Exception {
        Path bad = dir.resolve("bad.xlsx");
        Files.writeString(bad, "엑셀 아님");
        long id = layer("EXCEL_PNU", 1);
        job.execute(pnuRequest(id, bad, 1));
        assertThat(layerRow(id).get("STATUS")).isEqualTo("FAILED");
        assertThat(Files.exists(bad)).isFalse();
    }

    @Test
    void 가져오는_도중_레이어가_지워졌으면_멈추고_흔적을_지운다() {
        Path file = xlsx(List.of(row("PNU"), row(SEOUL), row("12345")));
        long id = layer("EXCEL_PNU", 2);
        jdbc.update("DELETE FROM tbl_user_map WHERE id = ?", id);   // 사용자가 처리 중에 레이어를 삭제

        job.execute(pnuRequest(id, file, 2));

        assertThat(featureCount(id)).isZero();
        assertThat(failures(id)).isEmpty();
        verify(store, never()).markFailed(eq(id), org.mockito.ArgumentMatchers.anyString()); // 삭제된 레이어를 FAILED로 되살리지 않는다
        assertThat(Files.exists(file)).isFalse();
    }

    @Test
    void 진행률_저장이_레이어_없음을_알리면_중단() {
        int n = 700;
        List<List<Object>> rows = new ArrayList<>();
        rows.add(row("위도", "경도"));
        for (int i = 0; i < n; i++) rows.add(row(37.5663, 126.9779));
        long id = layer("EXCEL_COORD", n);
        doReturn(false).when(store).updateProgress(anyLong(), anyInt(), anyInt());
        job.execute(coordRequest(id, xlsx(rows), n, "EPSG:4326"));

        assertThat(featureCount(id)).isZero();            // 500행에서 멈추고 넣은 피처를 지웠다
        assertThat(layerRow(id).get("STATUS")).isEqualTo("PROCESSING");
    }

    @Test
    void 풀이_가득_차면_submit은_MYMAP_IMPORT_BUSY() throws Exception {
        MyMapImportExecutor full = new MyMapImportExecutor(1, 1);
        java.util.concurrent.CountDownLatch release = new java.util.concurrent.CountDownLatch(1);
        java.util.concurrent.CountDownLatch started = new java.util.concurrent.CountDownLatch(1);
        try {
            full.submit(() -> {
                started.countDown();
                try {
                    release.await();
                } catch (InterruptedException ignored) {
                }
            });
            started.await();
            full.submit(() -> {
            });
            UserMapImportJob j = new UserMapImportJob(provider, store, jdbc, props, full, guard);
            assertThatThrownBy(() -> j.submit(pnuRequest(1, dir.resolve("x.xlsx"), 1)))
                    .isInstanceOfSatisfying(CustomException.class, e -> assertThat(e.getErrorCode()).isEqualTo(GisErrorCode.MYMAP_IMPORT_BUSY));
        } finally {
            release.countDown();
            full.close();
        }
    }

    @Test
    void geometryTypeOf는_GeoJSON_앞부분에서_타입을_읽는다() {
        assertThat(UserMapImportJob.geometryTypeOf("{\"type\":\"MultiPolygon\",\"coordinates\":[]}")).isEqualTo("MULTIPOLYGON");
        assertThat(UserMapImportJob.geometryTypeOf("{\"type\":\"Polygon\"}")).isEqualTo("POLYGON");
        assertThat(UserMapImportJob.geometryTypeOf("{}")).isNull();
    }

    @Test
    void 한국_범위_판정() {
        assertThat(UserMapImportJob.inKorea(126.9779, 37.5663)).isTrue();
        assertThat(UserMapImportJob.inKorea(131.87, 37.24)).isTrue();   // 독도
        assertThat(UserMapImportJob.inKorea(126.27, 33.12)).isTrue();   // 마라도 부근
        assertThat(UserMapImportJob.inKorea(37.5, 126.9)).isFalse();    // 뒤집힘
        assertThat(UserMapImportJob.inKorea(0, 0)).isFalse();
        assertThat(UserMapImportJob.inKorea(Double.NaN, 37)).isFalse();
        // 경계: 한 쪽만 벗어나도 밖이다
        assertThat(UserMapImportJob.inKorea(122.9, 37)).isFalse();
        assertThat(UserMapImportJob.inKorea(133.1, 37)).isFalse();
        assertThat(UserMapImportJob.inKorea(127, 31.9)).isFalse();
        assertThat(UserMapImportJob.inKorea(127, 40.1)).isFalse();
        assertThat(UserMapImportJob.inKorea(123, 32)).isTrue();
        assertThat(UserMapImportJob.inKorea(133, 40)).isTrue();
    }
}
