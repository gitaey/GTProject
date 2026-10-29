-- ============================================================================
-- 지번 → 건물 조회용 색인 (선택) — 주소 변환 엑셀의 "지번 입력 행 → 표준 도로명주소" 채우기에 쓴다
--
-- 왜: 지번 주소("구의동 16-26")에서 도로명주소를 만들려면 건물정보(ref.ti_spbd_buld)를 (법정동코드, 산여부, 지번본번, 지번부번)으로
--     찾아야 하는데, 이 키의 색인이 없다. 색인 없이 찾으면 1,072만 행 전체 스캔(행 하나에 수 초 — 5,000행이면 쓸 수 없음)이다.
--     그래서 앱은 이 색인이 있을 때만 지번 → 도로명주소를 채우고, 없으면 그 열을 비워 둔다(다른 열·도로명 입력 행은 영향 없음).
--
-- 크기: 기존 ix_ti_spbd_buld_road(road_cd, udgd_yn, buld_mnnm, buld_slno)가 300MB이고 키 길이가 비슷하므로 약 300MB 안팎(추정).
-- 시간: 1,072만 행 정렬 — 수 분(maintenance_work_mem을 키우면 빨라진다). 운영 DB에서도 만드는 동안 읽기는 막지 않는다.
--       (CREATE INDEX CONCURRENTLY를 쓰지 않는다 — 쓰기가 없는 참조 표이고, CONCURRENTLY는 트랜잭션 안에서 못 돌린다.)
-- 실행 시점: 건물DB를 적재한 뒤 한 번. 이미 있으면 건너뜀(IF NOT EXISTS). 실행 계정: ref 스키마 소유(적재용) 계정.
--           psql -v ON_ERROR_STOP=1 -f add-ix-juso-jibun.sql
-- 적재 스크립트(load-juso.sh)는 새 표에도 같은 이름의 색인을 만든다 — 월 갱신으로 표가 교체돼도 색인이 따라온다.
--
-- 앱은 to_regclass('ref.ix_ti_spbd_buld_jibun')로 색인 유무를 확인한다(적재 기준월이 바뀔 때, 그리고 "없음"은 5분마다 다시).
-- 만든 뒤 앱 재시작은 필요 없다. 지우려면: DROP INDEX ref.ix_ti_spbd_buld_jibun;  (그러면 지번 입력 행의 도로명주소 열이 다시 빈 칸)
-- 확인(읽기 전용): SELECT pg_size_pretty(pg_relation_size('ref.ix_ti_spbd_buld_jibun'));
-- ============================================================================

SET maintenance_work_mem = '1GB';

CREATE INDEX IF NOT EXISTS ix_ti_spbd_buld_jibun
    ON ref.ti_spbd_buld (adm_cd, mntn_yn, lnbr_mnnm, lnbr_slno);

ANALYZE ref.ti_spbd_buld;
