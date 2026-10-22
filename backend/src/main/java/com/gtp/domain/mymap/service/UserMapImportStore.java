package com.gtp.domain.mymap.service;

import com.gtp.domain.mymap.entity.UserMap;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

import java.sql.Timestamp;
import java.sql.Types;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

/**
 * 가져오기 작업이 레이어 행·실패 행을 갱신하는 곳. 엔티티를 읽고 되저장하지 않고 SQL로 필요한 칸만 바꾼다 —
 * 진행률을 갱신하는 동안 다른 곳에서 저장된 엔티티가 옛 값으로 덮어쓰는 일을 막으려는 것이다.
 * UPDATE가 0행이면 레이어가 그 사이 지워진 것이라 호출한 작업이 멈춘다.
 */
@Component
@RequiredArgsConstructor
public class UserMapImportStore {

    /** 실패 행 한 줄. candidatesJson은 AMBIGUOUS 후보(2단계), rowJson은 원본 행 {컬럼: 값} */
    public record FailureRow(int rowNo, String reasonCode, String inputValue, String candidatesJson, String rowJson) {
    }

    private static final int[] FAILURE_TYPES = {Types.BIGINT, Types.INTEGER, Types.VARCHAR, Types.VARCHAR, Types.VARCHAR, Types.VARCHAR, Types.TIMESTAMP};

    private final JdbcTemplate jdbc;

    public boolean exists(long userMapId) {
        Integer n = jdbc.queryForObject("SELECT count(*) FROM tbl_user_map WHERE id = ?", Integer.class, userMapId);
        return n != null && n > 0;
    }

    /** @return 레이어가 아직 있으면 true */
    public boolean updateProgress(long id, int done, int total) {
        return jdbc.update("UPDATE tbl_user_map SET progress_done = ?, progress_total = ?, updated_at = ? WHERE id = ?",
                done, total, now(), id) > 0;
    }

    /** @param columnSchema 컬럼 통계 JSON(ColumnStatsCollector 형식 v1) — 스타일 대화상자·스타일 검증용. null이면 비워 둔다(나중에 요청 때 계산) */
    public boolean markReady(long id, String geomType, int featureCount, int matched, int failed, int processed, String parcelVersion,
                             String columnSchema) {
        return jdbc.update("UPDATE tbl_user_map SET status = 'READY', geom_type = ?, feature_count = ?, matched_count = ?, "
                        + "failed_count = ?, progress_done = ?, progress_total = ?, parcel_version = ?, column_schema = ?, error_message = NULL, updated_at = ? WHERE id = ?",
                geomType, featureCount, matched, failed, processed, processed, parcelVersion, columnSchema, now(), id) > 0;
    }

    public boolean markFailed(long id, String message) {
        return jdbc.update("UPDATE tbl_user_map SET status = 'FAILED', error_message = ?, updated_at = ? WHERE id = ?",
                UserMap.clip(message, UserMap.ERROR_MESSAGE_MAX), now(), id) > 0;
    }

    public void insertFailures(long userMapId, List<FailureRow> rows) {
        if (rows.isEmpty()) return;
        List<Object[]> args = new ArrayList<>(rows.size());
        Timestamp created = now();
        for (FailureRow r : rows) {
            args.add(new Object[]{userMapId, r.rowNo(), r.reasonCode(), UserMap.clip(r.inputValue(), 500), r.candidatesJson(), r.rowJson(), created});
        }
        jdbc.batchUpdate("INSERT INTO tbl_user_map_import_failure "
                + "(user_map_id, row_no, reason_code, input_value, candidates_json, row_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
                args, FAILURE_TYPES);
    }

    public void deleteFeatures(long userMapId) {
        jdbc.update("DELETE FROM tbl_user_map_feature WHERE user_map_id = ?", userMapId);
    }

    public void deleteFailures(long userMapId) {
        jdbc.update("DELETE FROM tbl_user_map_import_failure WHERE user_map_id = ?", userMapId);
    }

    /** 진행 기록이 cutoff 이전에서 멈춘 PROCESSING 레이어를 FAILED로. @return 바뀐 행 수 */
    public int failStalled(LocalDateTime cutoff, String message) {
        return jdbc.update("UPDATE tbl_user_map SET status = 'FAILED', error_message = ?, updated_at = ? "
                        + "WHERE status = 'PROCESSING' AND updated_at < ?",
                message, now(), Timestamp.valueOf(cutoff));
    }

    /** @return 지운 행 수 */
    public int deleteFailuresOlderThan(LocalDateTime cutoff) {
        return jdbc.update("DELETE FROM tbl_user_map_import_failure WHERE created_at < ?", Timestamp.valueOf(cutoff));
    }

    private static Timestamp now() {
        return Timestamp.valueOf(LocalDateTime.now());
    }
}
