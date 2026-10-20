-- ============================================================================
-- S0 — 읽기 전용 확인 (언제든 실행해도 데이터·스키마를 바꾸지 않는다)
-- 첫 전국 적재 전에 디스크·WAL 여유를 판단하는 재료다. 결과를 메인/사용자가 설계 체크리스트에 맞춰 본다.
-- ============================================================================

-- 서비스 DB 현재 크기
SELECT pg_size_pretty(pg_database_size(current_database())) AS db_size;

-- WAL·복제 설정 (archive_mode=on 이거나 복제 서버가 있으면 적재하는 동안 데이터 크기만큼 WAL이 쌓인다)
SHOW wal_level;
SHOW archive_mode;
SHOW max_wal_size;
SHOW synchronous_commit;
SHOW maintenance_work_mem;
SELECT count(*) AS standby_count FROM pg_stat_replication;

-- PostGIS 버전, PostgreSQL 버전(분할 표 DETACH ... CONCURRENTLY는 PG 14 이상)
SELECT version();
SELECT postgis_full_version();

-- 가장 큰 표 10개 (나만의지도 피처 표 크기 감 잡기)
SELECT relname, pg_size_pretty(pg_total_relation_size(oid)) AS total
  FROM pg_class WHERE relkind = 'r' ORDER BY pg_total_relation_size(oid) DESC LIMIT 10;
