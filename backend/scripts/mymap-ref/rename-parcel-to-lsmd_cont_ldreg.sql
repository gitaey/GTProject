-- ============================================================================
-- 연속지적도 표 이름 변경: ref.parcel → ref.lsmd_cont_ldreg (한 번만 실행하는 이관 SQL)
--
-- 바꾸는 것: 부모 표, 시도 파티션(parcel_<코드>[_old|_new] → lsmd_cont_ldreg_<코드>…), 인덱스, 시도 CHECK 제약 이름.
-- 바꾸지 않는 것: ref.load_meta.dataset 값 'parcel' (표 이름이 아니라 적재 기록의 구분 키 — 앱이 그대로 읽는다).
-- 데이터는 옮기지 않는다 — 이름만 바뀌므로 몇 초면 끝나고 디스크가 더 들지 않는다(ALTER ... RENAME).
--
-- ★ 순서: ① 이 SQL을 먼저 실행 → ② 새 코드(application.yml의 mymap.ref.parcel.table = ref.lsmd_cont_ldreg)를 배포.
--   코드를 먼저 배포하면 PNU 매칭이 "relation does not exist"로 실패한다. 반대로 이 SQL만 먼저 실행하면
--   옛 코드가 ref.parcel을 못 찾으므로(PNU 엑셀 업로드만 영향) 두 단계 사이를 짧게 한다.
--   서버에서 MYMAP_REF_PARCEL_TABLE 같은 환경 변수로 표 이름을 덮어쓰고 있다면 그 값도 함께 바꾼다.
-- 실행: psql -v ON_ERROR_STOP=1 -1 -f rename-parcel-to-lsmd_cont_ldreg.sql   (ref 스키마 소유 계정, 한 트랜잭션)
-- 되돌리기: 아래 DO 블록의 'parcel' ↔ 'lsmd_cont_ldreg'를 맞바꿔 다시 실행.
-- ============================================================================

DO $$
DECLARE r record;
BEGIN
  IF to_regclass('ref.parcel') IS NULL THEN
    RAISE NOTICE 'ref.parcel이 없습니다 — 이미 바꿨거나 아직 만들지 않았습니다. 아무것도 하지 않습니다.';
    RETURN;
  END IF;
  IF to_regclass('ref.lsmd_cont_ldreg') IS NOT NULL THEN
    RAISE EXCEPTION 'ref.lsmd_cont_ldreg가 이미 있습니다 — 두 이름이 함께 있으면 멈춥니다. 확인 뒤 다시 실행하세요.';
  END IF;

  -- 1) 파티션 이름(부모보다 먼저 — 자식 목록을 부모 이름으로 찾는다)
  FOR r IN
    SELECT c.relname FROM pg_inherits i
      JOIN pg_class c ON c.oid = i.inhrelid
     WHERE i.inhparent = 'ref.parcel'::regclass
  LOOP
    EXECUTE format('ALTER TABLE ref.%I RENAME TO %I', r.relname, regexp_replace(r.relname, '^parcel_', 'lsmd_cont_ldreg_'));
  END LOOP;

  -- 2) 부모 표 (적재 중 만들어 둔 _new·_old 임시 표가 파티션이 아니라면 그것도)
  EXECUTE 'ALTER TABLE ref.parcel RENAME TO lsmd_cont_ldreg';
  FOR r IN
    SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'ref' AND c.relkind = 'r' AND c.relname ~ '^parcel_'
  LOOP
    EXECUTE format('ALTER TABLE ref.%I RENAME TO %I', r.relname, regexp_replace(r.relname, '^parcel_', 'lsmd_cont_ldreg_'));
  END LOOP;

  -- 3) 인덱스 이름 (ix_parcel_pnu, parcel_<코드>[_new]_pnu_idx…)
  FOR r IN
    SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'ref' AND c.relkind IN ('i', 'I') AND c.relname ~ '^(ix_)?parcel_'
  LOOP
    EXECUTE format('ALTER INDEX ref.%I RENAME TO %I', r.relname, regexp_replace(r.relname, '^(ix_)?parcel_', '\1lsmd_cont_ldreg_'));
  END LOOP;

  -- 4) 시도 CHECK 제약 이름 (parcel_<코드>_new_sido_chk → 적재 스크립트가 만든 것)
  FOR r IN
    SELECT t.relname AS tbl, k.conname FROM pg_constraint k
      JOIN pg_class t ON t.oid = k.conrelid JOIN pg_namespace n ON n.oid = t.relnamespace
     WHERE n.nspname = 'ref' AND k.conname ~ '^parcel_'
  LOOP
    EXECUTE format('ALTER TABLE ref.%I RENAME CONSTRAINT %I TO %I', r.tbl, r.conname, regexp_replace(r.conname, '^parcel_', 'lsmd_cont_ldreg_'));
  END LOOP;
END $$;

-- 확인(읽기 전용):
--   SELECT count(*) FROM pg_inherits WHERE inhparent = 'ref.lsmd_cont_ldreg'::regclass;                       -- 20
--   SELECT relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
--    WHERE n.nspname = 'ref' AND relname LIKE '%parcel%';                                                      -- 0행
--   SELECT * FROM ref.load_meta ORDER BY sido;                                                                 -- dataset = 'parcel' 그대로
--   SELECT count(*) FROM ref.lsmd_cont_ldreg;                                                                  -- 적재한 전체 행 수와 같아야 함
