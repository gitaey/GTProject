-- ============================================================================
-- 시작 화면 표 되돌리기 — ddl-start-view.sql로 만든 tbl_map_start_view를 지운다. 실행 주체: 사용자. 평소에는 필요 없다.
--
-- 표를 지우면 모든 사용자가 저장한 시작 화면이 사라진다(지도는 기본 위치에서 시작하게 되고, 설정 패널은 "저장소 준비 중"으로 보인다).
-- 실행하기 전에 필요하면 백업한다: SELECT * FROM tbl_map_start_view;
-- psql -v ON_ERROR_STOP=1 -1 -f backend/scripts/mymap/ddl-start-view-rollback.sql
-- ============================================================================

DROP TABLE IF EXISTS tbl_map_start_view;
