package com.gtp.domain.mymap.service;

import com.gtp.domain.mymap.FakeShareDirectory;
import com.gtp.domain.mymap.controller.UserMapController;
import com.gtp.domain.mymap.entity.UserMap;
import com.gtp.domain.mymap.entity.UserMapPermissionAccess;
import com.gtp.domain.mymap.repository.*;
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
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** 공유 엔드포인트의 HTTP 계약(필드 이름·상태 코드)과 컨트롤러가 그룹 코드(역할+세부권한)로 보임 판정을 하는지 확인한다. */
@DataJpaTest
class UserMapShareControllerTest {

    @Autowired UserMapRepository repo;
    @Autowired UserMapFeatureRepository featureRepo;
    @Autowired UserMapImportFailureRepository failureRepo;
    @Autowired UserMapUserAccessRepository userAccess;
    @Autowired UserMapPermissionAccessRepository permAccess;
    @Autowired EntityManager em;
    @Autowired JdbcTemplate jdbc;

    String me = "alice";
    List<String> roles = List.of("MAP_USER");
    List<String> groups = List.of("MAP_USER");
    MockMvc mvc;
    UserMap mine, deptShared;

    @BeforeEach
    void setUp() {
        GisUserContext ctx = new GisUserContext() {
            @Override
            public String currentUserId() {
                return me;
            }

            @Override
            public List<String> currentRoleCodes() {
                return roles;
            }

            @Override
            public List<String> currentShareGroupCodes() {
                return groups;
            }
        };
        FakeShareDirectory dir = FakeShareDirectory.standard();
        UserMapPermissionService perm = new UserMapPermissionService(userAccess, permAccess, em);
        UserMapShareService share = new UserMapShareService(repo, userAccess, permAccess, dir);
        MyMapColumnService columns = new MyMapColumnService(repo, perm, jdbc);
        UserMapService service = new UserMapService(repo, featureRepo, failureRepo, perm, columns, jdbc, share);
        UserMapController controller = new UserMapController(service, mock(UserMapUploadService.class), mock(ImportReportService.class),
                mock(MyMapQuotaService.class), columns, mock(SampleService.class), ctx, share);
        mvc = MockMvcBuilders.standaloneSetup(controller).setControllerAdvice(new GlobalExceptionHandler()).build();

        mine = repo.saveAndFlush(UserMap.builder().name("내 것").ownerId("alice").sourceType("EXCEL").sourceSrid("EPSG:4326").build());
        deptShared = repo.saveAndFlush(UserMap.builder().name("부서A 공유").ownerId("bob").sourceType("EXCEL").sourceSrid("EPSG:4326").build());
        permAccess.saveAndFlush(UserMapPermissionAccess.builder().roleCode("MAP_USER:DEPT_A").userMap(deptShared).build());
        em.clear();
    }

    @Test
    void 부서_그룹_코드로_공유된_레이어는_그_코드를_가진_사용자의_목록과_상태에서_보인다() throws Exception {
        groups = List.of("MAP_USER");   // 세부권한 코드 없음 → 안 보인다
        mvc.perform(get("/api/mymap")).andExpect(status().isOk()).andExpect(jsonPath("$.data.length()").value(1));
        mvc.perform(get("/api/mymap/" + deptShared.getId() + "/status")).andExpect(status().isForbidden());

        groups = List.of("MAP_USER", "MAP_USER:DEPT_A");   // roles에는 세부권한이 없다 — 보임 판정은 그룹 코드로 해야 보인다
        mvc.perform(get("/api/mymap")).andExpect(status().isOk())
                .andExpect(jsonPath("$.data.length()").value(2))
                .andExpect(jsonPath("$.data[?(@.name=='부서A 공유')].ownerName").value("밥"))
                .andExpect(jsonPath("$.data[?(@.name=='부서A 공유')].shareCount").value((Object) null))
                .andExpect(jsonPath("$.data[?(@.name=='내 것')].shareCount").value(0));
        mvc.perform(get("/api/mymap/" + deptShared.getId() + "/status")).andExpect(status().isOk());
    }

    @Test
    void 단일_PUT_GET은_옛_필드와_새_필드를_함께_준다() throws Exception {
        mvc.perform(put("/api/mymap/" + mine.getId() + "/share").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"userIds\":[\"bob\",\"bob\",\"alice\"],\"roleCodes\":[\"MAP_USER:DEPT_A\"]}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data").doesNotExist());
        mvc.perform(get("/api/mymap/" + mine.getId() + "/share"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.userIds[0]").value("bob"))
                .andExpect(jsonPath("$.data.userIds.length()").value(1))
                .andExpect(jsonPath("$.data.roleCodes[0]").value("MAP_USER:DEPT_A"))
                .andExpect(jsonPath("$.data.users[0].userId").value("bob"))
                .andExpect(jsonPath("$.data.users[0].name").value("밥"))
                .andExpect(jsonPath("$.data.users[0].state").value("ACTIVE"))
                .andExpect(jsonPath("$.data.roles[0].code").value("MAP_USER:DEPT_A"))
                .andExpect(jsonPath("$.data.roles[0].label").value("부서A"))
                .andExpect(jsonPath("$.data.roles[0].state").value("ACTIVE"));
        mvc.perform(put("/api/mymap/" + mine.getId() + "/share").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"userIds\":[\"kim99\"],\"roleCodes\":[]}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("찾을 수 없는 대상이 있습니다: kim99"));
        mvc.perform(get("/api/mymap/" + deptShared.getId() + "/share")).andExpect(status().isForbidden());   // 소유자 아님
    }

    @Test
    void 여러_개_조회와_일괄_공유의_응답_모양() throws Exception {
        mvc.perform(post("/api/mymap/shares/bulk").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"ids\":[" + mine.getId() + "," + deptShared.getId() + "],\"mode\":\"ADD\",\"userIds\":[\"carol\"],\"roleCodes\":[\"MAP_USER\"]}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.succeededIds[0]").value(mine.getId().intValue()))
                .andExpect(jsonPath("$.data.failed[0].id").value(deptShared.getId().intValue()))
                .andExpect(jsonPath("$.data.failed[0].reason").value("NOT_AVAILABLE"));
        mvc.perform(get("/api/mymap/shares").param("ids", mine.getId() + "," + deptShared.getId()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.length()").value(1))
                .andExpect(jsonPath("$.data[0].id").value(mine.getId().intValue()))
                .andExpect(jsonPath("$.data[0].users[0].userId").value("carol"))
                .andExpect(jsonPath("$.data[0].roles[0].code").value("MAP_USER"));

        mvc.perform(get("/api/mymap/shares")).andExpect(status().isBadRequest());
        mvc.perform(get("/api/mymap/shares").param("ids", "abc")).andExpect(status().isBadRequest());
        mvc.perform(post("/api/mymap/shares/bulk").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"ids\":[" + mine.getId() + "],\"mode\":\"REPLACE\",\"userIds\":[\"carol\"],\"roleCodes\":[]}"))
                .andExpect(status().isBadRequest());
        mvc.perform(post("/api/mymap/shares/bulk").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"ids\":[" + mine.getId() + "],\"mode\":\"ADD\",\"userIds\":[\"nobody\"],\"roleCodes\":[]}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("찾을 수 없는 대상이 있습니다: nobody"));
        assertThat(jdbc.queryForList("SELECT user_id FROM tbl_user_map_user_access WHERE user_map_id = ?", String.class, mine.getId())).containsExactly("carol");
    }
}
