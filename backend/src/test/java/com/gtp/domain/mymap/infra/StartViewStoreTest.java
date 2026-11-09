package com.gtp.domain.mymap.infra;

import ch.qos.logback.classic.Level;
import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import com.gtp.domain.mymap.infra.StartViewStore.Stored;
import com.gtp.global.exception.CustomException;
import com.gtp.global.gis.GisErrorCode;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.slf4j.LoggerFactory;
import org.springframework.core.io.FileSystemResource;
import org.springframework.dao.DataAccessResourceFailureException;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.jdbc.BadSqlGrammarException;
import org.springframework.jdbc.UncategorizedSQLException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.jdbc.datasource.init.ScriptUtils;

import java.nio.file.Path;
import java.sql.Connection;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * 시작 화면 저장소 — DB 접속 없이. (1) 표 없음(SQLState 42P01) → 503 변환·경고 한 번, 그 밖 오류는 그대로,
 * (2) 저장 SQL과 넘기는 값, (3) 조회·삭제를 메모리 H2에 "사용자가 실행할 SQL 파일" 그대로 만든 표로.
 * ON CONFLICT 저장 쿼리는 PostgreSQL 전용 문법이라 H2에서 실행하지 못한다 — 실제 DB로 확인할 일이다(보고서 참고).
 */
class StartViewStoreTest {

    static final Path DDL = Path.of("scripts/mymap/ddl-start-view.sql");

    /** 쿼리를 실제로 실행하지 않고 호출 내용을 기록하거나 예외를 던지는 JdbcTemplate */
    static class RecordingJdbc extends JdbcTemplate {
        RuntimeException failure;
        String lastSql;
        Object[] lastArgs;

        @Override
        public <T> List<T> query(String sql, RowMapper<T> rowMapper, Object... args) {
            lastSql = sql;
            lastArgs = args;
            if (failure != null) throw failure;
            return List.of();
        }

        @Override
        public int update(String sql, Object... args) {
            lastSql = sql;
            lastArgs = args;
            if (failure != null) throw failure;
            return 1;
        }
    }

    static BadSqlGrammarException missingTable() {
        return new BadSqlGrammarException("query", "SELECT ...", new SQLException("ERROR: relation \"tbl_map_start_view\" does not exist", "42P01"));
    }

    final RecordingJdbc jdbc = new RecordingJdbc();
    final StartViewStore store = new StartViewStore(jdbc);
    ListAppender<ILoggingEvent> logs;
    Logger logger;

    @BeforeEach
    void attachAppender() {
        logger = (Logger) LoggerFactory.getLogger(StartViewStore.class);
        logs = new ListAppender<>();
        logs.start();
        logger.addAppender(logs);
    }

    @AfterEach
    void detachAppender() {
        logger.detachAppender(logs);
    }

    void assertUnavailable(Runnable call) {
        assertThatThrownBy(call::run).isInstanceOfSatisfying(CustomException.class, e -> {
            assertThat(e.getErrorCode()).isEqualTo(GisErrorCode.START_VIEW_STORE_UNAVAILABLE);
            assertThat(e.getErrorCode().getStatus().value()).isEqualTo(503);
        });
    }

    // ---------------------------------------------------------------- 42P01 → 503

    @Test
    void 표가_없으면_세_동작_모두_503() {
        jdbc.failure = missingTable();
        assertUnavailable(() -> store.find("alice"));
        assertUnavailable(() -> store.save("alice", "{}", 1));
        assertUnavailable(() -> store.delete("alice"));
    }

    @Test
    void 원인_사슬_안쪽의_42P01도_503() {
        jdbc.failure = new UncategorizedSQLException("task", "sql", new SQLException("outer", "XX000", new SQLException("inner", "42P01")));
        assertUnavailable(() -> store.find("alice"));
        // 예외 자신이 아니라 getCause()에만 SQLException이 있는 경우
        jdbc.failure = new DataAccessResourceFailureException("wrapped", new RuntimeException(new SQLException("x", "42P01")));
        assertUnavailable(() -> store.delete("alice"));
        assertThat(StartViewStore.isUndefinedTable(new RuntimeException())).isFalse();
    }

    @Test
    void 다른_DB_오류는_503으로_바꾸지_않고_그대로_던진다() {
        for (RuntimeException other : List.of(
                new BadSqlGrammarException("q", "s", new SQLException("column does not exist", "42703")),   // 같은 42 계열이어도 표 없음이 아님
                new DuplicateKeyException("dup", new SQLException("dup", "23505")),
                new DataAccessResourceFailureException("연결 끊김"))) {
            jdbc.failure = other;
            assertThatThrownBy(() -> store.find("alice")).isSameAs(other);
            assertThatThrownBy(() -> store.save("alice", "{}", 1)).isSameAs(other);
            assertThatThrownBy(() -> store.delete("alice")).isSameAs(other);
        }
        assertThat(logs.list).isEmpty();   // 표 없음이 아니면 경고도 없다
    }

    @Test
    void 표가_없다는_경고는_처음_한_번만_남긴다() {
        jdbc.failure = missingTable();
        for (int i = 0; i < 5; i++) assertUnavailable(() -> store.find("alice"));
        assertUnavailable(() -> store.save("alice", "{}", 1));
        assertUnavailable(() -> store.delete("alice"));
        assertThat(logs.list).hasSize(1);
        ILoggingEvent e = logs.list.get(0);
        assertThat(e.getLevel()).isEqualTo(Level.WARN);
        assertThat(e.getFormattedMessage()).contains("tbl_map_start_view").contains("backend/scripts/mymap/ddl-start-view.sql");
        assertThat(e.getThrowableProxy()).isNull();   // 스택트레이스로 로그를 채우지 않는다

        // 경고 상태는 인스턴스 필드다(전역이 아니다) — 다른 인스턴스는 다시 한 번 남긴다
        assertUnavailable(() -> new StartViewStore(jdbc).find("alice"));
        assertThat(logs.list).hasSize(2);
    }

    // ---------------------------------------------------------------- SQL·값

    @Test
    void 저장_쿼리는_사용자_행을_덮어쓰고_시각은_앱이_넣는_한국_시각() {
        var before = java.time.OffsetDateTime.now(java.time.ZoneId.of("Asia/Seoul")).withNano(0);
        var saved = store.save("alice", "{\"version\":1}", 1);
        var after = java.time.OffsetDateTime.now(java.time.ZoneId.of("Asia/Seoul")).withNano(0);

        assertThat(jdbc.lastSql).isEqualTo(StartViewStore.UPSERT_SQL)
                .contains("INSERT INTO tbl_map_start_view").contains("ON CONFLICT (user_id) DO UPDATE").doesNotContain("now()");
        assertThat(jdbc.lastArgs).hasSize(4);
        assertThat(jdbc.lastArgs[0]).isEqualTo("alice");
        assertThat(jdbc.lastArgs[1]).isEqualTo("{\"version\":1}");
        assertThat(jdbc.lastArgs[2]).isEqualTo(1);
        assertThat(jdbc.lastArgs[3]).isInstanceOf(Timestamp.class);
        assertThat(((Timestamp) jdbc.lastArgs[3]).toLocalDateTime()).isEqualTo(saved.toLocalDateTime());   // DB에 간 값 = 응답 값
        assertThat(saved.getOffset().getTotalSeconds()).isEqualTo(9 * 3600);
        assertThat(saved).isBetween(before, after);
    }

    @Test
    void 조회_삭제_쿼리는_user_id_한_칸으로만_고른다() {
        store.find("bob");
        assertThat(jdbc.lastSql).isEqualTo("SELECT view_json, updated_at FROM tbl_map_start_view WHERE user_id = ?");
        assertThat(jdbc.lastArgs).containsExactly("bob");
        store.delete("bob");
        assertThat(jdbc.lastSql).isEqualTo("DELETE FROM tbl_map_start_view WHERE user_id = ?");
        assertThat(jdbc.lastArgs).containsExactly("bob");
    }

    // ---------------------------------------------------------------- 실제 SQL 파일로 만든 표에서 조회·삭제

    @Test
    void SQL_파일로_만든_표에서_조회_삭제가_된다() throws Exception {
        DriverManagerDataSource ds = new DriverManagerDataSource("jdbc:h2:mem:startview_store_" + System.nanoTime() + ";DB_CLOSE_DELAY=-1", "sa", "");
        try (Connection c = ds.getConnection()) {
            ScriptUtils.executeSqlScript(c, new FileSystemResource(DDL));
        }
        JdbcTemplate real = new JdbcTemplate(ds);
        StartViewStore s = new StartViewStore(real);

        assertThat(s.find("alice")).isEmpty();                    // 저장한 적 없음
        real.update("INSERT INTO tbl_map_start_view (user_id, view_json, schema_version, updated_at) VALUES (?, ?, ?, TIMESTAMP '2026-11-09 14:21:00')",
                "alice", "{\"version\":1,\"panes\":[{}]}", 1);
        real.update("INSERT INTO tbl_map_start_view (user_id, view_json, schema_version, updated_at) VALUES (?, ?, ?, TIMESTAMP '2026-11-09 09:00:00')",
                "bob", "{\"version\":1,\"panes\":[{},{}]}", 1);

        Optional<Stored> a = s.find("alice");
        assertThat(a).isPresent();
        assertThat(a.get().viewJson()).isEqualTo("{\"version\":1,\"panes\":[{}]}");
        assertThat(a.get().updatedAt().toString()).isEqualTo("2026-11-09T14:21+09:00");   // 시간대 없는 칸 → 한국 시각

        // 사용자가 섞이지 않는다
        assertThat(s.find("bob").orElseThrow().viewJson()).contains("{},{}");
        assertThat(s.find("ALICE")).isEmpty();
        assertThat(s.find("alice ")).isEmpty();

        s.delete("alice");
        assertThat(s.find("alice")).isEmpty();
        assertThat(s.find("bob")).isPresent();                    // 남의 행은 그대로
        s.delete("alice");                                        // 없는 행 삭제도 오류가 아니다(멱등)
        s.delete("nobody");
        assertThat(real.queryForObject("SELECT count(*) FROM tbl_map_start_view", Integer.class)).isEqualTo(1);
    }

    @Test
    void SQL_파일을_실행하지_않은_DB에서는_표_없음_오류가_난다_변환_대상_확인() {
        // H2는 SQLState 42S02(Table not found)라 42P01 변환은 타지 않는다 — 변환은 위 mock 시험이, 실제 PostgreSQL은 보고서의 확인 순서가 맡는다
        DriverManagerDataSource ds = new DriverManagerDataSource("jdbc:h2:mem:startview_missing_" + System.nanoTime() + ";DB_CLOSE_DELAY=-1", "sa", "");
        StartViewStore s = new StartViewStore(new JdbcTemplate(ds));
        assertThatThrownBy(() -> s.find("alice")).isInstanceOf(org.springframework.dao.DataAccessException.class)
                .isNotInstanceOf(CustomException.class);
    }
}
