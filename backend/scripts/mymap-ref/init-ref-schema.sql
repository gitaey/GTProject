-- ============================================================================
-- S2 — 참조 스키마 `ref` (연속지적도). 설계 6.3 + VWorld 실제 파일(2026-10-08, AL_D002_*) 확인 결과 반영
--
-- 실행 시점: 연속지적도 적재 전, 한 번. 여러 번 실행해도 안전하다(IF NOT EXISTS).
-- 실행 주체: ref 스키마 소유(적재용) 계정. 앱 계정에는 아래 GRANT로 읽기만 준다.
--           psql -v ON_ERROR_STOP=1 -1 -f init-ref-schema.sql
-- 사본: _workspace/mymap/ddl-ref.sql (같은 내용 — 이 파일이 원본)
--
-- 이 표들은 JPA 엔티티로 매핑하지 않는다(ddl-auto가 건드리지 못함). 앱은 JdbcTemplate으로 읽기만 한다.
-- 백업: 서비스 DB를 pg_dump로 백업한다면 `-N ref`로 제외(참조 데이터는 다시 받을 수 있다).
-- ============================================================================

CREATE SCHEMA IF NOT EXISTS ref;
CREATE EXTENSION IF NOT EXISTS postgis;   -- 이미 있으면 아무 일도 하지 않는다

-- 앱 계정에는 읽기만. 계정 이름은 환경마다 다르므로 자리표시자 — 채워서 한 번 실행한다
-- GRANT USAGE ON SCHEMA ref TO <앱_DB_계정>;
-- GRANT SELECT ON ALL TABLES IN SCHEMA ref TO <앱_DB_계정>;
-- ALTER DEFAULT PRIVILEGES IN SCHEMA ref GRANT SELECT ON TABLES TO <앱_DB_계정>;
-- (적재 스크립트가 새 파티션을 만들 때마다 SELECT가 자동으로 붙게 하려면 마지막 줄을 "적재용 계정이 실행"한다:
--  ALTER DEFAULT PRIVILEGES FOR ROLE <적재_DB_계정> IN SCHEMA ref GRANT SELECT ON TABLES TO <앱_DB_계정>;)

-- 연속지적도(전국, 시도별 LIST 파티션 — 월 갱신은 시도 하나씩 교체해 피크 디스크를 줄인다).
-- 원본(VWorld AL_D002_<시도코드>_<YYYYMMDD>.shp, DBF 컬럼이 A0~A7로 익명)과의 대응:
--   A1 PNU(19) → pnu          A2 법정동코드(10) → bjd_code     A3 법정동 이름(254) → bjd_name
--   A4 지번(10, 본번-부번) → jibun    A5 지번+지목(200) → jibun_jimok   A6 기준일 → base_date
--   A7 시군구코드(5) → sgg_code        (A0 일련번호는 쓰지 않는다)
-- 좌표계: 원본 EPSG:5186 → 적재 때 EPSG:4326으로 변환해 저장(앱은 4326만 쓴다 → 조회마다 변환 없음)
CREATE TABLE IF NOT EXISTS ref.parcel (
    pnu          varchar(19)  NOT NULL,
    sido         char(2)      NOT NULL,        -- 파티션 키 = PNU 앞 2자리
    bjd_code     char(10),
    bjd_name     varchar(254),                 -- 예: "세종특별자치시  금남면 …" (공백이 둘일 수 있다 — 2단계 주소 매칭 때 정규화)
    jibun        varchar(10),
    jibun_jimok  varchar(200),                 -- 예: "13-41 답" (지목이 붙어 있다. 분리는 형식 확인 뒤 2단계에서)
    base_date    date,
    sgg_code     char(5),
    geom         geometry(MultiPolygon, 4326) NOT NULL
) PARTITION BY LIST (sido);

-- 시도코드 20개: 현행 17개(11 서울·26 부산·27 대구·28 인천·30 대전·31 울산·36 세종·41 경기·43 충북·44 충남·47 경북·48 경남·50 제주·51 강원·52 전북)
-- + 12 전남광주통합(신규, 2026-10 파일에서 확인) + 개편 전후 코드 29 광주·46 전남·42 강원·45 전북(옛 코드가 섞인 자료 대비).
-- 기본(DEFAULT) 파티션은 두지 않는다 — 있으면 DETACH PARTITION ... CONCURRENTLY가 "cannot detach partitions concurrently
-- when a default partition exists" 오류로 막히고, ATTACH 때마다 기본 파티션을 훑는다. 모르는 코드의 행은 적재 검증에서 걸러진다.
DO $$
DECLARE c text;
BEGIN
  FOREACH c IN ARRAY ARRAY['11','12','26','27','28','29','30','31','36','41','42','43','44','45','46','47','48','50','51','52'] LOOP
    EXECUTE format('CREATE TABLE IF NOT EXISTS ref.parcel_%s PARTITION OF ref.parcel FOR VALUES IN (%L)', c, c);
  END LOOP;
END $$;

-- 분할 인덱스(부모에 만들면 파티션마다 생긴다). PNU는 중복이 있을 수 있어 UNIQUE가 아니다
CREATE INDEX IF NOT EXISTS ix_parcel_pnu ON ref.parcel (pnu);
-- 만들지 않는 것: GiST(geom) — 앱은 PNU로만 찾는다(공간 검색 없음, 약 2~3GB 절약).
-- 2단계(주소 엑셀)에서 법정동 이름+지번으로 찾는다면 그때 추가를 검토한다:
--   CREATE INDEX ix_parcel_bjd_jibun ON ref.parcel (bjd_code, jibun);

-- 적재 기록: 시도마다 기준월·행 수. status=SWAPPING이면 앱 업로드 매칭이 그 시도 교체가 끝날 때까지 잠시 기다린다
CREATE TABLE IF NOT EXISTS ref.load_meta (
    dataset    varchar(30) NOT NULL,   -- parcel (2단계: legal_dong | road_address)
    sido       char(2)     NOT NULL,   -- 시도코드(전국 단위 데이터는 '00')
    version    varchar(7)  NOT NULL,   -- YYYY-MM (시도마다 다를 수 있음)
    status     varchar(12) NOT NULL,   -- READY | SWAPPING
    row_count  bigint      NOT NULL,
    base_date  date,                   -- 원본 기준일(A6의 최댓값)
    loaded_at  timestamp   NOT NULL,
    PRIMARY KEY (dataset, sido)
);

-- 확인(읽기 전용):
--   SELECT count(*) FROM pg_inherits WHERE inhparent = 'ref.parcel'::regclass;      -- 20
--   SELECT * FROM ref.load_meta ORDER BY sido;
