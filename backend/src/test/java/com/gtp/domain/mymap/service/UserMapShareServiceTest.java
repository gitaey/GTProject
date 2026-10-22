package com.gtp.domain.mymap.service;

import com.gtp.domain.mymap.FakeShareDirectory;
import com.gtp.domain.mymap.dto.*;
import com.gtp.domain.mymap.entity.UserMap;
import com.gtp.domain.mymap.entity.UserMapPermissionAccess;
import com.gtp.domain.mymap.entity.UserMapUserAccess;
import com.gtp.domain.mymap.repository.*;
import com.gtp.global.exception.CustomException;
import com.gtp.global.gis.GisErrorCode;
import com.gtp.global.gis.share.ShareGroupResponse;
import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.AdditionalAnswers;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.stream.IntStream;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;

/** 공유 저장·조회(단일 PUT/GET, 여러 개 조회, 일괄 더하기/빼기)와 목록 보강 — H2, 가짜 디렉터리. */
@DataJpaTest
class UserMapShareServiceTest {

    @Autowired UserMapRepository repo;
    @Autowired UserMapUserAccessRepository userAccess;
    @Autowired UserMapPermissionAccessRepository permAccess;
    @Autowired EntityManager em;
    @Autowired JdbcTemplate jdbc;

    final FakeShareDirectory dir = FakeShareDirectory.standard();
    UserMapShareService svc;
    UserMap l1, l2, foreign;

    @BeforeEach
    void setUp() {
        svc = new UserMapShareService(repo, userAccess, permAccess, dir);
        l1 = layer("레이어1", "alice");
        l2 = layer("레이어2", "alice");
        foreign = layer("남의 것", "bob");
        for (int i = 1; i <= 120; i++) dir.users.put("u" + i, new com.gtp.global.gis.share.GisShareDirectory.UserState("유저" + i, true));
    }

    private UserMap layer(String name, String owner) {
        return repo.saveAndFlush(UserMap.builder().name(name).ownerId(owner).sourceType("EXCEL").sourceSrid("EPSG:4326").build());
    }

    private void seedUser(UserMap m, String... ids) {
        for (String id : ids) userAccess.saveAndFlush(UserMapUserAccess.builder().userId(id).userMap(m).build());
    }

    private void seedRole(UserMap m, String... codes) {
        for (String c : codes) permAccess.saveAndFlush(UserMapPermissionAccess.builder().roleCode(c).userMap(m).build());
    }

    private List<String> usersOf(UserMap m) {
        em.flush();
        return jdbc.queryForList("SELECT user_id FROM tbl_user_map_user_access WHERE user_map_id = ? ORDER BY id", String.class, m.getId());
    }

    private List<String> rolesOf(UserMap m) {
        em.flush();
        return jdbc.queryForList("SELECT role_code FROM tbl_user_map_permission_access WHERE user_map_id = ? ORDER BY id", String.class, m.getId());
    }

    private static CustomException caught(Runnable r) {
        try {
            r.run();
        } catch (CustomException e) {
            return e;
        }
        throw new AssertionError("CustomException이 나야 합니다");
    }

    private static BulkShareRequest req(List<Long> ids, String mode, List<String> users, List<String> roles) {
        return new BulkShareRequest(ids, mode, users, roles);
    }

    // ---------- A3 조회 ----------

    @Test
    void 조회는_옛_필드_그대로에_이름과_상태를_붙인다() {
        seedUser(l1, "bob", "gone", "ghost", "dave");
        seedRole(l1, "MAP_USER", "DEPT_A");   // DEPT_A는 옛 세부권한 단독 코드 — 공유 가능한 그룹 목록에 없다
        UserMapShareResponse r = svc.get(l1.getId(), "alice");

        assertThat(r.getUserIds()).containsExactly("bob", "gone", "ghost", "dave");
        assertThat(r.getRoleCodes()).containsExactly("MAP_USER", "DEPT_A");
        assertThat(r.getUsers()).containsExactly(
                new ShareUserState("bob", "밥", "ACTIVE"),
                new ShareUserState("gone", "퇴사자", "INACTIVE"),
                new ShareUserState("ghost", null, "MISSING"),
                new ShareUserState("dave", null, "ACTIVE"));
        assertThat(r.getRoles()).containsExactly(
                new ShareRoleState("MAP_USER", "지도사용자", "ACTIVE"),
                new ShareRoleState("DEPT_A", null, "MISSING"));
    }

    @Test
    void 조회는_소유자만_없으면_404() {
        assertThat(caught(() -> svc.get(foreign.getId(), "alice")).getErrorCode()).isEqualTo(GisErrorCode.USER_MAP_FORBIDDEN);
        assertThat(caught(() -> svc.get(99999L, "alice")).getErrorCode()).isEqualTo(GisErrorCode.USER_MAP_NOT_FOUND);
    }

    // ---------- A4 단일 저장 ----------

    @Test
    void 중복_빈값_본인은_걸러내고_500없이_저장한다() {
        svc.replace(l1.getId(), "alice", java.util.Arrays.asList(" bob", "bob", "", null, "alice", "carol "), java.util.Arrays.asList("MAP_USER", "MAP_USER", " "));
        assertThat(usersOf(l1)).containsExactly("bob", "carol");
        assertThat(rolesOf(l1)).containsExactly("MAP_USER");
    }

    @Test
    void 바뀌지_않은_행은_그대로_두고_빠진_것만_지운다() {
        seedUser(l1, "bob", "carol");
        List<Long> before = jdbc.queryForList("SELECT id FROM tbl_user_map_user_access WHERE user_id = 'bob'", Long.class);
        svc.replace(l1.getId(), "alice", List.of("bob", "dave"), List.of());
        assertThat(usersOf(l1)).containsExactly("bob", "dave");
        assertThat(jdbc.queryForList("SELECT id FROM tbl_user_map_user_access WHERE user_id = 'bob'", Long.class)).isEqualTo(before);
    }

    @Test
    void 이미_저장된_없는_대상은_남길_수_있고_새로_넣는_없는_대상만_거절한다() {
        seedUser(l1, "ghost");
        seedRole(l1, "DEPT_A");
        svc.replace(l1.getId(), "alice", List.of("bob", "ghost"), List.of("MAP_USER", "DEPT_A"));   // ghost·DEPT_A는 기존 → 통과
        assertThat(usersOf(l1)).containsExactlyInAnyOrder("bob", "ghost");
        assertThat(rolesOf(l1)).containsExactlyInAnyOrder("MAP_USER", "DEPT_A");

        CustomException e = caught(() -> svc.replace(l1.getId(), "alice", List.of("bob", "kim99"), List.of("DEPT_X")));
        assertThat(e.getErrorCode()).isEqualTo(GisErrorCode.SHARE_TARGET_INVALID);
        assertThat(e.getMessage()).isEqualTo("찾을 수 없는 대상이 있습니다: kim99, DEPT_X");
        assertThat(usersOf(l1)).containsExactlyInAnyOrder("bob", "ghost");   // 거절하면 아무것도 바뀌지 않는다
        assertThat(rolesOf(l1)).containsExactlyInAnyOrder("MAP_USER", "DEPT_A");
    }

    @Test
    void 비활성_사용자와_공유할_수_없는_그룹은_새로_추가할_수_없다() {
        assertThat(caught(() -> svc.replace(l1.getId(), "alice", List.of("gone"), List.of())).getErrorCode()).isEqualTo(GisErrorCode.SHARE_TARGET_INVALID);
        assertThat(caught(() -> svc.replace(l1.getId(), "alice", List.of(), List.of("SUPER_ADMIN"))).getErrorCode()).isEqualTo(GisErrorCode.SHARE_TARGET_INVALID);
        assertThat(usersOf(l1)).isEmpty();
    }

    @Test
    void 오류_메시지는_열_개까지만_보이고_나머지는_외_n() {
        List<String> bad = IntStream.rangeClosed(1, 13).mapToObj(i -> "nobody" + i).toList();
        CustomException e = caught(() -> svc.replace(l1.getId(), "alice", bad, List.of()));
        assertThat(e.getMessage()).endsWith("nobody10 외 3").contains("nobody1,");
        assertThat(e.getMessage()).doesNotContain("nobody11");
        String longId = "x".repeat(300);
        assertThat(caught(() -> svc.replace(l1.getId(), "alice", List.of(longId), List.of())).getMessage()).hasSizeLessThan(100);
    }

    @Test
    void 대상은_합계_100개까지() {
        List<String> hundred = IntStream.rangeClosed(1, 100).mapToObj(i -> "u" + i).toList();
        svc.replace(l1.getId(), "alice", hundred, List.of());
        assertThat(usersOf(l1)).hasSize(100);

        List<String> over = new ArrayList<>(hundred);
        over.add("u101");
        CustomException e = caught(() -> svc.replace(l2.getId(), "alice", over, List.of()));
        assertThat(e.getErrorCode()).isEqualTo(GisErrorCode.SHARE_TARGET_LIMIT);
        assertThat(caught(() -> svc.replace(l2.getId(), "alice", hundred, List.of("MAP_USER"))).getErrorCode()).isEqualTo(GisErrorCode.SHARE_TARGET_LIMIT);
        assertThat(usersOf(l2)).isEmpty();
        // 본인·중복은 세기 전에 걸러진다 — 101개를 보내도 정리하면 100개면 통과
        List<String> withSelf = new ArrayList<>(hundred);
        withSelf.add("alice");
        withSelf.add("u1");
        svc.replace(l2.getId(), "alice", withSelf, List.of());
        assertThat(usersOf(l2)).hasSize(100);
    }

    @Test
    void 소유자만_바꿀_수_있고_빈_목록은_전부_지운다() {
        seedUser(foreign, "carol");
        assertThat(caught(() -> svc.replace(foreign.getId(), "alice", List.of("bob"), List.of())).getErrorCode()).isEqualTo(GisErrorCode.USER_MAP_FORBIDDEN);
        assertThat(usersOf(foreign)).containsExactly("carol");

        seedUser(l1, "bob");
        seedRole(l1, "MAP_USER");
        svc.replace(l1.getId(), "alice", null, null);
        assertThat(usersOf(l1)).isEmpty();
        assertThat(rolesOf(l1)).isEmpty();
    }

    // ---------- A5 여러 개 조회 ----------

    @Test
    void 여러_개_조회는_내_것만_요청_순서로_남의_것과_없는_것은_뺀다() {
        seedUser(l1, "bob");
        seedUser(foreign, "carol");
        seedRole(l2, "MAP_USER");
        String ids = foreign.getId() + "," + l2.getId() + ", " + l1.getId() + ",99999," + l2.getId();
        List<ShareSnapshotResponse> r = svc.snapshots(ids, "alice");
        assertThat(r).extracting(ShareSnapshotResponse::id).containsExactly(l2.getId(), l1.getId());
        assertThat(r.get(0).roles()).containsExactly(new ShareRoleState("MAP_USER", "지도사용자", "ACTIVE"));
        assertThat(r.get(1).users()).containsExactly(new ShareUserState("bob", "밥", "ACTIVE"));
        assertThat(r.get(1).roles()).isEmpty();
        assertThat(dir.lookups).hasSize(1);   // 사용자 이름 조회는 한 번(IN)
    }

    @Test
    void 여러_개_조회의_ids가_잘못되면_400() {
        for (String bad : new String[]{null, "", "  ", " , ", "abc", "1,x"}) {
            assertThat(caught(() -> svc.snapshots(bad, "alice")).getErrorCode()).as("ids=%s", bad).isEqualTo(GisErrorCode.SHARE_BULK_INVALID);
        }
        String fifty = String.join(",", IntStream.rangeClosed(1000, 1049).mapToObj(String::valueOf).toList());
        assertThat(svc.snapshots(fifty, "alice")).isEmpty();                                   // 50개는 허용
        assertThat(caught(() -> svc.snapshots(fifty + ",1050", "alice")).getErrorCode()).isEqualTo(GisErrorCode.SHARE_BULK_INVALID);
        assertThat(svc.snapshots("5000,5000", "alice")).isEmpty();                                 // 중복은 하나로
    }

    // ---------- A6 일괄 ----------

    @Test
    void 일괄_더하기는_기존_공유에_합치고_다시_해도_중복이_없다() {
        seedUser(l1, "dave");
        BulkShareRequest r = req(List.of(l1.getId(), l2.getId()), "ADD", List.of("bob", "carol"), List.of("MAP_USER"));
        BulkShareResponse res = svc.bulk("alice", r);
        assertThat(res.succeededIds()).containsExactly(l1.getId(), l2.getId());
        assertThat(res.failed()).isEmpty();
        assertThat(usersOf(l1)).containsExactly("dave", "bob", "carol");
        assertThat(usersOf(l2)).containsExactly("bob", "carol");
        assertThat(rolesOf(l1)).containsExactly("MAP_USER");

        BulkShareResponse again = svc.bulk("alice", r);   // 이미 공유됨 → 바뀐 것 없이 성공
        assertThat(again.succeededIds()).containsExactly(l1.getId(), l2.getId());
        assertThat(usersOf(l1)).containsExactly("dave", "bob", "carol");
    }

    @Test
    void 일괄_빼기는_지정한_대상만_지우고_없는_대상은_조용히_넘어간다() {
        seedUser(l1, "bob", "carol", "ghost");
        seedRole(l1, "MAP_USER", "MAP_USER:DEPT_A");
        seedUser(l2, "bob");
        BulkShareResponse res = svc.bulk("alice", req(List.of(l1.getId(), l2.getId()), "REMOVE", List.of("bob", "ghost", "nobody"), List.of("MAP_USER")));
        assertThat(res.succeededIds()).containsExactly(l1.getId(), l2.getId());
        assertThat(usersOf(l1)).containsExactly("carol");
        assertThat(rolesOf(l1)).containsExactly("MAP_USER:DEPT_A");
        assertThat(usersOf(l2)).isEmpty();
        assertThat(dir.lookups).isEmpty();   // 빼기는 존재 검사를 하지 않는다(탈퇴한 사람도 뺄 수 있어야 한다)
    }

    @Test
    void 남의_레이어와_없는_레이어는_건너뛰고_사유를_돌려준다() {
        seedUser(foreign, "carol");
        BulkShareResponse res = svc.bulk("alice", req(List.of(l1.getId(), foreign.getId(), 99999L), "ADD", List.of("bob"), List.of()));
        assertThat(res.succeededIds()).containsExactly(l1.getId());
        assertThat(res.failed()).containsExactly(
                new BulkShareResponse.Failed(foreign.getId(), "NOT_AVAILABLE"),
                new BulkShareResponse.Failed(99999L, "NOT_AVAILABLE"));
        assertThat(usersOf(foreign)).containsExactly("carol");   // 남의 것은 그대로
        assertThat(usersOf(l1)).containsExactly("bob");

        BulkShareResponse rm = svc.bulk("alice", req(List.of(foreign.getId()), "REMOVE", List.of("carol"), List.of()));
        assertThat(rm.succeededIds()).isEmpty();
        assertThat(usersOf(foreign)).containsExactly("carol");
    }

    @Test
    void 더하고_나서_100개를_넘는_레이어만_LIMIT_EXCEEDED로_건너뛴다() {
        for (int i = 1; i <= 99; i++) seedUser(l2, "old" + i);
        BulkShareResponse res = svc.bulk("alice", req(List.of(l1.getId(), l2.getId()), "ADD", List.of("bob", "carol"), List.of()));
        assertThat(res.succeededIds()).containsExactly(l1.getId());
        assertThat(res.failed()).containsExactly(new BulkShareResponse.Failed(l2.getId(), "LIMIT_EXCEEDED"));
        assertThat(usersOf(l2)).hasSize(99);   // 일부만 넣지 않는다
        assertThat(usersOf(l1)).containsExactly("bob", "carol");

        BulkShareResponse exact = svc.bulk("alice", req(List.of(l2.getId()), "ADD", List.of("bob"), List.of()));   // 정확히 100개는 허용
        assertThat(exact.succeededIds()).containsExactly(l2.getId());
        assertThat(usersOf(l2)).hasSize(100);
    }

    @Test
    void 대상이_잘못이면_400이고_어느_레이어도_바뀌지_않는다() {
        seedUser(l2, "carol");
        CustomException e = caught(() -> svc.bulk("alice", req(List.of(l1.getId(), l2.getId()), "ADD", List.of("bob", "kim99", "gone"), List.of("DEPT_X"))));
        assertThat(e.getErrorCode()).isEqualTo(GisErrorCode.SHARE_TARGET_INVALID);
        assertThat(e.getMessage()).isEqualTo("찾을 수 없는 대상이 있습니다: kim99, gone, DEPT_X");
        assertThat(usersOf(l1)).isEmpty();
        assertThat(usersOf(l2)).containsExactly("carol");
        assertThat(rolesOf(l1)).isEmpty();
    }

    @Test
    void 본인_아이디는_조용히_빼고_본인만_보내면_400() {
        svc.bulk("alice", req(List.of(l1.getId()), "ADD", List.of("alice", "bob"), List.of()));
        assertThat(usersOf(l1)).containsExactly("bob");
        assertThat(caught(() -> svc.bulk("alice", req(List.of(l1.getId()), "ADD", List.of("alice"), List.of()))).getErrorCode())
                .isEqualTo(GisErrorCode.SHARE_BULK_INVALID);
    }

    @Test
    void 요청_형식_검사_ids_50개_mode_대상_1에서_100개() {
        List<Long> one = List.of(l1.getId());
        List<Long> fiftyOne = new ArrayList<>(IntStream.rangeClosed(1, 51).mapToObj(Long::valueOf).toList());
        for (BulkShareRequest bad : new BulkShareRequest[]{
                null,
                req(null, "ADD", List.of("bob"), List.of()),
                req(List.of(), "ADD", List.of("bob"), List.of()),
                req(fiftyOne, "ADD", List.of("bob"), List.of()),
                req(one, null, List.of("bob"), List.of()),
                req(one, "REPLACE", List.of("bob"), List.of()),     // 덮어쓰기는 없다
                req(one, "ADD", null, null),
                req(one, "ADD", List.of(" ", ""), List.of())}) {
            assertThat(caught(() -> svc.bulk("alice", bad)).getErrorCode()).isEqualTo(GisErrorCode.SHARE_BULK_INVALID);
        }
        List<String> over = IntStream.rangeClosed(1, 101).mapToObj(i -> "u" + i).toList();
        assertThat(caught(() -> svc.bulk("alice", req(one, "ADD", over, List.of()))).getErrorCode()).isEqualTo(GisErrorCode.SHARE_TARGET_LIMIT);

        svc.bulk("alice", req(one, " add ", List.of("bob"), List.of()));   // 대소문자·공백은 허용
        assertThat(usersOf(l1)).containsExactly("bob");
        assertThat(usersOf(l1)).isNotEmpty();
    }

    @Test
    void 레이어_id가_중복이어도_한_번만_처리한다() {
        BulkShareResponse res = svc.bulk("alice", req(List.of(l1.getId(), l1.getId()), "ADD", List.of("bob"), List.of()));
        assertThat(res.succeededIds()).containsExactly(l1.getId());
        assertThat(usersOf(l1)).containsExactly("bob");
    }

    @Test
    void 저장_중_유니크_충돌은_409_SHARE_CONFLICT() {
        UserMapUserAccessRepository racing = mock(UserMapUserAccessRepository.class, AdditionalAnswers.delegatesTo(userAccess));
        doThrow(new DataIntegrityViolationException("duplicate key")).when(racing).saveAllAndFlush(any());
        UserMapShareService racy = new UserMapShareService(repo, racing, permAccess, dir);
        CustomException bulk = caught(() -> racy.bulk("alice", req(List.of(l1.getId()), "ADD", List.of("bob"), List.of())));
        assertThat(bulk.getErrorCode()).isEqualTo(GisErrorCode.SHARE_CONFLICT);
        CustomException put = caught(() -> racy.replace(l1.getId(), "alice", List.of("bob"), List.of()));
        assertThat(put.getErrorCode()).isEqualTo(GisErrorCode.SHARE_CONFLICT);
        assertThat(GisErrorCode.SHARE_CONFLICT.getStatus().value()).isEqualTo(409);
    }

    @Test
    void 쓰기_메서드는_트랜잭션_하나로_묶인다() throws Exception {
        assertThat(UserMapShareService.class.getMethod("bulk", String.class, BulkShareRequest.class).isAnnotationPresent(Transactional.class)).isTrue();
        assertThat(UserMapShareService.class.getMethod("replace", Long.class, String.class, List.class, List.class).isAnnotationPresent(Transactional.class)).isTrue();
        // 클래스 수준 readOnly가 쓰기를 덮지 않는다
        assertThat(UserMapShareService.class.getMethod("bulk", String.class, BulkShareRequest.class).getAnnotation(Transactional.class).readOnly()).isFalse();
    }

    // ---------- 목록 보강 ----------

    @Test
    void 이름_조회는_트랜잭션_밖에서_돈다_실패를_삼켜도_커밋이_안전하다() throws Exception {
        // PostgreSQL은 SQL 오류 뒤 그 트랜잭션이 aborted가 되어 커밋 때 예외가 난다. H2로는 재현이 안 돼서 구조로 고정한다:
        // 목록 조회(findVisibleTo)와 이름 조회(ownerNames)는 바깥 트랜잭션을 만들지 않고, 공유 수 집계만 자기 읽기 전용 트랜잭션을 갖는다.
        assertThat(UserMapService.class.getMethod("findVisibleTo", String.class, List.class).isAnnotationPresent(Transactional.class)).isFalse();
        assertThat(UserMapService.class.isAnnotationPresent(Transactional.class)).isFalse();
        assertThat(UserMapShareService.class.getMethod("ownerNames", java.util.Collection.class).isAnnotationPresent(Transactional.class)).isFalse();
        assertThat(UserMapShareService.class.isAnnotationPresent(Transactional.class)).isFalse();
        assertThat(UserMapShareService.class.getMethod("shareCounts", java.util.Collection.class).getAnnotation(Transactional.class).readOnly()).isTrue();
    }

    @Test
    void 공유_수와_보낸_사람_이름() {
        seedUser(l1, "bob", "carol");
        seedRole(l1, "MAP_USER");
        seedUser(l2, "bob");
        Map<Long, Integer> counts = svc.shareCounts(List.of(l1.getId(), l2.getId()));
        assertThat(counts).containsEntry(l1.getId(), 3).containsEntry(l2.getId(), 1);
        assertThat(svc.shareCounts(List.of())).isEmpty();
        assertThat(svc.shareCounts(List.of(foreign.getId()))).doesNotContainKey(foreign.getId());

        assertThat(svc.ownerNames(List.of("bob", "dave", "ghost"))).containsOnlyKeys("bob").containsEntry("bob", "밥");
        dir.failLookup = true;
        assertThat(svc.ownerNames(List.of("bob"))).isEmpty();   // 이름 조회 실패가 목록을 막지 않는다
    }

    @Test
    void 목록에_보낸_사람_이름과_내_항목_공유_수가_붙는다() {
        UserMapPermissionService perm = new UserMapPermissionService(userAccess, permAccess, em);
        UserMapService list = new UserMapService(repo, mock(UserMapFeatureRepository.class), mock(UserMapImportFailureRepository.class),
                perm, mock(MyMapColumnService.class), jdbc, svc);
        seedUser(l1, "bob", "carol");
        seedRole(l1, "MAP_USER");
        seedUser(foreign, "alice");
        em.clear();

        List<UserMapListItem> items = list.findVisibleTo("alice", List.of());
        UserMapListItem mine = items.stream().filter(i -> i.getId().equals(l1.getId())).findFirst().orElseThrow();
        UserMapListItem none = items.stream().filter(i -> i.getId().equals(l2.getId())).findFirst().orElseThrow();
        UserMapListItem fromBob = items.stream().filter(i -> i.getId().equals(foreign.getId())).findFirst().orElseThrow();
        assertThat(mine.getShareCount()).isEqualTo(3);
        assertThat(mine.getOwnerName()).isNull();
        assertThat(none.getShareCount()).isZero();
        assertThat(fromBob.getOwnerName()).isEqualTo("밥");
        assertThat(fromBob.getShareCount()).isNull();

        dir.failLookup = true;   // 이름 조회가 실패해도 목록은 나간다
        UserMapListItem fallback = list.findVisibleTo("alice", List.of()).stream().filter(i -> i.getId().equals(foreign.getId())).findFirst().orElseThrow();
        assertThat(fallback.getOwnerName()).isNull();
        assertThat(fallback.getOwnerId()).isEqualTo("bob");
    }

    @Test
    void 세부권한_그룹_코드로_공유한_레이어가_그_그룹_사용자에게_보인다() {
        dir.groups.add(new ShareGroupResponse("MAP_USER:DEPT_B", "부서B", "MAP_USER"));
        svc.replace(l1.getId(), "alice", List.of(), List.of("MAP_USER:DEPT_A"));
        UserMapPermissionService perm = new UserMapPermissionService(userAccess, permAccess, em);
        UserMapService list = new UserMapService(repo, mock(UserMapFeatureRepository.class), mock(UserMapImportFailureRepository.class),
                perm, mock(MyMapColumnService.class), jdbc, svc);
        em.clear();
        // 부서A 그룹 코드를 가진 사용자(역할+역할:세부)는 보이고, 부서B·역할만 가진 사용자는 안 보인다
        assertThat(list.findVisibleTo("zed", List.of("MAP_USER", "MAP_USER:DEPT_A"))).extracting(UserMapListItem::getId).contains(l1.getId());
        assertThat(list.findVisibleTo("zed", List.of("MAP_USER", "MAP_USER:DEPT_B"))).extracting(UserMapListItem::getId).doesNotContain(l1.getId());
        assertThat(list.findVisibleTo("zed", List.of("MAP_USER"))).extracting(UserMapListItem::getId).doesNotContain(l1.getId());
        assertThat(perm.canView(repo.findById(l1.getId()).orElseThrow(), "zed", List.of("MAP_USER", "MAP_USER:DEPT_A"))).isTrue();
        assertThat(perm.canView(repo.findById(l1.getId()).orElseThrow(), "zed", List.of("MAP_USER"))).isFalse();
    }
}
