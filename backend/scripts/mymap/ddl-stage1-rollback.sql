-- ============================================================================
-- S1 되돌리기 — ddl-stage1.sql로 만든 칸·표·인덱스를 지운다. 실행 주체: 사용자. 평소에는 필요 없다.
--
-- S1은 옛 코드와 호환된다(새 칸은 전부 DEFAULT가 있거나 nullable이라 옛 백엔드는 그대로 동작한다).
-- 그래서 되돌림이 필요한 상황은 대개 "새 코드를 내리고 옛 코드로 돌아간다"뿐이고, 그때는 칸을 지우지 않아도 된다.
-- 칸·표를 정말 지우면 그 안의 데이터(업로드 종류·진행률·보고서 요약·실패 행·피처의 PNU/행 번호)가 사라진다.
-- 실행하기 전에 백업을 확인한다. 새 코드가 떠 있는 동안 실행하지 않는다(ddl-auto가 칸을 다시 만들거나 조회가 500이 된다).
-- psql -v ON_ERROR_STOP=1 -1 -f backend/scripts/mymap/ddl-stage1-rollback.sql
-- ============================================================================

DROP TABLE IF EXISTS tbl_user_map_import_failure;

DROP INDEX IF EXISTS ix_user_map_feature_map;
DROP INDEX IF EXISTS ix_user_map_owner;
DROP INDEX IF EXISTS ix_umap_perm_map;
DROP INDEX IF EXISTS ix_umap_user_map;

ALTER TABLE tbl_user_map_feature DROP COLUMN IF EXISTS pnu;
ALTER TABLE tbl_user_map_feature DROP COLUMN IF EXISTS row_no;

ALTER TABLE tbl_user_map DROP COLUMN IF EXISTS source_kind;
ALTER TABLE tbl_user_map DROP COLUMN IF EXISTS progress_total;
ALTER TABLE tbl_user_map DROP COLUMN IF EXISTS progress_done;
ALTER TABLE tbl_user_map DROP COLUMN IF EXISTS matched_count;
ALTER TABLE tbl_user_map DROP COLUMN IF EXISTS failed_count;
ALTER TABLE tbl_user_map DROP COLUMN IF EXISTS file_hash;
ALTER TABLE tbl_user_map DROP COLUMN IF EXISTS parcel_version;
