package com.gtp.domain.mymap.repository;

import com.gtp.domain.mymap.entity.UserMap;
import com.gtp.domain.mymap.entity.UserMapImportFailure;
import com.gtp.domain.mymap.entity.UserMapPermissionAccess;
import com.gtp.domain.mymap.entity.UserMapUserAccess;
import com.gtp.domain.mymap.service.UserMapService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;

import java.time.LocalDateTime;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

@DataJpaTest
class UserMapRepositoryTest {

    @Autowired
    UserMapRepository repo;
    @Autowired
    UserMapUserAccessRepository userAccess;
    @Autowired
    UserMapPermissionAccessRepository permAccess;
    @Autowired
    UserMapImportFailureRepository failures;

    UserMap a, b, c, d, e, f;

    private UserMap mk(String name, String owner) {
        return repo.saveAndFlush(UserMap.builder().name(name).ownerId(owner).sourceType("EXCEL").sourceSrid("EPSG:4326").build());
    }

    @BeforeEach
    void setUp() {
        a = mk("A alice", "alice");
        b = mk("B alice", "alice");
        c = mk("C bob→alice 사용자 공유", "bob");
        d = mk("D bob→EDITOR 역할 공유", "bob");
        e = mk("E bob 비공개", "bob");
        f = mk("F bob→carol", "bob");
        userAccess.save(UserMapUserAccess.builder().userId("alice").userMap(c).build());
        userAccess.save(UserMapUserAccess.builder().userId("carol").userMap(f).build());
        permAccess.save(UserMapPermissionAccess.builder().roleCode("EDITOR").userMap(d).build());
        repo.flush();
    }

    private List<String> visible(String user, String... roles) {
        List<String> r = roles.length == 0 ? List.of(UserMapService.NO_ROLE) : List.of(roles);
        return repo.findVisibleTo(user, r).stream().map(UserMap::getName).toList();
    }

    @Test
    void 내_것과_나에게_공유된_것_내_역할에_공유된_것만_보인다_최신순() {
        assertThat(visible("alice", "EDITOR")).containsExactly(d.getName(), c.getName(), b.getName(), a.getName());
    }

    @Test
    void 역할이_없으면_사용자_공유까지만() {
        assertThat(visible("alice")).containsExactly(c.getName(), b.getName(), a.getName());
    }

    @Test
    void 다른_역할이면_그_역할_공유는_안_보인다() {
        assertThat(visible("alice", "VIEWER")).containsExactly(c.getName(), b.getName(), a.getName());
    }

    @Test
    void 아무것도_없는_사용자는_빈_목록() {
        assertThat(visible("zed")).isEmpty();
        assertThat(visible("carol")).containsExactly(f.getName());   // carol은 F만 공유받음
    }

    @Test
    void 소유하면서_공유_대상이기도_해도_한_번만() {
        userAccess.saveAndFlush(UserMapUserAccess.builder().userId("alice").userMap(a).build());
        permAccess.saveAndFlush(UserMapPermissionAccess.builder().roleCode("EDITOR").userMap(a).build());
        assertThat(visible("alice", "EDITOR")).filteredOn(n -> n.equals(a.getName())).hasSize(1);
    }

    @Test
    void 역할_목록_자리_값은_NUL_문자가_아니다() {
        assertThat(UserMapService.NO_ROLE.chars().noneMatch(ch -> ch == 0)).isTrue();   // PostgreSQL은 NUL 문자를 문자열로 못 받는다
        assertThat(UserMapService.NO_ROLE).isNotBlank();
    }

    @Test
    void 개수_조회() {
        assertThat(repo.countByOwnerId("alice")).isEqualTo(2);
        assertThat(repo.countByOwnerId("bob")).isEqualTo(4);
        assertThat(repo.countByOwnerId("zed")).isZero();
        assertThat(repo.countByOwnerIdAndStatus("alice", "PROCESSING")).isEqualTo(2);
        assertThat(repo.countByOwnerIdAndStatus("alice", "READY")).isZero();
    }

    @Test
    void 같은_파일_해시로_찾는다() {
        UserMap h = repo.saveAndFlush(UserMap.builder().name("H").ownerId("alice").sourceType("EXCEL").sourceSrid("EPSG:4326").fileHash("abc").build());
        assertThat(repo.findAllByOwnerIdAndFileHashOrderByCreatedAtDesc("alice", "abc")).extracting(UserMap::getId).containsExactly(h.getId());
        assertThat(repo.findAllByOwnerIdAndFileHashOrderByCreatedAtDesc("bob", "abc")).isEmpty();   // 남의 파일 해시는 모른다
    }

    @Test
    void 새_칸의_기본값과_저장() {
        UserMap m = repo.saveAndFlush(UserMap.builder().name("N").ownerId("alice").sourceType("EXCEL").sourceKind("EXCEL_PNU")
                .sourceSrid("EPSG:4326").parcelVersion("2026-10").progressTotal(9).build());
        UserMap got = repo.findById(m.getId()).orElseThrow();
        assertThat(got.getSourceKind()).isEqualTo("EXCEL_PNU");
        assertThat(got.getProgressTotal()).isEqualTo(9);
        assertThat(got.getProgressDone()).isZero();
        assertThat(got.getMatchedCount()).isZero();
        assertThat(got.getFailedCount()).isZero();
        assertThat(got.getParcelVersion()).isEqualTo("2026-10");
        assertThat(got.getFileHash()).isNull();
    }

    // ---------- 실패 행 ----------

    private void fail(long mapId, int rowNo, String reason) {
        failures.save(UserMapImportFailure.builder().userMapId(mapId).rowNo(rowNo).reasonCode(reason).inputValue("v" + rowNo)
                .rowJson("{\"a\":\"" + rowNo + "\"}").createdAt(LocalDateTime.now()).build());
    }

    @Test
    void 실패_행_조회는_행_번호순_페이지_사유_필터_집계_삭제() {
        long id = a.getId();
        fail(id, 9, "PARCEL_NOT_FOUND");
        fail(id, 3, "PNU_FORMAT");
        fail(id, 7, "PARCEL_NOT_FOUND");
        fail(id, 5, "EMPTY");
        fail(b.getId(), 2, "EMPTY");   // 다른 레이어
        failures.flush();

        PageRequest p0 = PageRequest.of(0, 3, Sort.by("rowNo"));
        assertThat(failures.findByUserMapId(id, p0).getContent()).extracting(UserMapImportFailure::getRowNo).containsExactly(3, 5, 7);
        assertThat(failures.findByUserMapId(id, p0).getTotalElements()).isEqualTo(4);
        assertThat(failures.findByUserMapId(id, PageRequest.of(1, 3, Sort.by("rowNo"))).getContent())
                .extracting(UserMapImportFailure::getRowNo).containsExactly(9);
        assertThat(failures.findByUserMapIdAndReasonCode(id, "PARCEL_NOT_FOUND", p0).getContent())
                .extracting(UserMapImportFailure::getRowNo).containsExactly(7, 9);

        assertThat(failures.countByReason(id)).extracting(r -> r[0] + "=" + r[1])
                .containsExactlyInAnyOrder("PARCEL_NOT_FOUND=2", "PNU_FORMAT=1", "EMPTY=1");

        assertThat(failures.deleteByUserMapId(id)).isEqualTo(4);
        assertThat(failures.findByUserMapId(id, p0).getTotalElements()).isZero();
        assertThat(failures.findByUserMapId(b.getId(), p0).getTotalElements()).isEqualTo(1);   // 다른 레이어는 그대로
    }
}
