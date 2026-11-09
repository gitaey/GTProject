-- ============================================================================
-- 지도 시작 화면(계정 저장) 표 — tbl_map_start_view (설계: _workspace/map-settings-panel/01_design.md "새 SQL 파일")
--
-- 실행 시점: 새 백엔드(StartViewController)를 띄운 뒤 언제든. 표가 없으면 API가 503(START_VIEW_STORE_UNAVAILABLE)으로 답하고
--           지도 화면 설정 패널의 "시작 화면" 카드가 "저장소 준비 중"으로 보일 뿐, 앱의 다른 기능은 영향이 없다.
--           로컬 application-local.yml의 DB는 운영 DB다 — 한 번 실행하면 운영에도 적용된다.
-- 실행 주체: 사용자(map-dev는 작성만 했다 — 실행하지 않았다). 여러 번 실행해도 안전하다(IF NOT EXISTS, 데이터를 건드리지 않음).
-- 실행 방법: psql -v ON_ERROR_STOP=1 -1 -f backend/scripts/mymap/ddl-start-view.sql   (-1 = 한 트랜잭션, 실패하면 전부 되돌림)
--           접속 정보는 PGHOST·PGDATABASE·PGUSER·PGPASSWORD 환경 변수로(명령줄에 비밀번호를 쓰지 않는다)
-- 확인: SELECT to_regclass('tbl_map_start_view');   -- 이름이 나오면 성공
-- 되돌리기: ddl-start-view-rollback.sql (저장한 시작 화면이 전부 지워진다)
--
-- JPA 엔티티가 없다: 이 표는 JdbcTemplate(StartViewStore)로만 읽고 쓴다. ddl-auto: update가 이 표를 만들지도 바꾸지도 않는다.
-- ============================================================================

CREATE TABLE IF NOT EXISTS tbl_map_start_view (
    user_id        varchar(50)  NOT NULL,                 -- JWT principal 문자열(FK 없음 — 도메인 독립, tbl_layer_user_access와 같은 길이)
    view_json      text         NOT NULL,                 -- 시작 화면 JSON(서버는 형식·크기만 검사, 내용 해석 안 함)
    schema_version smallint     NOT NULL,                 -- view_json.version (지금 1)
    updated_at     timestamp    NOT NULL DEFAULT now(),   -- 앱은 한국 시각(Asia/Seoul)을 직접 넣는다. 이 기본값은 손으로 넣을 때만 쓰인다
    CONSTRAINT pk_map_start_view PRIMARY KEY (user_id),
    CONSTRAINT ck_map_start_view_size CHECK (octet_length(view_json) <= 8192)
);

COMMENT ON TABLE  tbl_map_start_view                IS '지도 시작 화면(사용자별 1행) — 위치·줌·배경지도·화면 분할';
COMMENT ON COLUMN tbl_map_start_view.user_id        IS '사용자 아이디(문자열, FK 없음)';
COMMENT ON COLUMN tbl_map_start_view.view_json      IS '시작 화면 JSON(version·savedAt·split·panes)';
COMMENT ON COLUMN tbl_map_start_view.schema_version IS 'view_json의 version 값';
COMMENT ON COLUMN tbl_map_start_view.updated_at     IS '마지막 저장 시각(한국 시각, 시간대 없음)';
