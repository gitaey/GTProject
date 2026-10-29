package com.gtp.domain.mymap.controller;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.gtp.domain.mymap.FakeShareDirectory;
import com.gtp.domain.mymap.entity.UserMap;
import com.gtp.domain.mymap.infra.FakePnuParcelProvider;
import com.gtp.domain.mymap.infra.InMemoryAddressRefReader;
import com.gtp.domain.mymap.infra.TableAddressResolver;
import com.gtp.domain.mymap.port.AddressResolver;
import com.gtp.domain.mymap.repository.*;
import com.gtp.domain.mymap.service.*;
import com.gtp.global.exception.GlobalExceptionHandler;
import com.gtp.global.gis.GisUserContext;
import jakarta.persistence.EntityManager;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import java.io.ByteArrayInputStream;
import java.nio.file.Path;
import java.util.Base64;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** 주소 변환·내보내기 HTTP 경로 전체(본문 → 컨트롤러 → 서비스): 응답 봉투, base64 → 유효한 xlsx, 헤더, 오류 코드, 권한. */
@DataJpaTest
class UserMapConvertExportControllerTest {

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
    @TempDir
    Path dir;

    static final class TestUser implements GisUserContext {
        String id = "alice";

        @Override
        public String currentUserId() {
            return id;
        }

        @Override
        public List<String> currentRoleCodes() {
            return List.of();
        }
    }

    final ObjectMapper om = new ObjectMapper();
    final TestUser user = new TestUser();
    MockMvc mvc;
    PendingUploadRegistry registry;
    UserMap layer;

    @BeforeEach
    void setUp() {
        com.gtp.domain.mymap.config.MyMapProperties props = new com.gtp.domain.mymap.config.MyMapProperties();
        registry = new PendingUploadRegistry(props);
        InMemoryAddressRefReader reader = new InMemoryAddressRefReader("2026-09");
        reader.legalDong("1114010300", "서울특별시", "중구", "태평로1가", "");
        reader.road("111402005001", "서울특별시", "중구", "세종대로", true)
                .building("111402005001", false, 110, 0, "1114010300", false, 31, 0, "서울특별시", "중구", "태평로1가", "", "세종대로");
        AddressResolver resolver = new TableAddressResolver(reader, 5);
        FakePnuParcelProvider parcels = new FakePnuParcelProvider("2026-10").addSquare("1114010300100310000", "31", 126.9782, 37.5666, 0.0002);
        AddressConvertService convert = new AddressConvertService(registry, resolver, parcels, new ImportGuard(), props);

        UserMapPermissionService perm = new UserMapPermissionService(userAccess, permAccess, em);
        UserMapShareService share = new UserMapShareService(repo, userAccess, permAccess, FakeShareDirectory.standard());
        MyMapColumnService columns = new MyMapColumnService(repo, perm, jdbc);
        UserMapService service = new UserMapService(repo, featureRepo, failureRepo, perm, columns, jdbc, share);
        UserMapExportService export = new UserMapExportService(service, columns, failureRepo, resolver, jdbc);

        UserMapController controller = new UserMapController(service, mock(UserMapUploadService.class), mock(ImportReportService.class),
                mock(MyMapQuotaService.class), columns, mock(SampleService.class), user, share, convert, export);
        mvc = MockMvcBuilders.standaloneSetup(controller).setControllerAdvice(new GlobalExceptionHandler()).build();

        layer = repo.saveAndFlush(UserMap.builder().name("내보내기 \"시험\"").ownerId("alice").sourceType("EXCEL").sourceKind("EXCEL_COORD")
                .sourceSrid("EPSG:4326").build());
        jdbc.update("UPDATE tbl_user_map SET status = 'READY', column_schema = ? WHERE id = ?",
                "{\"v\":1,\"rowCount\":1,\"truncated\":false,\"columns\":[{\"name\":\"이름\",\"kind\":\"text\"}]}", layer.getId());
        jdbc.update("INSERT INTO tbl_user_map_feature (user_map_id, geometry_json, properties_json, pnu, row_no) VALUES (?, ?, ?, NULL, 2)",
                layer.getId(), "{\"type\":\"Point\",\"coordinates\":[127.1,37.2]}", "{\"이름\":\"가\"}");
        em.clear();
    }

    private String registerUpload() {
        String id = UUID.randomUUID().toString();
        Path f = com.gtp.domain.mymap.XlsxTestUtil.write(dir.resolve(id + ".xlsx"),
                List.of(com.gtp.domain.mymap.XlsxTestUtil.row("이름", "주소"),
                        com.gtp.domain.mymap.XlsxTestUtil.row("a", "서울특별시 중구 세종대로 110"),
                        com.gtp.domain.mymap.XlsxTestUtil.row("b", "어디쯤")));
        registry.register(new PendingUploadRegistry.Pending(id, "alice", f, registry.newExpiry(), List.of("이름", "주소"), 2, "h"));
        return id;
    }

    // ---------- convert ----------

    @Test
    void 변환_응답_봉투와_base64_엑셀() throws Exception {
        String id = registerUpload();
        String body = "{\"uploadId\":\"" + id + "\",\"addressColumn\":\"주소\",\"include\":{\"pnu\":true,\"roadAddress\":true,\"jibunAddress\":true,"
                + "\"lonLat\":true,\"area\":true},\"srid\":5186}";
        MockHttpServletResponse res = mvc.perform(post("/api/mymap/upload/excel/convert").contentType("application/json").content(body))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true))
                .andExpect(jsonPath("$.data.total").value(2))
                .andExpect(jsonPath("$.data.matched").value(1))
                .andExpect(jsonPath("$.data.failed").value(1))
                .andExpect(jsonPath("$.data.fileName").value(org.hamcrest.Matchers.matchesPattern("주소변환_결과_\\d{8}\\.xlsx")))
                .andExpect(jsonPath("$.data.preview.columns[2]").value("매칭상태"))
                .andExpect(jsonPath("$.data.preview.columns[7]").value("X좌표"))
                .andExpect(jsonPath("$.data.preview.rows[0][2]").value("성공"))
                .andExpect(jsonPath("$.data.preview.rows[0][5]").value("서울특별시 중구 세종대로 110 (태평로1가)"))
                .andExpect(jsonPath("$.data.preview.rows[1][2]").value("실패"))
                .andReturn().getResponse();
        JsonNode data = om.readTree(res.getContentAsString()).path("data");
        byte[] xlsx = Base64.getDecoder().decode(data.path("fileBase64").asText());
        try (XSSFWorkbook wb = new XSSFWorkbook(new ByteArrayInputStream(xlsx))) {
            assertThat(wb.getNumberOfSheets()).isEqualTo(2);
            assertThat(wb.getSheet("결과").getRow(1).getCell(0).getStringCellValue()).isEqualTo("a");
        }
        assertThat(repo.count()).as("레이어가 만들어지지 않는다").isEqualTo(1);   // setUp의 레이어 하나뿐
        assertThat(featureRepo.count()).isEqualTo(1);
    }

    @Test
    void 변환_오류는_봉투로_나간다() throws Exception {
        mvc.perform(post("/api/mymap/upload/excel/convert").contentType("application/json")
                        .content("{\"uploadId\":\"nope\",\"addressColumn\":\"주소\"}"))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.success").value(false));
        String id = registerUpload();
        mvc.perform(post("/api/mymap/upload/excel/convert").contentType("application/json")
                        .content("{\"uploadId\":\"" + id + "\",\"addressColumn\":\"없는열\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.success").value(false));
        mvc.perform(post("/api/mymap/upload/excel/convert").contentType("application/json")
                        .content("{\"uploadId\":\"" + id + "\",\"addressColumn\":\"주소\",\"srid\":5185}"))
                .andExpect(status().isBadRequest());
    }

    // ---------- export ----------

    @Test
    void 내보내기_엑셀_헤더와_본문() throws Exception {
        MockHttpServletResponse res = mvc.perform(get("/api/mymap/{id}/export", layer.getId()).param("format", "xlsx"))
                .andExpect(status().isOk()).andReturn().getResponse();
        assertThat(res.getContentType()).isEqualTo("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
        String cd = res.getHeader("Content-Disposition");
        assertThat(cd).startsWith("attachment;").contains("filename*=UTF-8''").doesNotContain("\"시험\"").doesNotContain("\r").doesNotContain("\n");
        assertThat(java.net.URLDecoder.decode(cd.substring(cd.indexOf("filename*=UTF-8''") + "filename*=UTF-8''".length()), java.nio.charset.StandardCharsets.UTF_8))
                .matches("내보내기 _시험_?_\\d{8}\\.xlsx");
        assertThat(res.getHeader("Cache-Control")).contains("no-store");
        assertThat(res.getHeader("X-Export-Failed-Skipped")).isNull();
        try (XSSFWorkbook wb = new XSSFWorkbook(new ByteArrayInputStream(res.getContentAsByteArray()))) {
            assertThat(wb.getSheetAt(0).getRow(0).getCell(0).getStringCellValue()).isEqualTo("이름");
            assertThat(wb.getSheetAt(0).getRow(1).getCell(1).getNumericCellValue()).isEqualTo(127.1);
        }
    }

    @Test
    void 내보내기_geojson과_기본값() throws Exception {
        MockHttpServletResponse res = mvc.perform(get("/api/mymap/{id}/export", layer.getId()).param("format", "geojson").param("srid", "EPSG:3857"))
                .andExpect(status().isOk()).andReturn().getResponse();
        assertThat(res.getContentType()).startsWith("application/geo+json");
        assertThat(res.getHeader("Content-Disposition")).contains(".geojson");
        JsonNode root = om.readTree(res.getContentAsByteArray());
        assertThat(root.path("crs").path("properties").path("name").asText()).isEqualTo("urn:ogc:def:crs:EPSG::3857");
        // 인자를 생략하면 xlsx · 4326
        MockHttpServletResponse def = mvc.perform(get("/api/mymap/{id}/export", layer.getId())).andExpect(status().isOk()).andReturn().getResponse();
        assertThat(def.getContentType()).contains("spreadsheetml");
    }

    @Test
    void 내보내기_실패_행_보관_기간이_지났으면_헤더로_알린다() throws Exception {
        jdbc.update("UPDATE tbl_user_map SET failed_count = 3 WHERE id = ?", layer.getId());
        em.clear();
        MockHttpServletResponse res = mvc.perform(get("/api/mymap/{id}/export", layer.getId()).param("includeFailed", "true"))
                .andExpect(status().isOk()).andReturn().getResponse();
        assertThat(res.getHeader("X-Export-Failed-Skipped")).isEqualTo("true");
    }

    @Test
    void 내보내기_오류는_JSON_봉투_권한은_geojson과_같다() throws Exception {
        mvc.perform(get("/api/mymap/{id}/export", layer.getId()).param("format", "csv"))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.success").value(false));
        mvc.perform(get("/api/mymap/{id}/export", layer.getId()).param("srid", "5185"))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.success").value(false));
        mvc.perform(get("/api/mymap/{id}/export", 987654L)).andExpect(status().isNotFound());

        user.id = "mallory";
        mvc.perform(get("/api/mymap/{id}/export", layer.getId())).andExpect(status().isForbidden()).andExpect(jsonPath("$.success").value(false));
        mvc.perform(get("/api/mymap/{id}/geojson", layer.getId())).andExpect(status().isForbidden());   // 같은 판정

        user.id = "alice";
        jdbc.update("UPDATE tbl_user_map SET status = 'PROCESSING' WHERE id = ?", layer.getId());
        em.clear();
        mvc.perform(get("/api/mymap/{id}/export", layer.getId())).andExpect(status().isConflict());
    }
}
