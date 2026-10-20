package com.gtp.domain.mymap.service;

import com.gtp.domain.mymap.dto.UserMapListItem;
import com.gtp.domain.mymap.dto.UserMapStatusResponse;
import com.gtp.domain.mymap.dto.UserMapUpdateRequest;
import com.gtp.domain.mymap.entity.UserMap;
import com.gtp.domain.mymap.entity.UserMapPermissionAccess;
import com.gtp.domain.mymap.entity.UserMapUserAccess;
import com.gtp.domain.mymap.repository.*;
import com.gtp.global.exception.CustomException;
import com.gtp.global.gis.GisErrorCode;
import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.jdbc.core.JdbcTemplate;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@DataJpaTest
class UserMapServiceTest {

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

    UserMapService service;
    UserMap mine, shared, roleShared, hidden;

    @BeforeEach
    void setUp() {
        UserMapPermissionService perm = new UserMapPermissionService(userAccess, permAccess, em);
        service = new UserMapService(repo, featureRepo, failureRepo, perm, jdbc);
        mine = repo.saveAndFlush(UserMap.builder().name("내 것").description("설명").styleConfig("{\"v\":1}").ownerId("alice")
                .sourceType("EXCEL").sourceKind("EXCEL_PNU").sourceSrid("EPSG:4326").parcelVersion("2026-10").build());
        shared = repo.saveAndFlush(UserMap.builder().name("공유받음").ownerId("bob").sourceType("SHP").sourceSrid("EPSG:5186").build());
        roleShared = repo.saveAndFlush(UserMap.builder().name("역할공유").ownerId("bob").sourceType("EXCEL").sourceSrid("EPSG:4326").build());
        hidden = repo.saveAndFlush(UserMap.builder().name("비공개").ownerId("bob").sourceType("EXCEL").sourceSrid("EPSG:4326").build());
        userAccess.saveAndFlush(UserMapUserAccess.builder().userId("alice").userMap(shared).build());
        permAccess.saveAndFlush(UserMapPermissionAccess.builder().roleCode("EDITOR").userMap(roleShared).build());
    }

    private static CustomException caught(Runnable r) {
        try {
            r.run();
        } catch (CustomException e) {
            return e;
        }
        throw new AssertionError("CustomException이 나야 합니다");
    }

    // ---------- 목록 ----------

    @Test
    void 목록은_소유_또는_공유이고_보낸_사람_종류_진행_정보를_담는다() {
        List<UserMapListItem> list = service.findVisibleTo("alice", List.of("EDITOR"));
        assertThat(list).extracting(UserMapListItem::getName).containsExactly("역할공유", "공유받음", "내 것");

        UserMapListItem own = list.get(2);
        assertThat(own.isOwner()).isTrue();
        assertThat(own.getOwnerId()).isEqualTo("alice");
        assertThat(own.getSourceKind()).isEqualTo("EXCEL_PNU");
        assertThat(own.getParcelVersion()).isEqualTo("2026-10");
        assertThat(own.getMatchedCount()).isZero();
        assertThat(own.getProgressTotal()).isZero();

        UserMapListItem fromBob = list.get(1);
        assertThat(fromBob.isOwner()).isFalse();
        assertThat(fromBob.getOwnerId()).isEqualTo("bob");          // 보낸 사람 표시용
        assertThat(fromBob.getSourceKind()).isEqualTo("SHP");       // 옛 행(source_kind null)은 source_type으로 채운다
    }

    @Test
    void 실패한_레이어의_이유가_목록에도_실린다() {
        jdbc.update("UPDATE tbl_user_map SET status = 'FAILED', error_message = ? WHERE id = ?", "지적도(또는 주소) 자료가 아직 준비되지 않았습니다.", mine.getId());
        em.clear();
        List<UserMapListItem> list = service.findVisibleTo("alice", List.of());
        assertThat(list.stream().filter(i -> i.getId().equals(mine.getId())).findFirst().orElseThrow().getErrorMessage())
                .isEqualTo("지적도(또는 주소) 자료가 아직 준비되지 않았습니다.");
        assertThat(list.stream().filter(i -> i.getId().equals(shared.getId())).findFirst().orElseThrow().getErrorMessage()).isNull();
    }

    @Test
    void 역할이_null이거나_비어도_동작한다() {
        assertThat(service.findVisibleTo("alice", null)).extracting(UserMapListItem::getName).containsExactly("공유받음", "내 것");
        assertThat(service.findVisibleTo("alice", List.of())).extracting(UserMapListItem::getName).containsExactly("공유받음", "내 것");
    }

    @Test
    void 옛_행은_source_kind가_null이어도_종류를_채운다() {
        UserMap old = repo.saveAndFlush(UserMap.builder().name("옛 엑셀").ownerId("alice").sourceType("EXCEL").sourceSrid("EPSG:4326").build());
        assertThat(new UserMapListItem(old, true).getSourceKind()).isEqualTo("EXCEL_COORD");
    }

    @Test
    void 상태에_진행률과_매칭_실패_수가_있다() {
        jdbc.update("UPDATE tbl_user_map SET progress_total = 5000, progress_done = 3120, matched_count = 3000, failed_count = 120, feature_count = 3000 WHERE id = ?", mine.getId());
        em.clear();
        UserMapStatusResponse s = service.getStatus(mine.getId(), "alice", List.of());
        assertThat(s.getProgressTotal()).isEqualTo(5000);
        assertThat(s.getProgressDone()).isEqualTo(3120);
        assertThat(s.getMatchedCount()).isEqualTo(3000);
        assertThat(s.getFailedCount()).isEqualTo(120);
        assertThat(s.getFeatureCount()).isEqualTo(3000);
        assertThat(s.getStatus()).isEqualTo("PROCESSING");
        assertThat(s.getParcelVersion()).isEqualTo("2026-10");   // 끝난 뒤 폴링 응답에서 바로 기준월을 받는다
        assertThat(s.getGeomType()).isNull();
        jdbc.update("UPDATE tbl_user_map SET geom_type = 'POLYGON' WHERE id = ?", mine.getId());
        em.clear();
        assertThat(service.getStatus(mine.getId(), "alice", List.of()).getGeomType()).isEqualTo("POLYGON");
        // 공유받은 사람도 상태는 볼 수 있다. 공유받지 않은 사람은 403
        assertThat(service.getStatus(shared.getId(), "alice", List.of()).getId()).isEqualTo(shared.getId());
        assertThat(caught(() -> service.getStatus(hidden.getId(), "alice", List.of())).getErrorCode()).isEqualTo(GisErrorCode.USER_MAP_FORBIDDEN);
    }

    // ---------- 부분 수정(PATCH) ----------

    private UserMapUpdateRequest patch(String name, String description, String style, Boolean visible) {
        UserMapUpdateRequest r = new UserMapUpdateRequest();
        r.setName(name);
        r.setDescription(description);
        r.setStyleConfig(style);
        r.setVisible(visible);
        return r;
    }

    private UserMap reload(UserMap m) {
        em.flush();
        em.clear();
        return repo.findById(m.getId()).orElseThrow();
    }

    @Test
    void null인_필드는_그대로_둔다() {
        service.update(mine.getId(), "alice", patch(null, "새 설명", null, null));
        UserMap m = reload(mine);
        assertThat(m.getName()).isEqualTo("내 것");           // 이름이 null이어도 실패하지 않고 그대로
        assertThat(m.getDescription()).isEqualTo("새 설명");
        assertThat(m.getStyleConfig()).isEqualTo("{\"v\":1}");
        assertThat(m.isVisible()).isTrue();                    // visible을 안 보내면(옛 동작은 false로 덮음) 그대로
    }

    @Test
    void 스타일만_바꿀_수_있다() {
        service.update(mine.getId(), "alice", patch(null, null, "{\"v\":1,\"fill\":\"#F26722\"}", null));
        UserMap m = reload(mine);
        assertThat(m.getStyleConfig()).contains("#F26722");
        assertThat(m.getName()).isEqualTo("내 것");
        assertThat(m.getDescription()).isEqualTo("설명");
    }

    @Test
    void 이름_공백은_무시_너무_긴_값은_칸에_맞춘다_빈_스타일은_지운다() {
        service.update(mine.getId(), "alice", patch("   ", "가".repeat(400), "", false));
        UserMap m = reload(mine);
        assertThat(m.getName()).isEqualTo("내 것");
        service.update(mine.getId(), "alice", patch("나".repeat(150), null, null, null));
        assertThat(reload(mine).getName()).hasSize(100);   // 칸 크기(100자)에 맞춰 자른다 — 넘으면 DB 오류(500)가 난다
        service.update(mine.getId(), "alice", patch("내 것", null, null, null));
        m = reload(mine);
        assertThat(m.getDescription()).hasSize(300);
        assertThat(m.getStyleConfig()).isNull();
        assertThat(m.isVisible()).isFalse();

        service.update(mine.getId(), "alice", patch("  새 이름  ", null, null, true));
        UserMap n = reload(mine);
        assertThat(n.getName()).isEqualTo("새 이름");
        assertThat(n.isVisible()).isTrue();
    }

    @Test
    void 잘못된_스타일은_거절하고_아무것도_바꾸지_않는다() {
        assertThat(caught(() -> service.update(mine.getId(), "alice", patch("바꾸려던 이름", null, "{깨진 json", null))).getErrorCode())
                .isEqualTo(GisErrorCode.MYMAP_STYLE_INVALID);
        assertThat(caught(() -> service.update(mine.getId(), "alice", patch(null, null, "[1,2]", null))).getErrorCode())
                .isEqualTo(GisErrorCode.MYMAP_STYLE_INVALID);
        String big = "{\"v\":1,\"x\":\"" + "a".repeat(17 * 1024) + "\"}";
        assertThat(caught(() -> service.update(mine.getId(), "alice", patch(null, null, big, null))).getErrorCode())
                .isEqualTo(GisErrorCode.MYMAP_STYLE_INVALID);
        assertThat(reload(mine).getName()).isEqualTo("내 것");
    }

    @Test
    void 소유자만_수정_삭제한다_공유받은_사람은_403() {
        assertThat(caught(() -> service.update(shared.getId(), "alice", patch("x", null, null, null))).getErrorCode()).isEqualTo(GisErrorCode.USER_MAP_FORBIDDEN);
        assertThat(caught(() -> service.delete(shared.getId(), "alice")).getErrorCode()).isEqualTo(GisErrorCode.USER_MAP_FORBIDDEN);
        assertThat(caught(() -> service.getShare(shared.getId(), "alice")).getErrorCode()).isEqualTo(GisErrorCode.USER_MAP_FORBIDDEN);
        assertThat(repo.findById(shared.getId())).isPresent();
    }

    // ---------- 삭제 ----------

    private void addChildren(UserMap m) {
        jdbc.update("INSERT INTO tbl_user_map_feature (user_map_id, geometry_json, properties_json, pnu, row_no) VALUES (?, '{}', '{}', '1114010300100310000', 2)", m.getId());
        jdbc.update("INSERT INTO tbl_user_map_import_failure (user_map_id, row_no, reason_code, row_json, created_at) VALUES (?, 3, 'EMPTY', '{}', CURRENT_TIMESTAMP)", m.getId());
    }

    private int count(String table, UserMap m) {
        return jdbc.queryForObject("SELECT count(*) FROM " + table + " WHERE user_map_id = ?", Integer.class, m.getId());
    }

    @Test
    void 삭제하면_피처_실패_행_공유가_함께_지워진다() {
        addChildren(mine);
        addChildren(hidden);
        userAccess.saveAndFlush(UserMapUserAccess.builder().userId("carol").userMap(mine).build());
        em.flush();
        em.clear();

        service.delete(mine.getId(), "alice");
        em.flush();

        assertThat(repo.findById(mine.getId())).isEmpty();
        assertThat(count("tbl_user_map_feature", mine)).isZero();
        assertThat(count("tbl_user_map_import_failure", mine)).isZero();
        assertThat(count("tbl_user_map_user_access", mine)).isZero();
        assertThat(count("tbl_user_map_feature", hidden)).isEqualTo(1);              // 다른 레이어는 그대로
        assertThat(count("tbl_user_map_import_failure", hidden)).isEqualTo(1);
    }

    @Test
    void 관리자_삭제도_실패_행을_함께_지운다() {
        addChildren(hidden);
        em.flush();
        em.clear();

        service.deleteAsAdmin(hidden.getId());
        em.flush();

        assertThat(repo.findById(hidden.getId())).isEmpty();
        assertThat(count("tbl_user_map_feature", hidden)).isZero();
        assertThat(count("tbl_user_map_import_failure", hidden)).isZero();
    }

    @Test
    void 없는_레이어는_404() {
        assertThatThrownBy(() -> service.delete(99999L, "alice")).isInstanceOfSatisfying(CustomException.class,
                e -> assertThat(e.getErrorCode()).isEqualTo(GisErrorCode.USER_MAP_NOT_FOUND));
    }

    @Test
    void 관리자_목록은_전체이고_owner는_false() {
        List<UserMapListItem> all = service.findAllForAdmin();
        assertThat(all).hasSize(4);
        assertThat(all).noneMatch(UserMapListItem::isOwner);
    }
}
