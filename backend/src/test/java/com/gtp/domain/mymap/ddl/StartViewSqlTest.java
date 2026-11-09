package com.gtp.domain.mymap.ddl;

import org.junit.jupiter.api.Test;
import org.springframework.core.io.FileSystemResource;
import org.springframework.jdbc.datasource.init.ScriptUtils;

import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.Arrays;
import java.util.List;
import java.util.Set;
import java.util.TreeSet;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * 사용자가 운영 DB에 실행할 시작 화면 표 SQL(backend/scripts/mymap/ddl-start-view.sql)을 <b>메모리 H2</b>에서만 확인한다 —
 * 문법·두 번 실행해도 안전·칸 이름·PK·크기 CHECK·되돌리기. 운영 DB에는 접속하지 않는다. Spring 컨텍스트도 쓰지 않는다.
 */
class StartViewSqlTest {

    static final Path DDL = Path.of("scripts/mymap/ddl-start-view.sql");
    static final Path ROLLBACK = Path.of("scripts/mymap/ddl-start-view-rollback.sql");

    static Connection h2() throws SQLException {
        return DriverManager.getConnection("jdbc:h2:mem:sv_ddl_" + System.nanoTime() + ";DB_CLOSE_DELAY=-1", "sa", "");
    }

    static Set<String> columns(Connection c) throws SQLException {
        Set<String> cols = new TreeSet<>();
        try (Statement st = c.createStatement();
             ResultSet rs = st.executeQuery("SELECT column_name FROM information_schema.columns WHERE upper(table_name) = 'TBL_MAP_START_VIEW'")) {
            while (rs.next()) cols.add(rs.getString(1).toLowerCase());
        }
        return cols;
    }

    static void insert(Connection c, String user, String json) throws SQLException {
        try (PreparedStatement ps = c.prepareStatement("INSERT INTO tbl_map_start_view (user_id, view_json, schema_version) VALUES (?, ?, 1)")) {
            ps.setString(1, user);
            ps.setString(2, json);
            ps.executeUpdate();
        }
    }

    @Test
    void SQL은_문법이_맞고_두_번_실행해도_안전하고_칸이_설계와_같다() throws Exception {
        assertThat(DDL).exists();
        try (Connection c = h2()) {
            ScriptUtils.executeSqlScript(c, new FileSystemResource(DDL));
            insert(c, "alice", "{\"version\":1}");
            ScriptUtils.executeSqlScript(c, new FileSystemResource(DDL));    // 두 번째 실행도 안전하고 데이터를 건드리지 않는다
            assertThat(columns(c)).containsExactly("schema_version", "updated_at", "user_id", "view_json");
            try (Statement st = c.createStatement(); ResultSet rs = st.executeQuery("SELECT count(*), min(updated_at) FROM tbl_map_start_view")) {
                rs.next();
                assertThat(rs.getInt(1)).isEqualTo(1);
                assertThat(rs.getTimestamp(2)).isNotNull();                   // updated_at 기본값(손으로 넣을 때)
            }
        }
    }

    @Test
    void 사용자당_한_행_PK_user_id() throws Exception {
        try (Connection c = h2()) {
            ScriptUtils.executeSqlScript(c, new FileSystemResource(DDL));
            insert(c, "alice", "{}");
            assertThatThrownBy(() -> insert(c, "alice", "{}")).isInstanceOf(SQLException.class);
            insert(c, "bob", "{}");
            // user_id 길이 50
            insert(c, "x".repeat(50), "{}");
            assertThatThrownBy(() -> insert(c, "y".repeat(51), "{}")).isInstanceOf(SQLException.class);
        }
    }

    @Test
    void 크기_CHECK는_8192바이트까지_UTF8_바이트로_센다() throws Exception {
        try (Connection c = h2()) {
            ScriptUtils.executeSqlScript(c, new FileSystemResource(DDL));
            insert(c, "a", "x".repeat(8192));
            assertThatThrownBy(() -> insert(c, "b", "x".repeat(8193))).isInstanceOf(SQLException.class);
            // 한글 한 글자 3바이트: 2730글자 = 8190바이트(통과), 2731글자 = 8193바이트(거절)
            insert(c, "c", "가".repeat(2730));
            assertThatThrownBy(() -> insert(c, "d", "가".repeat(2731))).isInstanceOf(SQLException.class);
        }
    }

    @Test
    void 필수_칸은_NOT_NULL() throws Exception {
        try (Connection c = h2(); Statement st = c.createStatement()) {
            ScriptUtils.executeSqlScript(c, new FileSystemResource(DDL));
            assertThatThrownBy(() -> st.execute("INSERT INTO tbl_map_start_view (user_id, view_json, schema_version) VALUES ('a', NULL, 1)")).isInstanceOf(SQLException.class);
            assertThatThrownBy(() -> st.execute("INSERT INTO tbl_map_start_view (user_id, view_json, schema_version) VALUES ('a', '{}', NULL)")).isInstanceOf(SQLException.class);
            assertThatThrownBy(() -> st.execute("INSERT INTO tbl_map_start_view (user_id, view_json, schema_version) VALUES (NULL, '{}', 1)")).isInstanceOf(SQLException.class);
        }
    }

    @Test
    void 되돌리기_SQL은_이_표만_지우고_없어도_오류가_아니다() throws Exception {
        try (Connection c = h2(); Statement st = c.createStatement()) {
            st.execute("CREATE TABLE tbl_other (id int PRIMARY KEY)");
            ScriptUtils.executeSqlScript(c, new FileSystemResource(DDL));
            ScriptUtils.executeSqlScript(c, new FileSystemResource(ROLLBACK));
            assertThat(columns(c)).isEmpty();
            ScriptUtils.executeSqlScript(c, new FileSystemResource(ROLLBACK));   // 표가 없어도 안전
            try (ResultSet rs = st.executeQuery("SELECT count(*) FROM tbl_other")) {   // 다른 표는 그대로
                rs.next();
                assertThat(rs.getInt(1)).isZero();
            }
        }
    }

    @Test
    void SQL_파일에는_데이터를_지우거나_다른_표를_건드리는_문장이_없고_비밀값도_없다() throws Exception {
        String ddl = code(DDL);
        assertThat(ddl).doesNotContain("drop ").doesNotContain("delete ").doesNotContain("truncate").doesNotContain("alter ").doesNotContain("update ");
        assertThat(ddl).contains("create table if not exists tbl_map_start_view");
        assertThat(ddl.lines().filter(l -> l.startsWith("create ")).count()).isEqualTo(1);   // 표 하나뿐
        assertThat(ddl).contains("primary key (user_id)").contains("octet_length(view_json) <= 8192");

        String rb = code(ROLLBACK);
        assertThat(rb.strip()).isEqualTo("drop table if exists tbl_map_start_view;");

        // 두 파일 어디에도 접속 정보·비밀번호가 없다(주석 포함 전체)
        for (Path p : List.of(DDL, ROLLBACK)) {
            String all = Files.readString(p).toLowerCase();
            assertThat(all).doesNotContain("jdbc:").doesNotContain("password=").doesNotContain("postgres://").doesNotContainPattern("pgpassword\\s*=\\s*\\S");
        }
    }

    /** 주석을 뺀 소문자 코드 */
    private static String code(Path p) throws Exception {
        return Arrays.stream(Files.readString(p).toLowerCase().split("\n"))
                .map(l -> l.contains("--") ? l.substring(0, l.indexOf("--")) : l)
                .filter(l -> !l.isBlank())
                .reduce("", (a, b) -> a + b.stripTrailing() + "\n");
    }
}
