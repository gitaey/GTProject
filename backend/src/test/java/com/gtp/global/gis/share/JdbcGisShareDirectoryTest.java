package com.gtp.global.gis.share;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/** H2에 GTProject 표 모양(tbl_user·tbl_role·tbl_permission)을 만들어 SQL을 검증한다. 가짜 데이터만 쓴다. */
class JdbcGisShareDirectoryTest {

    JdbcTemplate jdbc;
    JdbcGisShareDirectory dir;

    @BeforeEach
    void setUp() {
        DriverManagerDataSource ds = new DriverManagerDataSource("jdbc:h2:mem:share_dir;DB_CLOSE_DELAY=-1;MODE=PostgreSQL", "sa", "");
        jdbc = new JdbcTemplate(ds);
        jdbc.execute("DROP ALL OBJECTS");
        jdbc.execute("CREATE TABLE tbl_role (code VARCHAR(30) PRIMARY KEY, label VARCHAR(50) NOT NULL, has_sub_permission BOOLEAN NOT NULL, is_super BOOLEAN NOT NULL, sort_order INT NOT NULL)");
        jdbc.execute("CREATE TABLE tbl_permission (code VARCHAR(30) PRIMARY KEY, role_code VARCHAR(30) NOT NULL, label VARCHAR(50) NOT NULL, sort_order INT NOT NULL)");
        jdbc.execute("CREATE TABLE tbl_user (user_id VARCHAR(50) PRIMARY KEY, user_name VARCHAR(50), nickname VARCHAR(30), permission VARCHAR(30), status VARCHAR(20) NOT NULL)");
        dir = new JdbcGisShareDirectory(jdbc);

        jdbc.update("INSERT INTO tbl_role VALUES ('SUPER_ADMIN','슈퍼관리자',FALSE,TRUE,1)");
        jdbc.update("INSERT INTO tbl_role VALUES ('MAP_ADMIN','지도관리자',FALSE,FALSE,2)");
        jdbc.update("INSERT INTO tbl_role VALUES ('MAP_USER','지도사용자',TRUE,FALSE,3)");
        jdbc.update("INSERT INTO tbl_permission VALUES ('DEPT_B','MAP_USER','부서B',3)");
        jdbc.update("INSERT INTO tbl_permission VALUES ('VIEWER','MAP_USER','뷰어',1)");
        jdbc.update("INSERT INTO tbl_permission VALUES ('DEPT_A','MAP_USER','부서A',2)");

        user("alice", "앨리스", "앨", "DEPT_A", "ACTIVE");
        user("kim01", "김철수", "철수", "DEPT_A", "ACTIVE");
        user("kim02", "김영희", "영희", null, "ACTIVE");
        user("KimBo", "김보라", "보라", "VIEWER", "ACTIVE");
        user("oldkim", "김퇴사", "퇴사", null, "INACTIVE");
        user("xkim", "박", "박박", null, "ACTIVE");
        user("lee_1", "이_일", "일", null, "ACTIVE");
        user("leeX1", "이엑스", "엑스", null, "ACTIVE");
        user("p%ct", "100%할인", "할인", null, "ACTIVE");
        user("z0", "z0z", "제로", null, "ACTIVE");
        user("nonick", null, "별명이", null, "ACTIVE");
        user("ab", "zzz", "에이비", null, "ACTIVE");
        user("abc", "aaa", "에이비씨", null, "ACTIVE");
    }

    private void user(String id, String name, String nick, String perm, String status) {
        jdbc.update("INSERT INTO tbl_user (user_id, user_name, nickname, permission, status) VALUES (?,?,?,?,?)", id, name, nick, perm, status);
    }

    private List<String> ids(String q, String me, int limit) {
        return dir.searchUsers(q, me, limit).stream().map(ShareUserResponse::userId).toList();
    }

    @Test
    void 이름과_별명은_부분_일치() {
        assertThat(ids("철수", "me", 10)).containsExactly("kim01");     // 이름·별명 모두 걸린다
        assertThat(ids("영", "me", 10)).containsExactly("kim02");
        assertThat(ids("별명", "me", 10)).containsExactly("nonick");
    }

    @Test
    void 아이디는_앞부분만_일치하고_대소문자를_가리지_않는다() {
        assertThat(ids("kim", "me", 10)).containsExactly("KimBo", "kim02", "kim01");   // 이름순(보라·영희·철수). xkim(중간 일치)·oldkim(비활성)은 없다
        assertThat(ids("KIM0", "me", 10)).containsExactly("kim02", "kim01");
        assertThat(ids("im0", "me", 10)).isEmpty();                                   // 아이디 중간 일치는 안 된다
    }

    @Test
    void 비활성_계정과_본인은_나오지_않는다() {
        assertThat(ids("퇴사", "me", 10)).isEmpty();
        assertThat(ids("앨리스", "alice", 10)).isEmpty();
        assertThat(ids("앨리스", "me", 10)).containsExactly("alice");
        assertThat(ids("ALICE", "Alice", 10)).containsExactly("alice");   // 아이디 대소문자 다르면 다른 사람 취급(본인 제외는 정확 일치)
    }

    @Test
    void 아이디가_정확히_같은_사람이_먼저_그_다음은_이름순() {
        assertThat(ids("ab", "me", 10)).containsExactly("ab", "abc");     // ab의 이름(zzz)이 abc(aaa)보다 뒤여도 완전 일치가 먼저
    }

    @Test
    void 와일드카드_문자는_글자_그대로_찾는다() {
        assertThat(ids("_일", "me", 10)).containsExactly("lee_1");        // 이스케이프 안 하면 '이엑스'도 걸린다
        assertThat(ids("0%", "me", 10)).containsExactly("p%ct");           // 이스케이프 안 하면 z0·z0z도 걸린다
        assertThat(ids("__", "me", 10)).isEmpty();                         // 이스케이프 안 하면 두 글자 이상 전부
        assertThat(ids("%%", "me", 10)).isEmpty();
        assertThat(ids("!_", "me", 10)).isEmpty();                         // 이스케이프 문자 자체도 글자로
    }

    @Test
    void 개수_제한과_표시_이름_부서_이름() {
        assertThat(ids("kim", "me", 2)).hasSize(2);
        assertThat(dir.searchUsers("kim", "me", 0)).hasSize(1);            // 0 이하는 1로
        ShareUserResponse kim01 = dir.searchUsers("kim01", "me", 5).get(0);
        assertThat(kim01.name()).isEqualTo("김철수");
        assertThat(kim01.groupLabel()).isEqualTo("부서A");
        assertThat(dir.searchUsers("kim02", "me", 5).get(0).groupLabel()).isNull();
        assertThat(dir.searchUsers("nonick", "me", 5).get(0).name()).isEqualTo("별명이");   // 이름이 없으면 별명
    }

    @Test
    void 그룹_목록은_슈퍼를_빼고_역할_아래_세부권한_순서() {
        jdbc.update("INSERT INTO tbl_permission VALUES ('ROOT','SUPER_ADMIN','루트',1)");        // 슈퍼 역할의 세부권한도 뺀다
        jdbc.update("INSERT INTO tbl_permission VALUES ('BAD:X','MAP_USER','콜론',9)");          // ':'가 든 코드는 구분이 안 되니 뺀다
        String longRole = "R".repeat(30);
        String longPerm = "P".repeat(30);
        jdbc.update("INSERT INTO tbl_role VALUES (?,?,TRUE,FALSE,9)", longRole, "긴역할");
        jdbc.update("INSERT INTO tbl_permission VALUES (?,?,?,1)", longPerm, longRole, "긴세부");   // 30+1+30 > 50 → 뺀다

        List<ShareGroupResponse> groups = dir.groups();
        assertThat(groups).extracting(ShareGroupResponse::code)
                .containsExactly("MAP_ADMIN", "MAP_USER", "MAP_USER:VIEWER", "MAP_USER:DEPT_A", "MAP_USER:DEPT_B", longRole);
        assertThat(groups.get(0)).isEqualTo(new ShareGroupResponse("MAP_ADMIN", "지도관리자", null));
        assertThat(groups.get(2)).isEqualTo(new ShareGroupResponse("MAP_USER:VIEWER", "뷰어", "MAP_USER"));
    }

    @Test
    void 사용자_조회는_이름과_상태를_주고_없는_사람은_키가_없다() {
        Map<String, GisShareDirectory.UserState> m = dir.lookupUsers(List.of("kim01", "oldkim", "nobody", "kim01"));
        assertThat(m).containsOnlyKeys("kim01", "oldkim");
        assertThat(m.get("kim01")).isEqualTo(new GisShareDirectory.UserState("김철수", true));
        assertThat(m.get("oldkim").active()).isFalse();
        assertThat(dir.lookupUsers(List.of())).isEmpty();
        assertThat(dir.lookupUsers(null)).isEmpty();
    }

    @Test
    void 사용자_조회는_500개씩_나눠_묻는다() {
        List<String> ids = new ArrayList<>();
        for (int i = 0; i < 650; i++) ids.add("none" + i);
        ids.add("kim02");
        assertThat(dir.lookupUsers(ids)).containsOnlyKeys("kim02");
    }

    @Test
    void like_이스케이프() {
        assertThat(JdbcGisShareDirectory.escapeLike("a%b_c!d")).isEqualTo("a!%b!_c!!d");
        assertThat(JdbcGisShareDirectory.escapeLike("plain")).isEqualTo("plain");
    }
}
