package com.gtp.domain.mymap.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.gtp.domain.mymap.controller.UserMapController;
import com.gtp.domain.mymap.entity.UserMap;
import com.gtp.domain.mymap.entity.UserMapPermissionAccess;
import com.gtp.domain.mymap.entity.UserMapUserAccess;
import com.gtp.domain.mymap.repository.*;
import com.gtp.domain.mymap.util.ColumnStatsCollector;
import com.gtp.global.exception.GlobalExceptionHandler;
import com.gtp.global.gis.GisUserContext;
import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * 스타일 저장 경로 전체(HTTP 본문 → 컨트롤러 → 서비스 → DB)를 H2로 확인한다:
 * PATCH는 부분 수정(styleConfig만 보내도 됨), 등록자만(공유받은 사람·역할 공유·타인·관리자 역할·비로그인은 403), 스키마 위반은 400(이유 포함),
 * 빈 문자열은 기본값으로 되돌리기, 레이어 컬럼 이름·종류 검사, 컬럼 통계 조회 권한.
 */
@DataJpaTest
class UserMapStylePatchTest {

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

    /** 시험이 요청마다 바꾸는 현재 사용자 */
    static final class TestUser implements GisUserContext {
        String id;
        List<String> roles = List.of();

        TestUser as(String id, String... roles) {
            this.id = id;
            this.roles = List.of(roles);
            return this;
        }

        @Override
        public String currentUserId() {
            return id;
        }

        @Override
        public List<String> currentRoleCodes() {
            return roles;
        }
    }

    final ObjectMapper om = new ObjectMapper();
    final TestUser user = new TestUser();
    MockMvc mvc;
    UserMap layer;

    static final String STYLE = "{\"v\":1,\"fill\":\"#2563eb\",\"fillOpacity\":0.3,\"label\":{\"field\":\"이름\",\"size\":12},\"popup\":{\"fields\":[\"이름\",\"직원수\"]}}";

    @BeforeEach
    void setUp() {
        UserMapPermissionService perm = new UserMapPermissionService(userAccess, permAccess, em);
        MyMapColumnService columns = new MyMapColumnService(repo, perm, jdbc);
        UserMapShareService shareService = new UserMapShareService(repo, userAccess, permAccess, com.gtp.domain.mymap.FakeShareDirectory.standard());
        UserMapService service = new UserMapService(repo, featureRepo, failureRepo, perm, columns, jdbc, shareService);
        UserMapController controller = new UserMapController(service, mock(UserMapUploadService.class), mock(ImportReportService.class),
                mock(MyMapQuotaService.class), columns, mock(SampleService.class), user, shareService,
                mock(AddressConvertService.class), mock(UserMapExportService.class));
        mvc = MockMvcBuilders.standaloneSetup(controller).setControllerAdvice(new GlobalExceptionHandler()).build();

        layer = repo.saveAndFlush(UserMap.builder().name("내 레이어").description("설명").ownerId("alice").sourceType("EXCEL").sourceKind("EXCEL_PNU")
                .sourceSrid("EPSG:4326").styleConfig("{\"v\":1}").build());
        ColumnStatsCollector stats = new ColumnStatsCollector(List.of("이름", "구분", "직원수"));
        stats.addRow(List.of("서울", "청사", "1100"));
        stats.addRow(List.of("세종", "청사", "900"));
        jdbc.update("UPDATE tbl_user_map SET status = 'READY', column_schema = ? WHERE id = ?", stats.toJson(false), layer.getId());
        userAccess.saveAndFlush(UserMapUserAccess.builder().userId("bob").userMap(layer).build());
        permAccess.saveAndFlush(UserMapPermissionAccess.builder().roleCode("EDITOR").userMap(layer).build());
        em.clear();
    }

    private ResultActions doPatch(String body) throws Exception {
        return mvc.perform(patch("/api/mymap/" + layer.getId()).contentType(MediaType.APPLICATION_JSON).content(body));
    }

    private ResultActions patchStyle(String style) throws Exception {
        return doPatch(om.writeValueAsString(Map.of("styleConfig", style)));
    }

    private String styleInDb() {
        em.flush();
        return jdbc.queryForObject("SELECT style_config FROM tbl_user_map WHERE id = ?", String.class, layer.getId());
    }

    private String nameInDb() {
        em.flush();
        return jdbc.queryForObject("SELECT name FROM tbl_user_map WHERE id = ?", String.class, layer.getId());
    }

    // ---------- 부분 수정·권한 ----------

    @Test
    void 등록자는_styleConfig만_보내도_수정된다_다른_필드는_그대로() throws Exception {
        user.as("alice");
        patchStyle(STYLE).andExpect(status().isOk()).andExpect(jsonPath("$.success").value(true));
        em.flush();
        assertThat(styleInDb()).isEqualTo(STYLE);
        assertThat(nameInDb()).isEqualTo("내 레이어");
        assertThat(jdbc.queryForObject("SELECT description FROM tbl_user_map WHERE id = ?", String.class, layer.getId())).isEqualTo("설명");
        assertThat(jdbc.queryForObject("SELECT visible FROM tbl_user_map WHERE id = ?", Boolean.class, layer.getId())).isTrue();
    }

    @Test
    void 이름만_보내면_스타일은_그대로() throws Exception {
        user.as("alice");
        doPatch("{\"name\":\"새 이름\"}").andExpect(status().isOk());
        assertThat(nameInDb()).isEqualTo("새 이름");
        assertThat(styleInDb()).isEqualTo("{\"v\":1}");
        doPatch("{\"styleConfig\":null}").andExpect(status().isOk());   // null은 그대로
        assertThat(styleInDb()).isEqualTo("{\"v\":1}");
    }

    @Test
    void 공유받은_사용자는_스타일을_바꿀_수_없다_403() throws Exception {
        user.as("bob");
        patchStyle(STYLE).andExpect(status().isForbidden())
                .andExpect(jsonPath("$.success").value(false))
                .andExpect(jsonPath("$.message").value("이 나만의지도에 대한 권한이 없습니다."));
        assertThat(styleInDb()).isEqualTo("{\"v\":1}");
        // 보기는 된다(공유 대상)
        mvc.perform(get("/api/mymap/" + layer.getId() + "/columns")).andExpect(status().isOk());
    }

    @Test
    void 역할로_공유받은_사용자도_타인도_비로그인도_403() throws Exception {
        user.as("carol", "EDITOR");
        patchStyle(STYLE).andExpect(status().isForbidden());
        user.as("mallory", "VIEWER");
        patchStyle(STYLE).andExpect(status().isForbidden());
        user.as(null);
        patchStyle(STYLE).andExpect(status().isForbidden());
        assertThat(styleInDb()).isEqualTo("{\"v\":1}");
    }

    @Test
    void 관리자_역할도_소유자가_아니면_스타일을_바꿀_수_없다_관리자_예외는_관리자_경로뿐() throws Exception {
        user.as("root", "SUPER_ADMIN", "MAP_ADMIN");
        patchStyle(STYLE).andExpect(status().isForbidden());
        doPatch("{\"name\":\"관리자가 바꿈\"}").andExpect(status().isForbidden());
        assertThat(styleInDb()).isEqualTo("{\"v\":1}");
        assertThat(nameInDb()).isEqualTo("내 레이어");
    }

    @Test
    void 소유자_검사가_스키마_검사보다_먼저다_남의_레이어에_잘못된_스타일이면_400이_아니라_403() throws Exception {
        user.as("mallory");
        patchStyle("{깨진").andExpect(status().isForbidden());
        user.as("bob");
        patchStyle("{\"v\":2}").andExpect(status().isForbidden());
    }

    @Test
    void 없는_레이어는_404() throws Exception {
        user.as("alice");
        mvc.perform(patch("/api/mymap/99999").contentType(MediaType.APPLICATION_JSON).content("{\"name\":\"x\"}")).andExpect(status().isNotFound());
    }

    // ---------- 스키마 검사 ----------

    @Test
    void 스키마_위반은_400이고_이유가_메시지에_있고_아무것도_바뀌지_않는다() throws Exception {
        user.as("alice");
        doPatch(om.writeValueAsString(Map.of("name", "바꾸려던 이름", "styleConfig", "{\"v\":1,\"fillOpacity\":5}")))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.success").value(false))
                .andExpect(jsonPath("$.message").value("스타일 설정이 올바르지 않습니다: fillOpacity — 0.0~1.0 범위여야 합니다"));
        assertThat(nameInDb()).isEqualTo("내 레이어");
        assertThat(styleInDb()).isEqualTo("{\"v\":1}");

        patchStyle("{\"v\":1,\"fill\":\"red\"}").andExpect(status().isBadRequest()).andExpect(jsonPath("$.message").value(org.hamcrest.Matchers.containsString("fill")));
        patchStyle("{\"v\":1,\"모르는키\":1}").andExpect(status().isBadRequest()).andExpect(jsonPath("$.message").value(org.hamcrest.Matchers.containsString("모르는키")));
        patchStyle("{\"v\":2}").andExpect(status().isBadRequest());
        patchStyle("[1]").andExpect(status().isBadRequest());
        patchStyle("{" + "\"v\":1,\"x\":\"" + "a".repeat(17 * 1024) + "\"}").andExpect(status().isBadRequest());
        assertThat(styleInDb()).isEqualTo("{\"v\":1}");
    }

    @Test
    void 레이어에_없는_컬럼을_고르면_400() throws Exception {
        user.as("alice");
        patchStyle("{\"v\":1,\"label\":{\"field\":\"없는컬럼\"}}").andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value(org.hamcrest.Matchers.containsString("label.field")))
                .andExpect(jsonPath("$.message").value(org.hamcrest.Matchers.containsString("없는컬럼")));
        patchStyle("{\"v\":1,\"popup\":{\"fields\":[\"이름\",\"없는컬럼\"]}}").andExpect(status().isBadRequest());
        patchStyle("{\"v\":1,\"classify\":{\"type\":\"categorical\",\"field\":\"없는컬럼\",\"classes\":[{\"value\":\"a\",\"color\":\"#111111\"}]}}")
                .andExpect(status().isBadRequest());
        assertThat(styleInDb()).isEqualTo("{\"v\":1}");
    }

    @Test
    void 점_색_테두리와_팝업_끔도_저장된다() throws Exception {
        user.as("alice");
        String style = "{\"v\":1,\"display\":\"point\",\"pointRadius\":8,\"pointColor\":\"#2563eb\",\"pointStroke\":\"#000000\",\"pointStrokeWidth\":2,"
                + "\"popup\":{\"fields\":[]}}";
        patchStyle(style).andExpect(status().isOk());
        assertThat(styleInDb()).isEqualTo(style);
        patchStyle("{\"v\":1,\"pointStrokeWidth\":11}").andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value(org.hamcrest.Matchers.containsString("pointStrokeWidth")));
        assertThat(styleInDb()).isEqualTo(style);
    }

    @Test
    void 구간형은_숫자_컬럼만() throws Exception {
        user.as("alice");
        String graduated = "{\"v\":1,\"classify\":{\"type\":\"graduated\",\"field\":\"%s\",\"method\":\"manual\",\"breaks\":[950,1050],"
                + "\"colors\":[\"#fee5d9\",\"#fb6a4a\",\"#a50f15\"]}}";
        patchStyle(String.format(graduated, "구분")).andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value(org.hamcrest.Matchers.containsString("숫자 컬럼")));
        patchStyle(String.format(graduated, "직원수")).andExpect(status().isOk());
        assertThat(styleInDb()).contains("graduated");
    }

    @Test
    void 처리_중인_레이어는_컬럼을_아직_몰라_이름_검사를_건너뛴다() throws Exception {
        jdbc.update("UPDATE tbl_user_map SET status = 'PROCESSING' WHERE id = ?", layer.getId());
        em.clear();
        user.as("alice");
        patchStyle("{\"v\":1,\"label\":{\"field\":\"아직 모르는 컬럼\"}}").andExpect(status().isOk());
        // 모양·범위는 그래도 본다
        patchStyle("{\"v\":1,\"label\":{\"field\":\"a\",\"size\":99}}").andExpect(status().isBadRequest());
    }

    // ---------- 기본값으로 되돌리기 ----------

    @Test
    void 빈_문자열이면_기본값으로_되돌린다_저장값_null() throws Exception {
        user.as("alice");
        patchStyle(STYLE).andExpect(status().isOk());
        assertThat(styleInDb()).isEqualTo(STYLE);
        patchStyle("").andExpect(status().isOk());
        assertThat(styleInDb()).isNull();
        patchStyle(STYLE).andExpect(status().isOk());
        patchStyle("   ").andExpect(status().isOk());
        assertThat(styleInDb()).isNull();
        assertThat(nameInDb()).isEqualTo("내 레이어");
    }

    @Test
    void 공유받은_사용자의_되돌리기도_403() throws Exception {
        user.as("bob");
        patchStyle("").andExpect(status().isForbidden());
        assertThat(styleInDb()).isEqualTo("{\"v\":1}");
    }

    // ---------- 컬럼 통계 조회 ----------

    @Test
    void 컬럼_통계는_볼_수_있는_사람에게만() throws Exception {
        user.as("alice");
        String body = mvc.perform(get("/api/mymap/" + layer.getId() + "/columns")).andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true))
                .andExpect(jsonPath("$.data.v").value(1))
                .andExpect(jsonPath("$.data.columns[0].name").value("이름"))
                .andExpect(jsonPath("$.data.columns[2].kind").value("number"))
                .andExpect(jsonPath("$.data.columns[2].min").value(900))
                .andExpect(jsonPath("$.data.columns[2].max").value(1100))
                .andReturn().getResponse().getContentAsString();
        JsonNode data = om.readTree(body).get("data");
        assertThat(data.get("columns").get(2).get("quantiles")).hasSize(21);

        user.as("carol", "EDITOR");
        mvc.perform(get("/api/mymap/" + layer.getId() + "/columns")).andExpect(status().isOk());
        user.as("mallory");
        mvc.perform(get("/api/mymap/" + layer.getId() + "/columns")).andExpect(status().isForbidden());
    }

    @Test
    void 처리_중인_레이어의_컬럼_통계는_409() throws Exception {
        jdbc.update("UPDATE tbl_user_map SET status = 'PROCESSING' WHERE id = ?", layer.getId());
        em.clear();
        user.as("alice");
        mvc.perform(get("/api/mymap/" + layer.getId() + "/columns")).andExpect(status().isConflict());
    }
}
