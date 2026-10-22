package com.gtp.domain.mymap.service;

import com.gtp.domain.mymap.dto.UserMapUpdateRequest;
import com.gtp.domain.mymap.entity.UserMap;
import com.gtp.domain.mymap.repository.*;
import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.util.ReflectionTestUtils;

import java.lang.reflect.Field;
import java.sql.Timestamp;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * lost update 방지(QA M2): 가져오기 작업·컬럼 통계 계산은 JDBC로 칸을 직접 쓰는데, 같은 트랜잭션에서 먼저 읽어 둔 엔티티가
 * 커밋(flush) 때 모든 칸을 다시 쓰면 그 값을 옛 값으로 덮는다. {@code @DynamicUpdate}로 바뀐 칸만 쓰게 해서 막는다.
 * 부분 수정 로직(null = 그대로)·updated_at 갱신·NOT NULL 칸은 그대로 동작해야 한다.
 */
@DataJpaTest
class UserMapDynamicUpdateTest {

    @Autowired UserMapRepository repo;
    @Autowired UserMapFeatureRepository featureRepo;
    @Autowired UserMapImportFailureRepository failureRepo;
    @Autowired UserMapUserAccessRepository userAccess;
    @Autowired UserMapPermissionAccessRepository permAccess;
    @Autowired EntityManager em;
    @Autowired JdbcTemplate jdbc;

    UserMapService service;

    @BeforeEach
    void setUp() {
        UserMapPermissionService perm = new UserMapPermissionService(userAccess, permAccess, em);
        service = new UserMapService(repo, featureRepo, failureRepo, perm, new MyMapColumnService(repo, perm, jdbc), jdbc);
    }

    private UserMap layer(String status) {
        UserMap m = repo.saveAndFlush(UserMap.builder().name("레이어").ownerId("alice").sourceType("EXCEL").sourceSrid("EPSG:4326").build());
        jdbc.update("UPDATE tbl_user_map SET status = ? WHERE id = ?", status, m.getId());
        em.clear();
        return m;
    }

    private void feature(long mapId, String props) {
        jdbc.update("INSERT INTO tbl_user_map_feature (user_map_id, geometry_json, properties_json) VALUES (?, '{}', ?)", mapId, props);
    }

    private static UserMapUpdateRequest req(String name, String style, Boolean visible) {
        UserMapUpdateRequest r = new UserMapUpdateRequest();
        ReflectionTestUtils.setField(r, "name", name);
        ReflectionTestUtils.setField(r, "styleConfig", style);
        ReflectionTestUtils.setField(r, "visible", visible);
        return r;
    }

    private Map<String, Object> row(long id) {
        em.flush();
        return jdbc.queryForMap("SELECT * FROM tbl_user_map WHERE id = ?", id);
    }

    @Test
    void 옛_레이어에_스타일을_저장해도_그_요청에서_계산한_컬럼_통계가_남는다() {
        UserMap m = layer("READY");
        jdbc.update("UPDATE tbl_user_map SET column_schema = NULL WHERE id = ?", m.getId());
        feature(m.getId(), "{\"이름\":\"서울\",\"직원수\":\"1100\"}");
        feature(m.getId(), "{\"이름\":\"세종\",\"직원수\":\"900\"}");
        em.clear();

        service.update(m.getId(), "alice", req(null, "{\"v\":1,\"label\":{\"field\":\"이름\"}}", null));

        Map<String, Object> r = row(m.getId());
        assertThat((String) r.get("STYLE_CONFIG")).contains("이름");
        assertThat((String) r.get("COLUMN_SCHEMA")).as("PATCH 중 계산한 통계가 엔티티 flush로 지워지지 않아야 한다")
                .isNotNull().contains("\"v\":1").contains("직원수").contains("\"rowCount\":2");
    }

    @Test
    void 옛_형식_컬럼_배열도_PATCH로_지워지지_않고_새_통계로_바뀐다() {
        UserMap m = layer("READY");
        jdbc.update("UPDATE tbl_user_map SET column_schema = ? WHERE id = ?", "[\"이름\"]", m.getId());
        feature(m.getId(), "{\"이름\":\"서울\"}");
        em.clear();

        service.update(m.getId(), "alice", req(null, "{\"v\":1,\"popup\":{\"fields\":[\"이름\"]}}", null));

        assertThat((String) row(m.getId()).get("COLUMN_SCHEMA")).startsWith("{").contains("\"v\":1");
    }

    @Test
    void 읽은_뒤_JDBC로_바뀐_상태와_진행률을_이름_수정이_옛_값으로_되돌리지_않는다() {
        UserMap m = layer("PROCESSING");
        // 서비스가 엔티티를 읽는 사이(같은 트랜잭션) 가져오기 작업이 진행률·결과를 JDBC로 기록하는 상황
        UserMap loaded = repo.findById(m.getId()).orElseThrow();
        assertThat(loaded.getStatus()).isEqualTo("PROCESSING");
        jdbc.update("UPDATE tbl_user_map SET status = 'READY', progress_total = 100, progress_done = 100, matched_count = 90, failed_count = 10,"
                + " feature_count = 90, geom_type = 'POLYGON', parcel_version = '2026-10', error_message = NULL WHERE id = ?", m.getId());

        loaded.applyPatch("새 이름", null, null, null);
        Map<String, Object> r = row(m.getId());

        assertThat(r.get("NAME")).isEqualTo("새 이름");
        assertThat(r.get("STATUS")).isEqualTo("READY");
        assertThat(((Number) r.get("PROGRESS_TOTAL")).intValue()).isEqualTo(100);
        assertThat(((Number) r.get("PROGRESS_DONE")).intValue()).isEqualTo(100);
        assertThat(((Number) r.get("MATCHED_COUNT")).intValue()).isEqualTo(90);
        assertThat(((Number) r.get("FAILED_COUNT")).intValue()).isEqualTo(10);
        assertThat(((Number) r.get("FEATURE_COUNT")).intValue()).isEqualTo(90);
        assertThat(r.get("GEOM_TYPE")).isEqualTo("POLYGON");
        assertThat(r.get("PARCEL_VERSION")).isEqualTo("2026-10");
    }

    @Test
    void 바꾼_칸만_쓰고_안_보낸_칸은_그대로_NOT_NULL_칸도_안_건드린다() {
        UserMap m = layer("READY");
        jdbc.update("UPDATE tbl_user_map SET description = '설명', style_config = '{\"v\":1}', visible = TRUE, progress_total = 7 WHERE id = ?", m.getId());
        em.clear();

        service.update(m.getId(), "alice", req(null, null, false));   // visible만 보낸다
        Map<String, Object> r = row(m.getId());

        assertThat(r.get("VISIBLE")).isEqualTo(false);
        assertThat(r.get("NAME")).isEqualTo("레이어");
        assertThat(r.get("DESCRIPTION")).isEqualTo("설명");
        assertThat(r.get("STYLE_CONFIG")).isEqualTo("{\"v\":1}");
        assertThat(((Number) r.get("PROGRESS_TOTAL")).intValue()).isEqualTo(7);
        assertThat(r.get("SOURCE_SRID")).isEqualTo("EPSG:4326");
        assertThat(r.get("OWNER_ID")).isEqualTo("alice");
    }

    @Test
    void 엔티티로_바꾼_값은_그대로_저장되고_빈_스타일은_지운다() {
        UserMap m = layer("PROCESSING");
        UserMap loaded = repo.findById(m.getId()).orElseThrow();
        loaded.markReady("POLYGON", 12);
        loaded.applyColumnSchema("{\"v\":1,\"rowCount\":12,\"truncated\":false,\"columns\":[]}");
        Map<String, Object> r = row(m.getId());
        assertThat(r.get("STATUS")).isEqualTo("READY");
        assertThat(r.get("GEOM_TYPE")).isEqualTo("POLYGON");
        assertThat(((Number) r.get("FEATURE_COUNT")).intValue()).isEqualTo(12);
        assertThat((String) r.get("COLUMN_SCHEMA")).contains("rowCount");

        jdbc.update("UPDATE tbl_user_map SET style_config = '{\"v\":1}' WHERE id = ?", m.getId());
        em.clear();
        service.update(m.getId(), "alice", req(null, "  ", null));   // 빈 값 = 기본으로
        assertThat(row(m.getId()).get("STYLE_CONFIG")).isNull();

        UserMap failed = repo.findById(m.getId()).orElseThrow();
        failed.markFailed("실패");
        assertThat(row(m.getId()).get("STATUS")).isEqualTo("FAILED");
        assertThat(row(m.getId()).get("ERROR_MESSAGE")).isEqualTo("실패");
    }

    @Test
    void 수정하면_updated_at이_갱신된다() {
        UserMap m = layer("READY");
        jdbc.update("UPDATE tbl_user_map SET updated_at = ? WHERE id = ?", Timestamp.valueOf("2020-01-01 00:00:00"), m.getId());
        em.clear();

        service.update(m.getId(), "alice", req("이름 바꿈", null, null));

        Timestamp after = (Timestamp) row(m.getId()).get("UPDATED_AT");
        assertThat(after).isAfter(Timestamp.valueOf("2021-01-01 00:00:00"));
    }

    @Test
    void 아무것도_안_바뀐_수정은_UPDATE를_보내지_않아_JDBC_값을_건드리지_않는다() {
        UserMap m = layer("READY");
        UserMap loaded = repo.findById(m.getId()).orElseThrow();
        jdbc.update("UPDATE tbl_user_map SET progress_done = 5 WHERE id = ?", m.getId());
        loaded.applyPatch(null, null, null, null);
        assertThat(((Number) row(m.getId()).get("PROGRESS_DONE")).intValue()).isEqualTo(5);
    }

    @Test
    void 엔티티에_낙관적_락_버전_칸이_없다_DynamicUpdate와_충돌할_것이_없다() {
        for (Field f : UserMap.class.getDeclaredFields()) {
            assertThat(f.isAnnotationPresent(jakarta.persistence.Version.class)).as(f.getName()).isFalse();
        }
        assertThat(UserMap.class.isAnnotationPresent(org.hibernate.annotations.DynamicUpdate.class)).isTrue();
    }
}
