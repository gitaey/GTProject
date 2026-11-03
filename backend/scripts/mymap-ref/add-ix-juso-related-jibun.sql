-- ============================================================================
-- 관련지번 → 건물 조회용 색인 — 필지 정보 카드의 "이 필지를 관련지번으로 가진 건물"에 쓴다
--
-- 왜: 건물DB는 건물마다 대표지번(ref.ti_spbd_buld.adm_cd·mntn_yn·lnbr_mnnm·lnbr_slno)이 하나뿐이다. 여러 필지에 걸친 단지·큰 건물은
--     나머지 필지가 관련지번 표(ref.ti_scco_mvmn, 건물 1건에 여러 행)에만 있다. 필지를 눌렀을 때 그 건물도 보이게 하려면
--     관련지번 표를 (법정동코드, 산여부, 지번본번, 지번부번)으로 찾아야 하는데, 이 키의 색인이 없다(PK는 도로명 키 5열).
--     색인 없이 찾으면 177만 행 전체 스캔이라 앱은 이 색인이 있을 때만 관련지번까지 합쳐 보여 주고, 없으면 대표지번 건물만 보여 준다
--     (필지 정보 카드의 다른 항목·주소 변환은 영향 없음).
--
-- 크기: 약 50MB(추정 — 건물정보 표의 지번 색인 300MB × 177만/1,072만 행).
-- 시간: 177만 행 정렬 — 수십 초(maintenance_work_mem을 키우면 빨라진다). 만드는 동안 읽기는 막지 않는다.
--       (CREATE INDEX CONCURRENTLY를 쓰지 않는다 — 쓰기가 없는 참조 표이고, CONCURRENTLY는 트랜잭션 안에서 못 돌린다.)
-- 실행 시점: 건물DB를 적재한 뒤 한 번. 이미 있으면 건너뜀(IF NOT EXISTS). 실행 계정: ref 스키마 소유(적재용) 계정.
--           psql -v ON_ERROR_STOP=1 -f add-ix-juso-related-jibun.sql
-- 적재 스크립트(load-juso.sh)는 새 관련지번 표에도 같은 이름의 색인을 만든다 — 월 갱신으로 표가 교체돼도 색인이 따라온다.
--
-- 앱은 to_regclass('ref.ix_ti_scco_mvmn_jibun')로 색인 유무를 확인한다(적재 기준월이 바뀔 때, 그리고 "없음"은 5분마다 다시).
-- 만든 뒤 앱 재시작은 필요 없다(최대 5분 안에 켜진다). 지우려면: DROP INDEX ref.ix_ti_scco_mvmn_jibun;  (그러면 대표지번 건물만 보인다)
-- 확인(읽기 전용): SELECT pg_size_pretty(pg_relation_size('ref.ix_ti_scco_mvmn_jibun'));
-- ============================================================================

SET maintenance_work_mem = '1GB';

CREATE INDEX IF NOT EXISTS ix_ti_scco_mvmn_jibun
    ON ref.ti_scco_mvmn (adm_cd, mntn_yn, lnbr_mnnm, lnbr_slno);

ANALYZE ref.ti_scco_mvmn;
