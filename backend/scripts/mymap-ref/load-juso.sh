#!/usr/bin/env bash
# =============================================================================
# load-juso.sh — 도로명주소 건물DB(전체분 txt: build_*.txt · jibun_*.txt · road_code_total.txt)를
#                ref.ti_spbd_buld(건물정보) · ref.ti_scco_mvmn(관련지번) · ref.ti_sprd_stret(도로명코드)로 적재·교체
#
# 표 하나씩 "새 표(_new)에 적재 → 행 수·한글 검증 → PK·인덱스 → 한 트랜잭션으로 교체"를 한다. 실패하면 그 표는 지난달 데이터가 그대로다.
# 같은 기준월(--version)로 이미 적재된 표는 건너뛰므로(재시작 가능) 끊겨도 같은 명령을 다시 실행하면 된다(--force로 다시 적재).
# 원본은 파이프(|) 구분, MS949(CP949). iconv로 UTF-8로 바꿔 COPY한다. 줄 끝 구분자·따옴표 처리 없음(열 수 고정 — 가이드 붙임 1).
#
# 접속 정보는 환경 변수로만 받는다(스크립트·명령줄에 비밀번호를 쓰지 않는다):
#   PGHOST PGPORT PGDATABASE PGUSER  (필수: PGDATABASE, PGUSER) / 비밀번호는 PGPASSWORD 또는 ~/.pgpass
# 실행 파일 위치(PATH에 없을 때): PSQL ICONV   예) PSQL=C:/OSGeo4W/bin/psql.exe
# 먼저 init-ref-schema.sql, init-ref-juso-schema.sql이 실행돼 있어야 한다. 자세한 설명: README.md
# =============================================================================
set -Eeuo pipefail
export MSYS_NO_PATHCONV=1 MSYS2_ARG_CONV_EXCL='*'
# iconv로 UTF-8로 바꿔 보내므로 psql의 클라이언트 인코딩도 UTF-8로 고정(윈도 psql 기본은 CP949 — 안 맞으면 한글이 깨지거나 COPY가 실패한다)
export PGCLIENTENCODING=UTF8

PSQL=${PSQL:-psql}
ICONV=${ICONV:-iconv}

usage() {
  cat <<'EOF'
사용법:
  load-juso.sh [옵션] --version YYYY-MM <폴더>     폴더에 build_*.txt, jibun_*.txt, road_code_total.txt가 있어야 한다

옵션:
  --version YYYY-MM        자료 기준월(필수). 적재 기록(ref.load_meta)의 version·기준일(그 달 말일)이 된다
  --only buld,mvmn,stret   일부만(건물정보=buld, 관련지번=mvmn, 도로명코드=stret). 기본: 전부
  --first-load             지난달 대비 ±허용치 검사를 건너뜀(기존 표가 비어 있으면 자동으로 건너뜀)
  --tolerance PCT          지난달 대비 행 수 허용 오차(기본 5)
  --force                  같은 기준월로 이미 적재됐어도 다시 적재
  --dry-run                실행하지 않고 명령만 출력
  --maintenance-work-mem 1GB   인덱스 만들 때 메모리
  -h, --help

종료 코드: 0 전부 성공(건너뜀 포함) / 1 일부 표 실패 / 2 사용법·사전 점검 오류
EOF
}

DRY=0; FORCE=0; FIRST_LOAD=0; TOLERANCE=5; MWM=1GB; VERSION=""; ONLY="buld,mvmn,stret"; DIR=""
log() { printf '%s [%s] %s\n' "$(date '+%F %T')" "${CUR:-main}" "$*"; }
die() { printf '오류: %s\n' "$*" >&2; exit 2; }

while [[ $# -gt 0 ]]; do
  case "$1" in
    -h|--help) usage; exit 0 ;;
    --dry-run) DRY=1 ;;
    --force) FORCE=1 ;;
    --first-load) FIRST_LOAD=1 ;;
    --version) VERSION=${2:?--version 값이 없습니다}; shift ;;
    --only) ONLY=${2:?--only 값이 없습니다}; shift ;;
    --tolerance) TOLERANCE=${2:?--tolerance 값이 없습니다}; shift ;;
    --maintenance-work-mem) MWM=${2:?값이 없습니다}; shift ;;
    -*) usage >&2; die "알 수 없는 옵션: $1" ;;
    *) [[ -z "$DIR" ]] || die "폴더는 하나만 받습니다"; DIR=$1 ;;
  esac
  shift
done

[[ "$VERSION" =~ ^[0-9]{4}-[0-9]{2}$ ]] || { usage >&2; die "--version YYYY-MM이 필요합니다"; }
[[ -n "$DIR" && ( $DRY -eq 1 || -d "$DIR" ) ]] || { usage >&2; die "폴더가 없습니다: ${DIR:-(지정 안 됨)}"; }
[[ "$TOLERANCE" =~ ^[0-9]+$ ]] || die "--tolerance는 정수(%)여야 합니다"
[[ "$ONLY" =~ ^(buld|mvmn|stret)(,(buld|mvmn|stret))*$ ]] || die "--only는 buld,mvmn,stret 중 쉼표로 구분한 값이어야 합니다"
[[ "$MWM" =~ ^[0-9]+(kB|MB|GB)$ ]] || die "--maintenance-work-mem은 512MB·1GB처럼 단위를 붙여야 합니다"

q() {   # 한 문장(결과는 | 구분). --dry-run이면 출력만
  if [[ $DRY -eq 1 ]]; then printf '+ psql -c %q\n' "$1" >&2; return 0; fi
  "$PSQL" -X -q -t -A -v ON_ERROR_STOP=1 -c "$1"
}
qf() {  # 여러 문장(같은 세션), 표준입력으로
  local sql; sql=$(cat)
  if [[ $DRY -eq 1 ]]; then printf '+ psql -f - <<SQL\n%s\nSQL\n' "$sql" >&2; return 0; fi
  printf '%s\n' "$sql" | "$PSQL" -X -q -v ON_ERROR_STOP=1 -f -
}

preflight() {
  [[ -n "${PGDATABASE:-}" && -n "${PGUSER:-}" ]] || die "환경 변수 PGDATABASE와 PGUSER가 필요합니다(PGHOST·PGPORT·PGPASSWORD도 환경 변수로)"
  for exe in "$PSQL" "$ICONV"; do
    command -v "$exe" >/dev/null 2>&1 || [[ -x "$exe" ]] || die "실행 파일을 찾을 수 없습니다: $exe (PSQL·ICONV 환경 변수로 경로 지정)"
  done
  [[ $DRY -eq 1 ]] && return 0
  local ok
  ok=$(q "SELECT to_regclass('ref.ti_spbd_buld') IS NOT NULL AND to_regclass('ref.ti_scco_mvmn') IS NOT NULL AND to_regclass('ref.ti_sprd_stret') IS NOT NULL AND to_regclass('ref.load_meta') IS NOT NULL") || die "DB에 접속하지 못했습니다"
  [[ "$ok" == "t" ]] || die "ref.ti_* 표 또는 ref.load_meta가 없습니다 — 먼저 init-ref-schema.sql, init-ref-juso-schema.sql을 실행하세요"
}

# load_one <약칭> <표> <파일 패턴> <최소 파일 수> <COPY 열 목록> <PK 열> <추가 인덱스 접미사> <추가 인덱스 열> <한글 점검 열>
load_one() {
  local key=$1 t=$2 pattern=$3 minfiles=$4 cols=$5 pk=$6 ixs=$7 ixcols=$8 hcol=$9
  local ix2s=${10:-} ix2cols=${11:-}   # 두 번째 인덱스(선택) — 건물정보의 지번 → 건물 색인
  CUR=$t
  local new="ref.${t}_new" cur="ref.${t}" files=() f
  shopt -s nullglob
  if [[ $DRY -eq 1 && ! -d "$DIR" ]]; then files=("$DIR/${pattern/\*/dry}"); else files=("$DIR"/$pattern); fi
  shopt -u nullglob
  [[ ${#files[@]} -ge $minfiles ]] || { log "파일이 모자랍니다: $pattern ${#files[@]}개 (최소 $minfiles)"; return 1; }

  if [[ $FORCE -eq 0 ]]; then
    local done_row; done_row=$(q "SELECT 1 FROM ref.load_meta WHERE dataset='$t' AND sido='00' AND version='$VERSION' AND status='READY'") || return 1
    [[ -z "$done_row" ]] || { log "이미 $VERSION으로 적재됨 — 건너뜀(--force로 다시)"; return 0; }
  fi

  local expect=0 n
  for f in "${files[@]}"; do
    if [[ $DRY -eq 1 && ! -f "$f" ]]; then continue; fi
    n=$(wc -l < "$f"); expect=$((expect + n))
  done
  log "적재 시작: 파일 ${#files[@]}개, 원본 ${expect}행"

  q "DROP TABLE IF EXISTS $new" >/dev/null || return 1
  q "CREATE TABLE $new (LIKE $cur INCLUDING DEFAULTS INCLUDING GENERATED INCLUDING COMMENTS)" >/dev/null || return 1

  for f in "${files[@]}"; do
    log "  COPY $(basename "$f")"
    if [[ $DRY -eq 1 ]]; then printf '+ iconv -f CP949 -t UTF-8 %q | psql -c "COPY %s (%s) FROM STDIN (FORMAT csv, DELIMITER |, QUOTE E\\x1f, ESCAPE E\\x1f, NULL )"\n' "$f" "$new" "$cols"; continue; fi
    "$ICONV" -f CP949 -t UTF-8 "$f" \
      | "$PSQL" -X -q -v ON_ERROR_STOP=1 -c "COPY $new ($cols) FROM STDIN WITH (FORMAT csv, DELIMITER '|', QUOTE E'\\x1f', ESCAPE E'\\x1f', NULL '')" \
      || { log "  COPY 실패: $f"; return 1; }
  done

  # 검증 1) 행 수 = 원본 줄 수
  local got; got=$(q "SELECT count(*) FROM $new") || return 1
  if [[ $DRY -eq 0 && "$got" != "$expect" ]]; then log "행 수가 다릅니다: 적재 $got ≠ 원본 $expect"; return 1; fi
  log "행 수 일치: $got"

  # 검증 2) 한글이 깨지지 않았는지 — 점검 열에 한글이 든 행이 99% 이상(윈도 psql이 한글 리터럴을 못 읽으므로 chr()로 범위를 만든다)
  local hr; hr=$(q "SELECT round(100.0 * count(*) FILTER (WHERE $hcol ~ ('['||chr(44032)||'-'||chr(55203)||']')) / NULLIF(count(*) FILTER (WHERE $hcol IS NOT NULL), 0), 2) FROM $new") || return 1
  if [[ $DRY -eq 0 ]]; then
    awk -v r="${hr:-0}" 'BEGIN{exit !(r+0 >= 99)}' || { log "$hcol에 한글이 있는 행이 99% 미만($hr%) — 글자 인코딩을 확인하세요"; return 1; }
  fi
  log "한글 점검 통과($hcol: ${hr}%)"

  # 검증 3) 지난달 대비 행 수 (첫 적재·--first-load면 생략)
  if [[ $FIRST_LOAD -eq 0 ]]; then
    local prev; prev=$(q "SELECT row_count FROM ref.load_meta WHERE dataset='$t' AND sido='00'") || return 1
    if [[ -n "$prev" && "$prev" -gt 0 ]]; then
      local diff; diff=$(awk -v a="$got" -v b="$prev" 'BEGIN{d=(a-b)*100.0/b; if(d<0)d=-d; printf "%.2f", d}')
      if [[ $DRY -eq 0 ]] && awk -v d="$diff" -v t="$TOLERANCE" 'BEGIN{exit !(d+0 > t+0)}'; then
        log "지난달($prev)과 ${diff}% 차이 — 허용 ${TOLERANCE}% 초과(맞다면 --first-load)"; return 1
      fi
      log "지난달 대비 ${diff}% 차이(허용 ${TOLERANCE}%)"
    fi
  fi

  # PK·인덱스 → 통계
  log "PK·인덱스 만드는 중"
  local ix_sql=""
  [[ -z "$ixs" ]] || ix_sql="CREATE INDEX ix_${t}_new_${ixs} ON $new ($ixcols);"
  [[ -z "$ix2s" ]] || ix_sql="$ix_sql
CREATE INDEX ix_${t}_new_${ix2s} ON $new ($ix2cols);"
  qf <<SQL || return 1
SET maintenance_work_mem = '$MWM';
ALTER TABLE $new ADD CONSTRAINT ${t}_new_pkey PRIMARY KEY ($pk);
$ix_sql
ANALYZE $new;
SQL

  # 교체 — 한 트랜잭션(옛 표 지우기·이름 바꾸기·표 설명 유지·기록). 읽기는 몇 밀리초 기다릴 뿐 실패하지 않는다.
  log "교체 중"
  local ix_rename=""
  [[ -z "$ixs" ]] || ix_rename="ALTER INDEX ref.ix_${t}_new_${ixs} RENAME TO ix_${t}_${ixs};"
  [[ -z "$ix2s" ]] || ix_rename="$ix_rename
ALTER INDEX ref.ix_${t}_new_${ix2s} RENAME TO ix_${t}_${ix2s};"
  qf <<SQL || return 1
BEGIN;
SET LOCAL lock_timeout = '30s';
DO \$\$
DECLARE c text;
BEGIN
  SELECT obj_description('$cur'::regclass, 'pg_class') INTO c;
  DROP TABLE $cur;
  ALTER TABLE $new RENAME TO $t;
  ALTER TABLE $cur RENAME CONSTRAINT ${t}_new_pkey TO ${t}_pkey;
  IF c IS NOT NULL THEN EXECUTE format('COMMENT ON TABLE $cur IS %L', c); END IF;
END \$\$;
$ix_rename
INSERT INTO ref.load_meta (dataset, sido, version, status, row_count, base_date, loaded_at)
  VALUES ('$t', '00', '$VERSION', 'READY', $got,
          (date_trunc('month', ('$VERSION-01')::date) + interval '1 month - 1 day')::date, now())
  ON CONFLICT (dataset, sido) DO UPDATE
    SET version = EXCLUDED.version, status = EXCLUDED.status, row_count = EXCLUDED.row_count,
        base_date = EXCLUDED.base_date, loaded_at = EXCLUDED.loaded_at;
COMMIT;
SQL
  log "완료: $t $got행 (기준월 $VERSION)"
}

preflight
fail=0
has() { [[ ",$ONLY," == *",$1,"* ]]; }

BULD_COLS="adm_cd,ctp_kor_nm,sig_kor_nm,emd_kor_nm,li_kor_nm,mntn_yn,lnbr_mnnm,lnbr_slno,road_cd,rn,udgd_yn,buld_mnnm,buld_slno,buld_nm,buld_nm_dc,bd_mgt_sn,emd_no,adm_dong_cd,adm_dong_nm,zip_cd,zip_seq,bignum_deliv_nm,mv_rs_cd,ntfc_de,bfr_road_addr,sgg_buld_nm,apt_yn,bsi_zon_no,detl_addr_yn,rmk1,rmk2"
MVMN_COLS="adm_cd,ctp_kor_nm,sig_kor_nm,emd_kor_nm,li_kor_nm,mntn_yn,lnbr_mnnm,lnbr_slno,road_cd,udgd_yn,buld_mnnm,buld_slno,jibun_seq,mv_rs_cd"
STRET_COLS="sgg_cd,road_no,rn,rn_eng,emd_no,ctp_kor_nm,sig_kor_nm,emd_gb,emd_cd,emd_kor_nm,up_road_no,up_rn,use_yn,chg_rs_cd,chg_hist_info,ctp_eng_nm,sig_eng_nm,emd_eng_nm,ntfc_de,ersr_de"

# 도로명코드(작음) → 건물정보 → 관련지번 순
has stret && { load_one stret ti_sprd_stret 'road_code_total.txt' 1 "$STRET_COLS" "sgg_cd, road_no, emd_no" name "ctp_kor_nm, sig_kor_nm, rn" rn || { fail=1; log "실패 — 지난 데이터는 그대로입니다"; }; }
has buld  && { load_one buld  ti_spbd_buld  'build_*.txt' 16 "$BULD_COLS" "bd_mgt_sn" road "road_cd, udgd_yn, buld_mnnm, buld_slno" rn jibun "adm_cd, mntn_yn, lnbr_mnnm, lnbr_slno" || { fail=1; log "실패 — 지난 데이터는 그대로입니다"; }; }
has mvmn  && { load_one mvmn  ti_scco_mvmn  'jibun_*.txt' 16 "$MVMN_COLS" "road_cd, udgd_yn, buld_mnnm, buld_slno, jibun_seq" "" "" emd_kor_nm || { fail=1; log "실패 — 지난 데이터는 그대로입니다"; }; }

CUR=main
if [[ $fail -ne 0 ]]; then log "일부 표가 실패했습니다(위 로그 확인). 임시 표 ref.*_new는 다음 실행 때 지워집니다."; exit 1; fi
log "전부 끝났습니다."
