package com.gtp.domain.mymap.infra;

import com.gtp.global.exception.CustomException;
import com.gtp.global.gis.GisErrorCode;
import lombok.extern.slf4j.Slf4j;
import org.springframework.dao.DataAccessException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.LocalDateTime;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.util.List;
import java.util.Optional;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * 사용자별 지도 시작 화면 1행을 읽고 쓰는 곳(표 tbl_map_start_view). <b>JPA 엔티티 없이 JdbcTemplate만</b> 쓴다 —
 * 표는 사용자가 SQL(backend/scripts/mymap/ddl-start-view.sql)로 만들고, ddl-auto: update는 이 표를 모른다.
 *
 * 표가 없으면(PostgreSQL SQLState 42P01) {@link GisErrorCode#START_VIEW_STORE_UNAVAILABLE}(503)로 바꾸고, 경고 로그는 처음 한 번만 남긴다.
 * 그 밖의 DB 오류는 그대로 던진다(전역 핸들러 → 500). 상태는 이 인스턴스의 필드뿐이다.
 *
 * 쿼리 3개(조회·저장·삭제)는 query-spec.md의 U28~U30에도 적혀 있다 — 저장 쿼리의 ON CONFLICT는 PostgreSQL 전용 문법이라
 * 전자정부(MyBatis·Oracle)로 옮길 때는 MERGE 또는 UPDATE 뒤 0건이면 INSERT로 바꾼다.
 * 시각은 DB의 now()가 아니라 앱이 넣는 한국 시각(Asia/Seoul)이다 — DB 서버·JDBC 세션의 시간대에 상관없이 같은 값이 나온다.
 */
@Slf4j
@Component
public class StartViewStore {

    static final String SELECT_SQL = "SELECT view_json, updated_at FROM tbl_map_start_view WHERE user_id = ?";
    static final String UPSERT_SQL = "INSERT INTO tbl_map_start_view (user_id, view_json, schema_version, updated_at) VALUES (?, ?, ?, ?) "
            + "ON CONFLICT (user_id) DO UPDATE SET view_json = EXCLUDED.view_json, schema_version = EXCLUDED.schema_version, "
            + "updated_at = EXCLUDED.updated_at";
    static final String DELETE_SQL = "DELETE FROM tbl_map_start_view WHERE user_id = ?";

    private static final String UNDEFINED_TABLE = "42P01";
    private static final ZoneId KST = ZoneId.of("Asia/Seoul");

    /** 저장된 한 행: 정규화된 JSON 문자열 + 서버 저장 시각 */
    public record Stored(String viewJson, OffsetDateTime updatedAt) {
    }

    private final JdbcTemplate jdbc;
    private final AtomicBoolean warned = new AtomicBoolean(false);

    public StartViewStore(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    /** 사용자의 저장값. 저장한 적 없으면 비어 있다 */
    public Optional<Stored> find(String userId) {
        try {
            List<Stored> rows = jdbc.query(SELECT_SQL, (rs, i) -> {
                Timestamp t = rs.getTimestamp("updated_at");
                return new Stored(rs.getString("view_json"), t == null ? null : toKst(t.toLocalDateTime()));
            }, userId);
            return rows.isEmpty() ? Optional.empty() : Optional.of(rows.get(0));
        } catch (DataAccessException e) {
            throw translate(e);
        }
    }

    /** 있으면 덮어쓰고 없으면 만든다(사용자당 1행). 저장한 시각을 돌려준다 */
    public OffsetDateTime save(String userId, String viewJson, int schemaVersion) {
        OffsetDateTime now = OffsetDateTime.now(KST).withNano(0);
        try {
            jdbc.update(UPSERT_SQL, userId, viewJson, schemaVersion, Timestamp.valueOf(now.toLocalDateTime()));
            return now;
        } catch (DataAccessException e) {
            throw translate(e);
        }
    }

    /** 저장값이 없어도 오류가 아니다(멱등) */
    public void delete(String userId) {
        try {
            jdbc.update(DELETE_SQL, userId);
        } catch (DataAccessException e) {
            throw translate(e);
        }
    }

    private static OffsetDateTime toKst(LocalDateTime t) {
        return t.atZone(KST).toOffsetDateTime();
    }

    private RuntimeException translate(DataAccessException e) {
        if (!isUndefinedTable(e)) return e;
        if (warned.compareAndSet(false, true)) {
            log.warn("[나만의지도] 시작 화면 표(tbl_map_start_view)가 없습니다 — backend/scripts/mymap/ddl-start-view.sql을 실행하세요");
        }
        return new CustomException(GisErrorCode.START_VIEW_STORE_UNAVAILABLE);
    }

    /** 원인 사슬 어디에 SQLState 42P01(undefined_table)이 있는가 */
    static boolean isUndefinedTable(Throwable e) {
        for (Throwable t = e; t != null; t = t.getCause() == t ? null : t.getCause()) {
            if (t instanceof SQLException se && UNDEFINED_TABLE.equals(se.getSQLState())) return true;
        }
        return false;
    }
}
