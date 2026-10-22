package com.gtp.domain.mymap.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.gtp.domain.mymap.entity.UserMap;
import com.gtp.domain.mymap.entity.UserMapPermissionAccess;
import com.gtp.domain.mymap.entity.UserMapUserAccess;
import com.gtp.domain.mymap.repository.*;
import com.gtp.domain.mymap.util.ColumnStatsCollector;
import com.gtp.domain.mymap.util.StyleConfigValidator;
import com.gtp.global.exception.CustomException;
import com.gtp.global.gis.GisErrorCode;
import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.jdbc.core.JdbcTemplate;

import java.util.ArrayList;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

@DataJpaTest
class MyMapColumnServiceTest {

    @Autowired
    UserMapRepository repo;
    @Autowired
    UserMapUserAccessRepository userAccess;
    @Autowired
    UserMapPermissionAccessRepository permAccess;
    @Autowired
    EntityManager em;
    @Autowired
    JdbcTemplate jdbc;

    final ObjectMapper om = new ObjectMapper();
    MyMapColumnService service;

    @BeforeEach
    void setUp() {
        service = new MyMapColumnService(repo, new UserMapPermissionService(userAccess, permAccess, em), jdbc);
    }

    private UserMap layer(String owner, String status) {
        UserMap m = repo.saveAndFlush(UserMap.builder().name("레이어").ownerId(owner).sourceType("EXCEL").sourceKind("EXCEL_PNU")
                .sourceSrid("EPSG:4326").build());
        jdbc.update("UPDATE tbl_user_map SET status = ? WHERE id = ?", status, m.getId());
        em.clear();
        return m;
    }

    private void feature(UserMap m, String props) {
        jdbc.update("INSERT INTO tbl_user_map_feature (user_map_id, geometry_json, properties_json) VALUES (?, '{}', ?)", m.getId(), props);
    }

    private String stored(UserMap m) {
        return jdbc.queryForObject("SELECT column_schema FROM tbl_user_map WHERE id = ?", String.class, m.getId());
    }

    private static CustomException caught(Runnable r) {
        try {
            r.run();
        } catch (CustomException e) {
            return e;
        }
        throw new AssertionError("CustomException이 나야 합니다");
    }

    @Test
    void 저장된_통계가_있으면_그대로_돌려주고_다시_계산하지_않는다() {
        UserMap m = layer("alice", "READY");
        ColumnStatsCollector c = new ColumnStatsCollector(List.of("이름", "직원수"));
        c.addRow(List.of("서울", "1100"));
        c.addRow(List.of("세종", "900"));
        jdbc.update("UPDATE tbl_user_map SET column_schema = ? WHERE id = ?", c.toJson(false), m.getId());
        feature(m, "{\"전혀\":\"다른 컬럼\"}");   // 피처를 읽어 다시 계산했다면 컬럼이 달라진다

        JsonNode r = service.columnsFor(m.getId(), "alice", List.of());
        assertThat(r.get("columns")).extracting(n -> n.get("name").asText()).containsExactly("이름", "직원수");
        assertThat(r.get("columns").get(1).get("kind").asText()).isEqualTo("number");
        assertThat(r.get("columns").get(1).get("min").asLong()).isEqualTo(900);
        assertThat(stored(m)).isEqualTo(c.toJson(false));
    }

    @Test
    void 통계가_없는_옛_레이어는_피처에서_계산해_저장한다() throws Exception {
        UserMap m = layer("alice", "READY");
        feature(m, "{\"이름\":\"서울\",\"직원수\":\"1,100\",\"구분\":\"청사\"}");
        feature(m, "{\"이름\":\"세종\",\"직원수\":\"900\",\"구분\":\"청사\"}");
        feature(m, "{\"이름\":\"부산\",\"직원수\":null,\"구분\":\"시설\"}");

        JsonNode r = service.columnsFor(m.getId(), "alice", List.of());
        assertThat(r.get("v").asInt()).isEqualTo(1);
        assertThat(r.get("rowCount").asLong()).isEqualTo(3);
        assertThat(r.get("truncated").asBoolean()).isFalse();
        assertThat(r.get("columns")).extracting(n -> n.get("name").asText()).containsExactly("이름", "직원수", "구분");
        JsonNode staff = r.get("columns").get(1);
        assertThat(staff.get("kind").asText()).isEqualTo("number");
        assertThat(staff.get("filled").asLong()).isEqualTo(2);       // null은 빈 값
        assertThat(staff.get("max").asLong()).isEqualTo(1100);

        // 저장됐다 — 다음부터는 읽기만
        assertThat(om.readTree(stored(m)).get("rowCount").asLong()).isEqualTo(3);
        feature(m, "{\"새컬럼\":\"x\"}");
        em.clear();
        assertThat(service.columnsFor(m.getId(), "alice", List.of()).get("rowCount").asLong()).isEqualTo(3);
    }

    @Test
    void 옛_형식_컬럼명_배열은_다시_계산한다() {
        UserMap m = layer("alice", "READY");
        jdbc.update("UPDATE tbl_user_map SET column_schema = ? WHERE id = ?", "[\"이름\",\"직원수\"]", m.getId());
        feature(m, "{\"이름\":\"서울\",\"직원수\":\"5\"}");
        em.clear();
        JsonNode r = service.columnsFor(m.getId(), "alice", List.of());
        assertThat(r.get("v").asInt()).isEqualTo(1);
        assertThat(r.get("columns").get(1).get("kind").asText()).isEqualTo("number");
    }

    @Test
    void 피처가_너무_많으면_앞쪽만_읽고_truncated() {
        UserMap m = layer("alice", "READY");
        List<Object[]> batch = new ArrayList<>();
        for (int i = 0; i < MyMapColumnService.LAZY_ROWS + 1; i++) batch.add(new Object[]{m.getId(), "{\"n\":\"" + (i + 1) + "\"}"});
        jdbc.batchUpdate("INSERT INTO tbl_user_map_feature (user_map_id, geometry_json, properties_json) VALUES (?, '{}', ?)", batch);
        JsonNode r = service.columnsFor(m.getId(), "alice", List.of());
        assertThat(r.get("rowCount").asLong()).isEqualTo(MyMapColumnService.LAZY_ROWS);
        assertThat(r.get("truncated").asBoolean()).isTrue();
    }

    @Test
    void 피처가_없는_READY_레이어는_빈_컬럼_목록() {
        UserMap m = layer("alice", "READY");
        JsonNode r = service.columnsFor(m.getId(), "alice", List.of());
        assertThat(r.get("columns")).isEmpty();
        assertThat(r.get("rowCount").asLong()).isZero();
    }

    @Test
    void 볼_수_있는_사람만_소유자_사용자_공유_역할_공유() {
        UserMap m = layer("alice", "READY");
        feature(m, "{\"a\":\"1\"}");
        userAccess.saveAndFlush(UserMapUserAccess.builder().userId("bob").userMap(repo.findById(m.getId()).orElseThrow()).build());
        permAccess.saveAndFlush(UserMapPermissionAccess.builder().roleCode("EDITOR").userMap(repo.findById(m.getId()).orElseThrow()).build());
        em.clear();

        assertThat(service.columnsFor(m.getId(), "alice", List.of()).get("columns")).hasSize(1);
        assertThat(service.columnsFor(m.getId(), "bob", List.of()).get("columns")).hasSize(1);
        assertThat(service.columnsFor(m.getId(), "carol", List.of("EDITOR")).get("columns")).hasSize(1);
        assertThat(caught(() -> service.columnsFor(m.getId(), "mallory", List.of("VIEWER"))).getErrorCode()).isEqualTo(GisErrorCode.USER_MAP_FORBIDDEN);
        assertThat(caught(() -> service.columnsFor(m.getId(), null, List.of())).getErrorCode()).isEqualTo(GisErrorCode.USER_MAP_FORBIDDEN);
        assertThat(caught(() -> service.columnsFor(99999L, "alice", List.of())).getErrorCode()).isEqualTo(GisErrorCode.USER_MAP_NOT_FOUND);
    }

    @Test
    void 처리_중이거나_실패한_레이어는_409() {
        UserMap processing = layer("alice", "PROCESSING");
        UserMap failed = layer("alice", "FAILED");
        assertThat(caught(() -> service.columnsFor(processing.getId(), "alice", List.of())).getErrorCode()).isEqualTo(GisErrorCode.USER_MAP_NOT_READY);
        assertThat(caught(() -> service.columnsFor(failed.getId(), "alice", List.of())).getErrorCode()).isEqualTo(GisErrorCode.USER_MAP_NOT_READY);
    }

    @Test
    void 스타일_검증용_컬럼_목록은_READY일_때만_이름과_종류를_준다() {
        UserMap ready = layer("alice", "READY");
        feature(ready, "{\"이름\":\"서울\",\"직원수\":\"1100\"}");
        feature(ready, "{\"이름\":\"세종\",\"직원수\":\"900\"}");
        UserMap processing = layer("alice", "PROCESSING");
        feature(processing, "{\"이름\":\"서울\"}");

        List<StyleConfigValidator.Column> cols = service.validationColumns(repo.findById(ready.getId()).orElseThrow());
        assertThat(cols).containsExactly(new StyleConfigValidator.Column("이름", "text"), new StyleConfigValidator.Column("직원수", "number"));
        assertThat(service.validationColumns(repo.findById(processing.getId()).orElseThrow())).isEmpty();
    }

    @Test
    void 다른_버전_통계는_믿지_않고_다시_계산한다() {
        UserMap m = layer("alice", "READY");
        jdbc.update("UPDATE tbl_user_map SET column_schema = ? WHERE id = ?",
                "{\"v\":2,\"rowCount\":1,\"columns\":[{\"name\":\"미래 형식\",\"kind\":\"number\"}]}", m.getId());
        feature(m, "{\"a\":\"1\"}");
        em.clear();
        JsonNode r = service.columnsFor(m.getId(), "alice", List.of());
        assertThat(r.get("v").asInt()).isEqualTo(1);
        assertThat(r.get("columns")).extracting(n -> n.get("name").asText()).containsExactly("a");
    }

    @Test
    void 앞쪽_일부로만_계산한_통계는_종류를_믿지_않고_이름만_검사한다() {
        UserMap m = layer("alice", "READY");
        ColumnStatsCollector c = new ColumnStatsCollector(List.of("이름", "직원수"));
        c.addRow(List.of("서울", "아님"));
        jdbc.update("UPDATE tbl_user_map SET column_schema = ? WHERE id = ?", c.toJson(true), m.getId());   // truncated = true
        em.clear();
        List<StyleConfigValidator.Column> cols = service.validationColumns(repo.findById(m.getId()).orElseThrow());
        assertThat(cols).containsExactly(new StyleConfigValidator.Column("이름", null), new StyleConfigValidator.Column("직원수", null));
        // 잘리지 않은 통계는 종류를 그대로 쓴다
        jdbc.update("UPDATE tbl_user_map SET column_schema = ? WHERE id = ?", c.toJson(false), m.getId());
        em.clear();
        assertThat(service.validationColumns(repo.findById(m.getId()).orElseThrow()))
                .containsExactly(new StyleConfigValidator.Column("이름", "text"), new StyleConfigValidator.Column("직원수", "text"));
    }

    @Test
    void 통계_형식이_깨져_있으면_다시_계산한다() {
        UserMap m = layer("alice", "READY");
        jdbc.update("UPDATE tbl_user_map SET column_schema = ? WHERE id = ?", "{깨진 json", m.getId());
        feature(m, "{\"a\":\"1\"}");
        em.clear();
        assertThat(service.columnsFor(m.getId(), "alice", List.of()).get("columns")).hasSize(1);
    }
}
