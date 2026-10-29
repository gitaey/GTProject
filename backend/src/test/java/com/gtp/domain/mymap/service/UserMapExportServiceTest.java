package com.gtp.domain.mymap.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.gtp.domain.mymap.FakeShareDirectory;
import com.gtp.domain.mymap.entity.UserMap;
import com.gtp.domain.mymap.entity.UserMapPermissionAccess;
import com.gtp.domain.mymap.entity.UserMapUserAccess;
import com.gtp.domain.mymap.infra.InMemoryAddressRefReader;
import com.gtp.domain.mymap.infra.TableAddressResolver;
import com.gtp.domain.mymap.port.AddressResolver;
import com.gtp.domain.mymap.port.PnuParcelProvider;
import com.gtp.domain.mymap.repository.*;
import com.gtp.domain.mymap.service.UserMapExportService.Format;
import com.gtp.domain.mymap.service.UserMapExportService.Prepared;
import com.gtp.domain.mymap.service.UserMapImportStore.FailureRow;
import com.gtp.domain.mymap.util.CoordinateTransformUtil;
import com.gtp.global.exception.CustomException;
import com.gtp.global.gis.GisErrorCode;
import jakarta.persistence.EntityManager;
import org.apache.poi.ss.usermodel.Cell;
import org.apache.poi.ss.usermodel.Row;
import org.apache.poi.ss.usermodel.Sheet;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.locationtech.jts.geom.Coordinate;
import org.locationtech.jts.geom.GeometryFactory;
import org.locationtech.jts.geom.Polygon;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.PreparedStatementCreator;
import org.springframework.jdbc.core.RowCallbackHandler;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.OutputStream;
import java.util.ArrayList;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.assertj.core.api.Assertions.within;

/** 레이어 내보내기: 권한(geojson과 동일)·엑셀 열/값·GeoJSON 좌표 변환·실패 행·파일 이름·대용량 스트리밍. H2에서 돈다. */
@DataJpaTest
class UserMapExportServiceTest {

    static final String L_SHAPE = "{\"type\":\"Polygon\",\"coordinates\":[[[127.000,37.500],[127.010,37.500],[127.010,37.502],"
            + "[127.002,37.502],[127.002,37.510],[127.000,37.510],[127.000,37.500]]]}";
    static final String POINT = "{\"type\":\"Point\",\"coordinates\":[127.1,37.2]}";
    static final String SCHEMA = "{\"v\":1,\"rowCount\":2,\"truncated\":false,\"columns\":[{\"name\":\"이름\",\"kind\":\"text\"},{\"name\":\"주소\",\"kind\":\"text\"}]}";

    @Autowired
    UserMapRepository repo;
    @Autowired
    UserMapFeatureRepository featureRepo;
    @Autowired
    UserMapImportFailureRepository failureRepo;
    @Autowired
    UserMapUserAccessRepository userAccess;
    @Autowired
    UserMapPermissionAccessRepository permAccess;
    @Autowired
    EntityManager em;
    @Autowired
    JdbcTemplate jdbc;

    UserMapExportService export;
    UserMapService mapService;
    UserMapImportStore store;
    UserMap pnuLayer;

    @BeforeEach
    void setUp() {
        UserMapPermissionService perm = new UserMapPermissionService(userAccess, permAccess, em);
        UserMapShareService share = new UserMapShareService(repo, userAccess, permAccess, FakeShareDirectory.standard());
        MyMapColumnService columns = new MyMapColumnService(repo, perm, jdbc);
        mapService = new UserMapService(repo, featureRepo, failureRepo, perm, columns, jdbc, share);
        InMemoryAddressRefReader reader = new InMemoryAddressRefReader("2026-09")
                .legalDong("1114010300", "서울특별시", "중구", "태평로1가", "");
        AddressResolver resolver = new TableAddressResolver(reader, 5);
        export = new UserMapExportService(mapService, columns, failureRepo, resolver, jdbc);
        store = new UserMapImportStore(jdbc);

        pnuLayer = ready("서울 필지", "alice", "EXCEL_ADDRESS");
        addFeature(pnuLayer, L_SHAPE, "{\"이름\":\"가\",\"주소\":\"=HYPERLINK(1)\"}", "1114010300100310000", 2);
        addFeature(pnuLayer, POINT, "{\"이름\":\"나\"}", null, 3);
    }

    // ---------- 도우미 ----------

    private UserMap ready(String name, String owner, String sourceKind) {
        UserMap m = repo.saveAndFlush(UserMap.builder().name(name).ownerId(owner).sourceType("EXCEL").sourceKind(sourceKind).sourceSrid("EPSG:4326").build());
        jdbc.update("UPDATE tbl_user_map SET status = 'READY', column_schema = ?, feature_count = 2 WHERE id = ?", SCHEMA, m.getId());
        em.clear();
        return repo.findById(m.getId()).orElseThrow();
    }

    private void addFeature(UserMap m, String geometry, String properties, String pnu, Integer rowNo) {
        jdbc.update("INSERT INTO tbl_user_map_feature (user_map_id, geometry_json, properties_json, pnu, row_no) VALUES (?, ?, ?, ?, ?)",
                m.getId(), geometry, properties, pnu, rowNo);
    }

    private Prepared prepare(UserMap m, String user, String format, String srid, boolean failed) {
        return export.prepare(m.getId(), user, List.of(), format, srid, failed);
    }

    private byte[] stream(Prepared p) {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        export.stream(p, () -> {
        }, out);
        return out.toByteArray();
    }

    private static XSSFWorkbook open(byte[] b) throws IOException {
        return new XSSFWorkbook(new ByteArrayInputStream(b));
    }

    private static String str(Row row, int col) {
        Cell c = row.getCell(col);
        if (c == null) return "";
        return c.getCellType().name().equals("NUMERIC") ? String.valueOf(c.getNumericCellValue()) : c.getStringCellValue();
    }

    private static List<String> headerOf(Sheet s) {
        List<String> out = new ArrayList<>();
        for (Cell c : s.getRow(0)) out.add(c.getStringCellValue());
        return out;
    }

    private static CustomException caught(Runnable r) {
        try {
            r.run();
        } catch (CustomException e) {
            return e;
        }
        throw new AssertionError("CustomException이 나야 합니다");
    }

    // ---------- 권한: geojson과 동일 ----------

    @Test
    void 소유자와_공유받은_사람만_받을_수_있다() {
        userAccess.saveAndFlush(UserMapUserAccess.builder().userId("bob").userMap(pnuLayer).build());
        em.clear();
        assertThat(prepare(pnuLayer, "alice", "xlsx", "4326", false).map().getId()).isEqualTo(pnuLayer.getId());
        assertThat(prepare(pnuLayer, "bob", "geojson", "4326", false)).isNotNull();   // 공유받은 사람

        CustomException other = caught(() -> prepare(pnuLayer, "mallory", "xlsx", "4326", false));
        assertThat(other.getErrorCode()).isEqualTo(GisErrorCode.USER_MAP_FORBIDDEN);
        // geojson 보기와 같은 판정·같은 코드
        CustomException viaGeojson = caught(() -> mapService.assertCanStreamGeoJson(pnuLayer.getId(), "mallory", List.of()));
        assertThat(other.getErrorCode()).isEqualTo(viaGeojson.getErrorCode());
        assertThat(other.getMessage()).isEqualTo(viaGeojson.getMessage());
    }

    @Test
    void 역할로_공유받은_사람도_받을_수_있다() {
        permAccess.saveAndFlush(UserMapPermissionAccess.builder().roleCode("EDITOR").userMap(pnuLayer).build());
        em.clear();
        assertThat(export.prepare(pnuLayer.getId(), "carol", List.of("EDITOR"), "xlsx", "4326", false)).isNotNull();
        assertThat(caught(() -> export.prepare(pnuLayer.getId(), "carol", List.of("VIEWER"), "xlsx", "4326", false)).getErrorCode())
                .isEqualTo(GisErrorCode.USER_MAP_FORBIDDEN);
    }

    @Test
    void 없는_레이어는_404_처리_중이면_409() {
        assertThat(caught(() -> export.prepare(999_999L, "alice", List.of(), "xlsx", "4326", false)).getErrorCode())
                .isEqualTo(GisErrorCode.USER_MAP_NOT_FOUND);
        UserMap processing = repo.saveAndFlush(UserMap.builder().name("처리중").ownerId("alice").sourceType("EXCEL").sourceSrid("EPSG:4326").build());
        assertThat(caught(() -> prepare(processing, "alice", "xlsx", "4326", false)).getErrorCode()).isEqualTo(GisErrorCode.USER_MAP_NOT_READY);
        assertThat(caught(() -> prepare(processing, "alice", "geojson", "4326", false)).getErrorCode()).isEqualTo(GisErrorCode.USER_MAP_NOT_READY);
    }

    // ---------- 요청 값 ----------

    @Test
    void 형식과_좌표계_검사() {
        assertThat(caught(() -> prepare(pnuLayer, "alice", "csv", "4326", false)).getErrorCode()).isEqualTo(GisErrorCode.MYMAP_EXPORT_FORMAT_INVALID);
        assertThat(caught(() -> prepare(pnuLayer, "alice", "shp", "4326", false)).getErrorCode()).isEqualTo(GisErrorCode.MYMAP_EXPORT_FORMAT_INVALID);
        assertThat(caught(() -> prepare(pnuLayer, "alice", "xlsx", "5185", false)).getErrorCode()).isEqualTo(GisErrorCode.MYMAP_SRID_UNSUPPORTED);
        assertThat(caught(() -> prepare(pnuLayer, "alice", "xlsx", "abc", false)).getErrorCode()).isEqualTo(GisErrorCode.MYMAP_SRID_UNSUPPORTED);
        for (String ok : new String[]{"4326", "5186", "5179", "3857", "EPSG:5186", "epsg:3857", "", null}) {
            assertThat(prepare(pnuLayer, "alice", "XLSX", ok, false)).as(String.valueOf(ok)).isNotNull();
        }
        assertThat(UserMapExportService.parseSrid("EPSG:5186")).isEqualTo(5186);
        assertThat(UserMapExportService.parseSrid(null)).isEqualTo(4326);
    }

    @Test
    void 파일_이름은_안전하게() {
        String name = UserMapExportService.fileName("내 \"레이어\"/../a\\b:c*?<>|\r\nSet-Cookie: x=1;%0d", Format.XLSX);
        assertThat(name).matches("[^\"\\\\/:*?<>|\r\n;%]+_\\d{8}\\.xlsx").doesNotContain("..\\").doesNotContain("/");
        assertThat(name).doesNotContain("\r").doesNotContain("\n").doesNotContain("\"");
        assertThat(UserMapExportService.fileName("강남 필지", Format.GEOJSON)).matches("강남 필지_\\d{8}\\.geojson");
        assertThat(UserMapExportService.fileName("", Format.XLSX)).startsWith("layer_");
        assertThat(UserMapExportService.fileName("...", Format.XLSX)).startsWith("layer_");
        assertThat(UserMapExportService.fileName("가".repeat(300), Format.XLSX).length()).isLessThan(100);
        assertThat(UserMapExportService.fileName(null, Format.GEOJSON)).startsWith("layer_");
        // 80자 절단은 코드포인트 기준 — 서로게이트 쌍(이모지 등)을 가르지 않는다
        String emoji = UserMapExportService.fileName("\uD83D\uDE00".repeat(100), Format.XLSX);
        String stem = emoji.substring(0, emoji.lastIndexOf("_"));
        assertThat(stem.codePointCount(0, stem.length())).isEqualTo(80);
        for (int i = 0; i < stem.length(); i++) {
            if (Character.isHighSurrogate(stem.charAt(i))) assertThat(Character.isLowSurrogate(stem.charAt(i + 1))).isTrue();
        }
        // 헤더로 나가는 값(Content-Disposition)에도 줄바꿈·따옴표가 없다
        String header = org.springframework.http.ContentDisposition.attachment()
                .filename(UserMapExportService.fileName("a\r\nX-Evil: 1\"", Format.XLSX), java.nio.charset.StandardCharsets.UTF_8).build().toString();
        assertThat(header).startsWith("attachment;").contains("filename*=UTF-8''").doesNotContain("\r").doesNotContain("\n");
        assertThat(prepare(pnuLayer, "alice", "xlsx", "4326", false).fileName()).startsWith("서울 필지_").endsWith(".xlsx");
        assertThat(prepare(pnuLayer, "alice", "geojson", "4326", false).contentType()).isEqualTo("application/geo+json");
    }

    // ---------- 엑셀 ----------

    @Test
    void 엑셀_열과_값_PNU_레이어() throws Exception {
        try (XSSFWorkbook wb = open(stream(prepare(pnuLayer, "alice", "xlsx", "4326", false)))) {
            Sheet s = wb.getSheetAt(0);
            assertThat(headerOf(s)).containsExactly("이름", "주소", "PNU", "표준_지번주소", "경도", "위도");
            Row polygon = s.getRow(1);
            assertThat(str(polygon, 0)).isEqualTo("가");
            assertThat(str(polygon, 2)).isEqualTo("1114010300100310000");
            assertThat(str(polygon, 3)).isEqualTo("서울특별시 중구 태평로1가 31");
            // 대표점은 모양 안쪽에 있다(오목한 L자에서도)
            Polygon poly = new GeometryFactory().createPolygon(new Coordinate[]{
                    new Coordinate(127.000, 37.500), new Coordinate(127.010, 37.500), new Coordinate(127.010, 37.502),
                    new Coordinate(127.002, 37.502), new Coordinate(127.002, 37.510), new Coordinate(127.000, 37.510), new Coordinate(127.000, 37.500)});
            double lon = polygon.getCell(4).getNumericCellValue(), lat = polygon.getCell(5).getNumericCellValue();
            assertThat(poly.contains(new GeometryFactory().createPoint(new Coordinate(lon, lat)))).isTrue();
            // 점 레이어 행: PNU 없음, 좌표는 그 점
            Row point = s.getRow(2);
            assertThat(str(point, 2)).isEmpty();
            assertThat(point.getCell(4).getNumericCellValue()).isCloseTo(127.1, within(1e-9));
            assertThat(point.getCell(5).getNumericCellValue()).isCloseTo(37.2, within(1e-9));
            // 수식으로 읽힐 값은 텍스트 + 인용 접두
            Cell evil = polygon.getCell(1);
            assertThat(evil.getStringCellValue()).isEqualTo("=HYPERLINK(1)");
            assertThat(evil.getCellStyle().getQuotePrefixed()).isTrue();
            assertThat(wb.getFontAt(s.getRow(0).getCell(0).getCellStyle().getFontIndex()).getBold()).isTrue();
        }
    }

    @Test
    void 엑셀_좌표계가_4326이_아니면_X_Y_열() throws Exception {
        try (XSSFWorkbook wb = open(stream(prepare(pnuLayer, "alice", "xlsx", "5186", false)))) {
            Sheet s = wb.getSheetAt(0);
            assertThat(headerOf(s)).containsExactly("이름", "주소", "PNU", "표준_지번주소", "X좌표", "Y좌표");
            double[] xy = CoordinateTransformUtil.buildFromWgs84("EPSG:5186").toXy(127.1, 37.2);
            assertThat(s.getRow(2).getCell(4).getNumericCellValue()).isCloseTo(xy[0], within(0.01));
            assertThat(s.getRow(2).getCell(5).getNumericCellValue()).isCloseTo(xy[1], within(0.01));
        }
    }

    @Test
    void 좌표_레이어는_PNU와_지번주소_열이_없다() throws Exception {
        UserMap coord = ready("좌표 레이어", "alice", "EXCEL_COORD");
        addFeature(coord, POINT, "{\"이름\":\"다\"}", null, 2);
        try (XSSFWorkbook wb = open(stream(prepare(coord, "alice", "xlsx", "4326", false)))) {
            assertThat(headerOf(wb.getSheetAt(0))).containsExactly("이름", "주소", "경도", "위도");
            assertThat(wb.getSheetAt(0).getLastRowNum()).isEqualTo(1);
        }
    }

    @Test
    void 속성_이름이_겹치면_번호를_붙인다() throws Exception {
        UserMap m = ready("겹침", "alice", "EXCEL_PNU");
        jdbc.update("UPDATE tbl_user_map SET column_schema = ? WHERE id = ?",
                "{\"v\":1,\"rowCount\":1,\"truncated\":false,\"columns\":[{\"name\":\"PNU\",\"kind\":\"text\"},{\"name\":\"경도\",\"kind\":\"text\"}]}", m.getId());
        em.clear();
        addFeature(m, POINT, "{\"PNU\":\"원본\",\"경도\":\"원본2\"}", "1114010300100310000", 2);
        try (XSSFWorkbook wb = open(stream(prepare(repo.findById(m.getId()).orElseThrow(), "alice", "xlsx", "4326", false)))) {
            assertThat(headerOf(wb.getSheetAt(0))).containsExactly("PNU", "경도", "PNU (2)", "표준_지번주소", "경도 (2)", "위도");
        }
    }

    // ---------- 실패 행 ----------

    private void failures(UserMap m) {
        store.insertFailures(m.getId(), List.of(
                new FailureRow(5, "AMBIGUOUS", "중앙로 201", "[\"대구 중구 중앙로 201\",\"울산 남구 중앙로 201\"]", "{\"이름\":\"실패1\",\"주소\":\"중앙로 201\"}"),
                new FailureRow(4, "PARSE_FAILED", "어디쯤", null, "{\"이름\":\"실패2\",\"주소\":\"어디쯤\"}")));
        jdbc.update("UPDATE tbl_user_map SET failed_count = 2 WHERE id = ?", m.getId());
        em.clear();
    }

    @Test
    void includeFailed면_실패_행을_뒤에_덧붙인다() throws Exception {
        failures(pnuLayer);
        UserMap m = repo.findById(pnuLayer.getId()).orElseThrow();
        Prepared p = prepare(m, "alice", "xlsx", "4326", true);
        assertThat(p.failedSkipped()).isFalse();
        try (XSSFWorkbook wb = open(stream(p))) {
            Sheet s = wb.getSheetAt(0);
            assertThat(headerOf(s)).containsExactly("이름", "주소", "PNU", "표준_지번주소", "경도", "위도", "매칭상태", "실패사유");
            assertThat(s.getLastRowNum()).isEqualTo(4);   // 성공 2 + 실패 2
            assertThat(str(s.getRow(1), 6)).isEqualTo("성공");
            assertThat(str(s.getRow(2), 7)).isEmpty();
            // 실패 행은 행 번호 순(4 → 5)
            assertThat(str(s.getRow(3), 0)).isEqualTo("실패2");
            assertThat(str(s.getRow(3), 6)).isEqualTo("실패");
            assertThat(str(s.getRow(3), 7)).isEqualTo("주소 형식을 알 수 없습니다");
            assertThat(str(s.getRow(4), 0)).isEqualTo("실패1");
            assertThat(str(s.getRow(4), 7)).contains("같은 이름이 여러 곳에 있어 정하지 못했습니다").contains("대구 중구 중앙로 201 / 울산 남구 중앙로 201");
            assertThat(str(s.getRow(4), 4)).as("실패 행의 좌표는 빈 칸").isEmpty();
        }
    }

    @Test
    void includeFailed가_꺼져_있으면_실패_행도_열도_없다() throws Exception {
        failures(pnuLayer);
        UserMap m = repo.findById(pnuLayer.getId()).orElseThrow();
        Prepared p = prepare(m, "alice", "xlsx", "4326", false);
        try (XSSFWorkbook wb = open(stream(p))) {
            assertThat(headerOf(wb.getSheetAt(0))).doesNotContain("매칭상태");
            assertThat(wb.getSheetAt(0).getLastRowNum()).isEqualTo(2);
        }
    }

    @Test
    void 보관_기간이_지나_실패_행이_없으면_건너뛰고_알린다() throws Exception {
        jdbc.update("UPDATE tbl_user_map SET failed_count = 7 WHERE id = ?", pnuLayer.getId());   // 실패가 있었지만 행은 지워짐
        em.clear();
        UserMap m = repo.findById(pnuLayer.getId()).orElseThrow();
        Prepared p = prepare(m, "alice", "xlsx", "4326", true);
        assertThat(p.failedSkipped()).isTrue();
        assertThat(p.includeFailed()).isFalse();
        try (XSSFWorkbook wb = open(stream(p))) {
            assertThat(headerOf(wb.getSheetAt(0))).doesNotContain("매칭상태", "실패사유");
        }
        // 처음부터 실패가 없던 레이어는 건너뜀이 아니다(열은 붙고 전부 성공)
        Prepared none = prepare(pnuLayer, "alice", "xlsx", "4326", true);
        jdbc.update("UPDATE tbl_user_map SET failed_count = 0 WHERE id = ?", pnuLayer.getId());
        em.clear();
        Prepared clean = prepare(repo.findById(pnuLayer.getId()).orElseThrow(), "alice", "xlsx", "4326", true);
        assertThat(clean.failedSkipped()).isFalse();
        assertThat(clean.includeFailed()).isTrue();
        assertThat(none).isNotNull();
        // geojson에서는 includeFailed를 무시한다
        assertThat(prepare(m, "alice", "geojson", "4326", true).failedSkipped()).isFalse();
    }

    // ---------- GeoJSON ----------

    @Test
    void geojson_4326은_저장된_피처_그대로_crs_없음() throws Exception {
        byte[] body = stream(prepare(pnuLayer, "alice", "geojson", "4326", false));
        JsonNode root = new ObjectMapper().readTree(body);
        assertThat(root.path("type").asText()).isEqualTo("FeatureCollection");
        assertThat(root.has("crs")).isFalse();
        assertThat(root.path("features")).hasSize(2);
        JsonNode f0 = root.path("features").get(0);
        assertThat(f0.path("type").asText()).isEqualTo("Feature");
        assertThat(f0.path("geometry")).isEqualTo(new ObjectMapper().readTree(L_SHAPE));
        assertThat(f0.path("properties").path("이름").asText()).isEqualTo("가");
        assertThat(f0.path("properties").path("주소").asText()).isEqualTo("=HYPERLINK(1)");   // GeoJSON은 저장된 값 그대로
    }

    @Test
    void geojson_좌표계_변환과_crs_멤버() throws Exception {
        for (int srid : new int[]{5186, 5179, 3857}) {
            JsonNode root = new ObjectMapper().readTree(stream(prepare(pnuLayer, "alice", "geojson", String.valueOf(srid), false)));
            assertThat(root.path("crs").path("type").asText()).isEqualTo("name");
            assertThat(root.path("crs").path("properties").path("name").asText()).isEqualTo("urn:ogc:def:crs:EPSG::" + srid);
            double[] expectedPoint = CoordinateTransformUtil.buildFromWgs84("EPSG:" + srid).toXy(127.1, 37.2);
            JsonNode pt = root.path("features").get(1).path("geometry").path("coordinates");
            assertThat(pt.get(0).asDouble()).as(srid + " x").isCloseTo(expectedPoint[0], within(0.001));
            assertThat(pt.get(1).asDouble()).as(srid + " y").isCloseTo(expectedPoint[1], within(0.001));
            // 다각형 첫 꼭짓점·구조 유지
            JsonNode ring = root.path("features").get(0).path("geometry").path("coordinates").get(0);
            assertThat(ring).hasSize(7);
            double[] v0 = CoordinateTransformUtil.buildFromWgs84("EPSG:" + srid).toXy(127.000, 37.500);
            assertThat(ring.get(0).get(0).asDouble()).isCloseTo(v0[0], within(0.001));
            assertThat(ring.get(0).get(1).asDouble()).isCloseTo(v0[1], within(0.001));
            assertThat(root.path("features").get(0).path("properties").path("이름").asText()).isEqualTo("가");
        }
    }

    @Test
    void geojson_멀티폴리곤과_높이값_구조_유지() throws Exception {
        UserMap m = ready("멀티", "alice", "SHP");
        addFeature(m, "{\"type\":\"MultiPolygon\",\"coordinates\":[[[[127,37],[127.1,37],[127.1,37.1],[127,37]]],[[[128,36],[128.1,36],[128.1,36.1],[128,36]]]]}", "{}", null, null);
        addFeature(m, "{\"type\":\"LineString\",\"coordinates\":[[127,37,10.5],[127.1,37.1,20]]}", null, null, null);
        JsonNode root = new ObjectMapper().readTree(stream(prepare(m, "alice", "geojson", "5186", false)));
        JsonNode multi = root.path("features").get(0).path("geometry");
        assertThat(multi.path("type").asText()).isEqualTo("MultiPolygon");
        assertThat(multi.path("coordinates")).hasSize(2);
        assertThat(multi.path("coordinates").get(1).get(0)).hasSize(4);
        JsonNode line = root.path("features").get(1);
        assertThat(line.path("geometry").path("coordinates").get(0)).hasSize(3);
        assertThat(line.path("geometry").path("coordinates").get(0).get(2).asDouble()).isEqualTo(10.5);   // 높이는 그대로
        assertThat(line.path("properties").isObject()).isTrue();   // properties가 없으면 {}
    }

    // ---------- 동시 실행 제한(전체 2건) ----------

    /** 첫 쓰기에서 한 번만 action을 실행하는 버리는 출력 */
    static OutputStream onFirstWrite(Runnable action) {
        return new OutputStream() {
            boolean done = false;

            @Override
            public void write(int b) {
                write(new byte[]{(byte) b}, 0, 1);
            }

            @Override
            public void write(byte[] b, int off, int len) {
                if (done) return;
                done = true;
                action.run();
            }
        };
    }

    @Test
    void 내보내기_동시_실행은_2건까지이고_자리는_끝나야_돌아온다() {
        Prepared p = prepare(pnuLayer, "alice", "xlsx", "4326", false);
        assertThat(export.availableExportSlots()).isEqualTo(2);
        boolean[] thirdHeaderRan = {false};
        int[] seen = {-1, -1};
        CustomException[] third = {null};
        // 바깥이 한 자리, 안쪽이 한 자리를 잡은 채 세 번째를 시도한다
        export.stream(p, () -> {
        }, onFirstWrite(() -> {
            seen[0] = export.availableExportSlots();
            export.stream(p, () -> {
            }, onFirstWrite(() -> {
                seen[1] = export.availableExportSlots();
                third[0] = caught(() -> export.stream(p, () -> thirdHeaderRan[0] = true, new ByteArrayOutputStream()));
            }));
        }));
        assertThat(seen[0]).as("바깥이 쓰는 동안 남은 자리").isEqualTo(1);
        assertThat(seen[1]).as("안쪽까지 쓰는 동안 남은 자리").isEqualTo(0);
        assertThat(third[0].getErrorCode()).isEqualTo(GisErrorCode.MYMAP_EXPORT_BUSY);
        assertThat(third[0].getMessage()).isEqualTo("내보내기가 많아 잠시 후 다시 시도해 주세요.");
        assertThat(thirdHeaderRan[0]).as("자리가 없으면 응답 헤더도 세우지 않는다").isFalse();
        assertThat(export.availableExportSlots()).as("끝나면 모두 돌아온다").isEqualTo(2);
    }

    @Test
    void 본문_쓰기_예외_클라이언트_중단_헤더_설정_예외에도_자리가_돌아온다() {
        Prepared x = prepare(pnuLayer, "alice", "xlsx", "4326", false);
        Prepared g = prepare(pnuLayer, "alice", "geojson", "4326", false);
        OutputStream broken = new OutputStream() {
            @Override
            public void write(int b) throws IOException {
                throw new IOException("client aborted");
            }

            @Override
            public void write(byte[] b, int off, int len) throws IOException {
                throw new IOException("client aborted");
            }
        };
        assertThatThrownBy(() -> export.stream(g, () -> {
        }, broken)).isInstanceOf(RuntimeException.class);
        assertThat(export.availableExportSlots()).isEqualTo(2);
        assertThatThrownBy(() -> export.stream(x, () -> {
        }, broken)).isInstanceOf(RuntimeException.class);
        assertThat(export.availableExportSlots()).isEqualTo(2);
        assertThatThrownBy(() -> export.stream(x, () -> {
            throw new IllegalStateException("header");
        }, new ByteArrayOutputStream())).isInstanceOf(IllegalStateException.class);
        assertThat(export.availableExportSlots()).isEqualTo(2);
    }

    // ---------- 대용량: 메모리에 쌓지 않는다 ----------

    /** 피처를 몇 건 읽었는지 세는 JdbcTemplate */
    static final class CountingJdbc extends JdbcTemplate {
        int rowsRead = 0;

        CountingJdbc(javax.sql.DataSource ds) {
            super(ds);
        }

        @Override
        public void query(PreparedStatementCreator psc, RowCallbackHandler rch) {
            super.query(psc, rs -> {
                rowsRead++;
                rch.processRow(rs);
            });
        }
    }

    static final int BIG = 50_000;

    private UserMap bigLayer() {
        UserMap m = ready("대용량", "alice", "EXCEL_PNU");
        String ring = L_SHAPE;
        List<Object[]> batch = new ArrayList<>();
        for (int i = 0; i < BIG; i++) {
            batch.add(new Object[]{m.getId(), ring, "{\"이름\":\"n" + i + "\",\"주소\":\"a" + i + "\"}", "1114010300100310000", i + 2});
        }
        jdbc.batchUpdate("INSERT INTO tbl_user_map_feature (user_map_id, geometry_json, properties_json, pnu, row_no) VALUES (?, ?, ?, ?, ?)", batch);
        jdbc.update("UPDATE tbl_user_map SET feature_count = ? WHERE id = ?", BIG, m.getId());
        em.clear();
        return repo.findById(m.getId()).orElseThrow();
    }

    /** 버리는 출력: 몇 바이트가 왔는지, 처음 1MB가 도착한 시점에 피처를 몇 건 읽었는지 기록한다 */
    static final class ProbeOut extends OutputStream {
        final CountingJdbc jdbc;
        long bytes = 0;
        int rowsReadAt1Mb = -1;

        ProbeOut(CountingJdbc jdbc) {
            this.jdbc = jdbc;
        }

        @Override
        public void write(int b) {
            write(new byte[]{(byte) b}, 0, 1);
        }

        @Override
        public void write(byte[] b, int off, int len) {
            bytes += len;
            if (rowsReadAt1Mb < 0 && bytes >= 1 << 20) rowsReadAt1Mb = jdbc.rowsRead;
        }
    }

    @Test
    void geojson은_피처를_읽는_대로_흘려보낸다_5만_피처() {
        UserMap big = bigLayer();
        CountingJdbc counting = new CountingJdbc(jdbc.getDataSource());
        UserMapExportService svc = new UserMapExportService(mapService, new MyMapColumnService(repo, new UserMapPermissionService(userAccess, permAccess, em), jdbc),
                failureRepo, new TableAddressResolver(new InMemoryAddressRefReader("2026-09"), 5), counting);
        ProbeOut out = new ProbeOut(counting);
        svc.stream(svc.prepare(big.getId(), "alice", List.of(), "geojson", "5186", false), () -> {
        }, out);

        assertThat(counting.rowsRead).isEqualTo(BIG);
        assertThat(out.bytes).isGreaterThan(10L << 20);   // 수십 MB가 나갔다
        // 전부 읽은 뒤에야 쓰기 시작했다면(메모리에 모음) 1MB 시점에 이미 5만 건을 읽었을 것이다
        assertThat(out.rowsReadAt1Mb).as("1MB가 나갈 때까지 읽은 피처 수").isBetween(1, BIG / 10);
    }

    @Test
    void 엑셀도_5만_행을_끝낸다_행마다_쓰고_열_폭은_상한() throws Exception {
        UserMap big = bigLayer();
        byte[] body = stream(prepare(big, "alice", "xlsx", "4326", false));
        try (XSSFWorkbook wb = open(body)) {
            Sheet s = wb.getSheetAt(0);
            assertThat(s.getLastRowNum()).isEqualTo(BIG);
            assertThat(str(s.getRow(BIG), 0)).isEqualTo("n" + (BIG - 1));
            assertThat(s.getColumnWidth(0)).isLessThanOrEqualTo(255 * 256);
        }
    }

    @Test
    void 반환된_데이터가_바뀌지_않는다_읽기_전용() {
        long features = featureRepo.count();
        long maps = repo.count();
        stream(prepare(pnuLayer, "alice", "xlsx", "4326", true));
        stream(prepare(pnuLayer, "alice", "geojson", "5179", false));
        assertThat(featureRepo.count()).isEqualTo(features);
        assertThat(repo.count()).isEqualTo(maps);
    }

    @Test
    void 빈_레이어도_머리글만_있는_엑셀() throws Exception {
        UserMap empty = ready("빈", "alice", "EXCEL_COORD");
        try (XSSFWorkbook wb = open(stream(prepare(empty, "alice", "xlsx", "4326", false)))) {
            assertThat(wb.getSheetAt(0).getLastRowNum()).isZero();
            assertThat(headerOf(wb.getSheetAt(0))).containsExactly("이름", "주소", "경도", "위도");
        }
        JsonNode root = null;
        try {
            root = new ObjectMapper().readTree(stream(prepare(empty, "alice", "geojson", "3857", false)));
        } catch (IOException e) {
            throw new AssertionError(e);
        }
        assertThat(root.path("features")).isEmpty();
        assertThat(root.path("crs").path("properties").path("name").asText()).endsWith("EPSG::3857");
    }
}
