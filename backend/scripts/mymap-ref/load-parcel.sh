#!/usr/bin/env bash
# =============================================================================
# load-parcel.sh — 연속지적도(VWorld AL_D002_<시도코드>_<YYYYMMDD>.zip|.shp)를 ref.lsmd_cont_ldreg 시도 파티션으로 적재·교체
#
# 시도 하나씩 "새 표 적재 → 검증 → 인덱스 → 한 트랜잭션으로 교체"를 한다. 한 시도가 실패해도 그 시도는 지난달 데이터가 그대로고
# (임시 표는 정리), 다음 시도로 넘어간다. 이미 같은 기준월로 적재된 시도는 건너뛰므로(재시작 가능) 중간에 끊겨도 같은 명령을 다시 실행하면 된다.
#
# 접속 정보는 환경 변수로만 받는다(스크립트·명령줄에 비밀번호를 쓰지 않는다):
#   PGHOST PGPORT PGDATABASE PGUSER  (필수: PGDATABASE, PGUSER) / 비밀번호는 PGPASSWORD 또는 ~/.pgpass
# 실행 파일 위치(PATH에 없을 때): OGR2OGR OGRINFO PSQL   예) OGR2OGR=C:/OSGeo4W/apps/gdal-dev/bin/ogr2ogr.exe
# 먼저 init-ref-schema.sql(S2)이 실행돼 있어야 한다. 자세한 설명: README.md
# =============================================================================
set -Eeuo pipefail

# Git Bash(MSYS)가 "/vsizip/…" 같은 인자를 윈도 경로로 바꿔 버리는 것을 막는다
export MSYS_NO_PATHCONV=1 MSYS2_ARG_CONV_EXCL='*'

OGR2OGR=${OGR2OGR:-ogr2ogr}
OGRINFO=${OGRINFO:-ogrinfo}
PSQL=${PSQL:-psql}

usage() {
  cat <<'EOF'
사용법:
  load-parcel.sh [옵션] --sido <시도코드> <파일...>   한 시도(파일은 .zip .shp .csv, 여러 개면 같은 시도로 합침)
  load-parcel.sh [옵션] --all <폴더>                  폴더의 AL_D002_<코드>_<날짜>.zip|.shp를 시도별로 차례로(코드 오름차순)

옵션:
  --dry-run                실행할 명령만 출력한다(DB·파일에 접근하지 않음)
  --only 36,41             --all에서 이 시도들만
  --version YYYY-MM        기준월(기본: 파일 이름의 _YYYYMMDD에서)
  --force                  이미 같은 기준월로 적재(READY)된 시도도 다시 적재
  --keep-old               교체 뒤 옛 파티션을 지우지 않고 ref.lsmd_cont_ldreg_<코드>_old로 남김(다음 적재 때 지움)
  --unlogged               UNLOGGED로 적재 → 검증·인덱스 → SET LOGGED → 교체(README "UNLOGGED" 절 참고, 기본 끔)
  --via-stage              ogr2ogr가 임시 표(ref._stage_<코드>)로 적재한 뒤 INSERT..SELECT(직접 -append가 안 될 때의 대체, 시간·WAL 약 2배)
  --first-load             지난달 대비 ±허용치 검사를 건너뜀(기존 파티션이 비어 있으면 자동으로 건너뜀)
  --tolerance PCT          지난달 대비 행 수 허용 오차(기본 5)
  --s-srs EPSG:5186        원본 좌표계(기본: .prj를 따름. .csv는 필수)
  --encoding NAME          DBF 글자 인코딩(기본 CP949 — VWorld .cpg에는 UTF-8이라 적혀 있지만 실제는 CP949, 2026-10 세종으로 확인).
                           진짜 UTF-8 파일이면 --encoding UTF-8, .cpg를 따르려면 --encoding auto
  --skip-text-check        적재 뒤 한글 점검(bjd_name)을 건너뜀(한글이 없는 시험 자료용)
  --layer NAME             파일 안 레이어 이름(기본: 자동 — 파일에 든 레이어 전부)
  --col-pnu A1  --col-bjd-code A2  --col-bjd-name A3  --col-jibun A4  --col-jimok A5  --col-base-date A6  --col-sgg A7
                           원본 컬럼 이름(기본값은 2026-10 VWorld 파일에서 확인한 A1~A7)
  --maintenance-work-mem 1GB   인덱스 만들 때 메모리
  -h, --help

종료 코드: 0 전부 성공(건너뜀 포함) / 1 일부 시도 실패 / 2 사용법·사전 점검 오류
EOF
}

# ---------- 기본값 ----------
DRY=0; FORCE=0; KEEP_OLD=0; UNLOGGED=0; VIA_STAGE=0; FIRST_LOAD=0
TOLERANCE=5; MWM=1GB; VERSION=""; S_SRS=""; ENCODING="CP949"; LAYER=""; SKIP_TEXT_CHECK=0
SIDO=""; ALL_DIR=""; ONLY=""
COL_PNU=A1; COL_BJD_CODE=A2; COL_BJD_NAME=A3; COL_JIBUN=A4; COL_JIMOK=A5; COL_BASE_DATE=A6; COL_SGG=A7
FILES=()

log() { printf '%s [%s] %s\n' "$(date '+%F %T')" "${CUR:-main}" "$*"; }
die() { printf '오류: %s\n' "$*" >&2; exit 2; }

while [[ $# -gt 0 ]]; do
  case "$1" in
    -h|--help) usage; exit 0 ;;
    --dry-run) DRY=1 ;;
    --force) FORCE=1 ;;
    --keep-old) KEEP_OLD=1 ;;
    --unlogged) UNLOGGED=1 ;;
    --via-stage) VIA_STAGE=1 ;;
    --first-load) FIRST_LOAD=1 ;;
    --sido) SIDO=${2:?--sido 값이 없습니다}; shift ;;
    --all) ALL_DIR=${2:?--all 값이 없습니다}; shift ;;
    --only) ONLY=${2:?--only 값이 없습니다}; shift ;;
    --version) VERSION=${2:?--version 값이 없습니다}; shift ;;
    --tolerance) TOLERANCE=${2:?--tolerance 값이 없습니다}; shift ;;
    --s-srs) S_SRS=${2:?--s-srs 값이 없습니다}; shift ;;
    --encoding) ENCODING=${2:?--encoding 값이 없습니다}; shift ;;
    --skip-text-check) SKIP_TEXT_CHECK=1 ;;
    --layer) LAYER=${2:?--layer 값이 없습니다}; shift ;;
    --maintenance-work-mem) MWM=${2:?값이 없습니다}; shift ;;
    --col-pnu) COL_PNU=${2:?값이 없습니다}; shift ;;
    --col-bjd-code) COL_BJD_CODE=${2:?값이 없습니다}; shift ;;
    --col-bjd-name) COL_BJD_NAME=${2:?값이 없습니다}; shift ;;
    --col-jibun) COL_JIBUN=${2:?값이 없습니다}; shift ;;
    --col-jimok) COL_JIMOK=${2:?값이 없습니다}; shift ;;
    --col-base-date) COL_BASE_DATE=${2:?값이 없습니다}; shift ;;
    --col-sgg) COL_SGG=${2:?값이 없습니다}; shift ;;
    --) shift; FILES+=("$@"); break ;;
    -*) usage >&2; die "알 수 없는 옵션: $1" ;;
    *) FILES+=("$1") ;;
  esac
  shift
done

# ---------- 인자 점검 ----------
[[ -n "$SIDO" || -n "$ALL_DIR" ]] || { usage >&2; die "--sido 또는 --all 중 하나가 필요합니다"; }
[[ -z "$SIDO" || -z "$ALL_DIR" ]] || die "--sido와 --all은 함께 쓸 수 없습니다"
if [[ -n "$SIDO" ]]; then
  [[ "$SIDO" =~ ^[0-9]{2}$ ]] || die "--sido는 숫자 2자리 시도코드여야 합니다: $SIDO"
  [[ ${#FILES[@]} -gt 0 ]] || die "--sido에는 적재할 파일이 필요합니다"
else
  [[ ${#FILES[@]} -eq 0 ]] || die "--all은 폴더 하나만 받습니다(파일을 따로 주려면 --sido)"
  [[ $DRY -eq 1 || -d "$ALL_DIR" ]] || die "폴더가 없습니다: $ALL_DIR"
fi
[[ -z "$VERSION" || "$VERSION" =~ ^[0-9]{4}-[0-9]{2}$ ]] || die "--version은 YYYY-MM 형식이어야 합니다: $VERSION"
[[ "$TOLERANCE" =~ ^[0-9]+$ ]] || die "--tolerance는 정수(%)여야 합니다"
# 컬럼 이름은 SQL 문장에 들어가므로 식별자 모양만 허용한다
for c in "$COL_PNU" "$COL_BJD_CODE" "$COL_BJD_NAME" "$COL_JIBUN" "$COL_JIMOK" "$COL_BASE_DATE" "$COL_SGG"; do
  [[ "$c" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]] || die "컬럼 이름이 올바르지 않습니다: $c"
done
[[ -z "$ONLY" || "$ONLY" =~ ^[0-9]{2}(,[0-9]{2})*$ ]] || die "--only는 '36,41'처럼 쉼표로 구분한 2자리 코드여야 합니다"
[[ "$MWM" =~ ^[0-9]+(kB|MB|GB)$ ]] || die "--maintenance-work-mem은 512MB·1GB처럼 단위를 붙여야 합니다"

# ---------- 도우미 ----------
native_path() {  # git-bash 경로(/d/…)를 네이티브 exe가 읽는 D:/… 로
  if command -v cygpath >/dev/null 2>&1; then cygpath -m "$1"; else printf '%s' "$1"; fi
}

conn_string() {  # 비밀번호는 넣지 않는다(libpq가 PGPASSWORD/.pgpass를 직접 읽는다)
  local s="PG:dbname=${PGDATABASE:-}"
  if [[ -n "${PGHOST:-}" ]]; then s+=" host=$PGHOST"; fi
  if [[ -n "${PGPORT:-}" ]]; then s+=" port=$PGPORT"; fi
  if [[ -n "${PGUSER:-}" ]]; then s+=" user=$PGUSER"; fi
  printf '%s' "$s"
}

# 실행하거나(--dry-run이면 출력만) — 인자 배열 그대로
run() {
  if [[ $DRY -eq 1 ]]; then printf '+'; printf ' %q' "$@"; printf '\n'; return 0; fi
  "$@"
}

# psql 한 문장(결과는 | 구분 한 줄들). --dry-run이면 아무것도 하지 않고 비어 있음.
q() {
  if [[ $DRY -eq 1 ]]; then printf '+ psql -c %q\n' "$1" >&2; return 0; fi
  "$PSQL" -X -q -t -A -v ON_ERROR_STOP=1 -c "$1"
}

# psql에 SQL 여러 문장(같은 세션). 표준입력으로 받는다.
qf() {
  local sql; sql=$(cat)
  if [[ $DRY -eq 1 ]]; then printf '+ psql -f - <<SQL\n%s\nSQL\n' "$sql" >&2; return 0; fi
  printf '%s\n' "$sql" | "$PSQL" -X -q -v ON_ERROR_STOP=1 -f -
}

# ---------- 사전 점검(한 번) ----------
preflight() {
  [[ -n "${PGDATABASE:-}" && -n "${PGUSER:-}" ]] || die "환경 변수 PGDATABASE와 PGUSER가 필요합니다(PGHOST·PGPORT·PGPASSWORD도 환경 변수로)"
  for exe in "$PSQL" "$OGR2OGR" "$OGRINFO"; do
    command -v "$exe" >/dev/null 2>&1 || [[ -x "$exe" ]] || die "실행 파일을 찾을 수 없습니다: $exe (OGR2OGR·OGRINFO·PSQL 환경 변수로 경로 지정)"
  done
  local ok; ok=$(q "SELECT to_regclass('ref.lsmd_cont_ldreg') IS NOT NULL AND to_regclass('ref.load_meta') IS NOT NULL") || die "DB에 접속하지 못했습니다"
  [[ "$ok" == "t" ]] || die "ref.lsmd_cont_ldreg·ref.load_meta가 없습니다 — 먼저 init-ref-schema.sql을 실행하세요"
}

# 파일 이름에서 시도코드·기준월 읽기: AL_D002_36_20261008.zip → 36 / 2026-10
code_of()    { local b; b=$(basename "$1"); [[ "$b" =~ _([0-9]{2})_[0-9]{8} ]] && printf '%s' "${BASH_REMATCH[1]}" || true; }
version_of() { local b; b=$(basename "$1"); [[ "$b" =~ _([0-9]{4})([0-9]{2})[0-9]{2}([^0-9]|$) ]] && printf '%s-%s' "${BASH_REMATCH[1]}" "${BASH_REMATCH[2]}" || true; }

datasource_of() {  # zip은 풀지 않고 GDAL이 바로 읽는다(/vsizip/) — 임시 디스크 20~30GB를 아낀다
  local p; p=$(native_path "$1")
  case "${1,,}" in
    *.zip) printf '/vsizip/%s' "$p" ;;
    *) printf '%s' "$p" ;;
  esac
}

layers_of() {  # 데이터소스에 든 레이어 이름들
  if [[ -n "$LAYER" ]]; then printf '%s\n' "$LAYER"; return; fi
  if [[ $DRY -eq 1 ]]; then printf '<레이어:ogrinfo로 확인>\n'; return; fi
  "$OGRINFO" -ro -q "$1" | sed -n 's/^[0-9]*: \(.*\) ([^()]*)$/\1/p'
}

feature_count() {  # ogrinfo -so 의 "Feature Count: N"
  if [[ $DRY -eq 1 ]]; then echo 0; return; fi
  "$OGRINFO" -ro -so "$1" "$2" | sed -n 's/^Feature Count: *//p' | head -1
}

# 원본 컬럼 → ref.lsmd_cont_ldreg 컬럼. sido는 PNU 앞 2자리(파티션 키)로 계산한다
ogr_sql() {
  printf 'SELECT %s AS pnu, SUBSTR(%s, 1, 2) AS sido, %s AS bjd_code, %s AS bjd_name, %s AS jibun, %s AS jibun_jimok, %s AS base_date, %s AS sgg_code FROM "%s"' \
    "$COL_PNU" "$COL_PNU" "$COL_BJD_CODE" "$COL_BJD_NAME" "$COL_JIBUN" "$COL_JIMOK" "$COL_BASE_DATE" "$COL_SGG" "$1"
}

# ---------- 시도 하나 ----------
CLEAN_TABLES=()   # 실패했을 때 지울 임시 표
cleanup_tables() {
  local t
  for t in "${CLEAN_TABLES[@]:-}"; do
    [[ -n "$t" ]] || continue
    log "임시 표 정리: $t"
    q "DROP TABLE IF EXISTS $t" >/dev/null 2>&1 || log "경고: $t 를 지우지 못했습니다(수동으로 DROP TABLE)"
  done
  CLEAN_TABLES=()
}

load_sido() {  # 인자: 코드 버전 파일...
  local c=$1 ver=$2; shift 2
  local files=("$@")
  local new="ref.lsmd_cont_ldreg_${c}_new" cur="ref.lsmd_cont_ldreg_${c}" old="ref.lsmd_cont_ldreg_${c}_old" stage="ref._stage_${c}"
  CUR="시도 $c"
  local t0=$SECONDS

  if [[ $FORCE -eq 0 ]]; then
    local done_row; done_row=$(q "SELECT 1 FROM ref.load_meta WHERE dataset='parcel' AND sido='$c' AND version='$ver' AND status='READY'") || return 1
    if [[ -n "$done_row" ]]; then log "이미 $ver 로 적재됨 — 건너뜀(다시 하려면 --force)"; return 0; fi
  fi
  local mode_note=""
  if [[ $UNLOGGED -eq 1 ]]; then mode_note+=", UNLOGGED"; fi
  if [[ $VIA_STAGE -eq 1 ]]; then mode_note+=", via-stage"; fi
  log "시작: 파일 ${#files[@]}개, 기준월 $ver$mode_note"

  # 지난달 같은 시도 행 수(첫 적재·빈 파티션이면 비교 안 함)
  local prev=0
  if [[ $FIRST_LOAD -eq 0 ]]; then
    prev=$(q "SELECT CASE WHEN to_regclass('$cur') IS NULL THEN 0 ELSE (SELECT count(*) FROM $cur) END") || return 1
    prev=${prev:-0}
  fi

  # 1) 새 표 — 부모와 같은 모양, 인덱스·제약 없이
  CLEAN_TABLES=("$new")
  if [[ $VIA_STAGE -eq 1 ]]; then CLEAN_TABLES+=("$stage"); fi
  local persist="" set_logged=""
  if [[ $UNLOGGED -eq 1 ]]; then persist="UNLOGGED"; set_logged="ALTER TABLE $new SET LOGGED;"; fi
  q "DROP TABLE IF EXISTS $new" >/dev/null || return 1
  q "CREATE $persist TABLE $new (LIKE ref.lsmd_cont_ldreg)" >/dev/null || return 1

  # 2) 파일마다 적재
  local expected=0 f ds layer n
  for f in "${files[@]}"; do
    [[ $DRY -eq 1 || -f "$f" ]] || { log "파일이 없습니다: $f"; return 1; }
    ds=$(datasource_of "$f")
    while IFS= read -r layer; do
      [[ -n "$layer" ]] || continue
      n=$(feature_count "$ds" "$layer"); n=${n:-0}
      expected=$((expected + n))
      log "적재: $(basename "$f") / $layer (피처 $n)"
      load_layer "$ds" "$layer" "$new" "$stage" "$f" || return 1
    done < <(layers_of "$ds")
  done
  log "적재 끝 — ogrinfo 피처 합계 $expected, 걸린 시간 $((SECONDS - t0))초"

  # 3) 검증 — 하나라도 실패하면 이 시도는 교체하지 않는다
  local stats total ok19 wrong named hangul badtext
  stats=$(q "SELECT count(*), count(*) FILTER (WHERE length(pnu) = 19), count(*) FILTER (WHERE left(pnu, 2) <> '$c'), \
    count(*) FILTER (WHERE coalesce(bjd_name, '') <> ''), count(*) FILTER (WHERE bjd_name ~ ('[' || chr(44032) || '-' || chr(55203) || ']')), \
    count(*) FILTER (WHERE strpos(bjd_name, chr(65533)) > 0 OR strpos(bjd_name, '?') > 0) FROM $new") || return 1
  if [[ $DRY -eq 0 ]]; then
    IFS='|' read -r total ok19 wrong named hangul badtext <<<"$stats"
    log "검증: 행 $total / 기대 $expected, PNU 19자리 $ok19, 시도 불일치 $wrong, 법정동명 있음 $named · 한글 $hangul · 깨진 글자 $badtext"
    [[ "$total" -gt 0 ]] || { log "실패: 적재된 행이 0입니다"; return 1; }
    [[ "$total" -eq "$expected" ]] || { log "실패: 행 수($total)가 ogrinfo 피처 수($expected)와 다릅니다"; return 1; }
    (( ok19 * 1000 >= total * 999 )) || { log "실패: PNU 19자리 비율이 99.9% 미만입니다($ok19/$total)"; return 1; }
    if [[ "$wrong" -ne 0 ]]; then
      log "실패: PNU 앞 2자리가 $c 가 아닌 행 $wrong 건 — 분포:"
      q "SELECT left(pnu,2), count(*) FROM $new GROUP BY 1 ORDER BY 2 DESC LIMIT 10" >&2 || true
      log "      (시도 파일에 다른 코드의 PNU가 섞여 있습니다. 파티션 규칙을 정해야 합니다 — README '문제 해결')"
      return 1
    fi
    # 글자 점검: 인코딩이 틀리면(예: CP949를 UTF-8로 읽음) 한글 칸이 깨져도 행 수·PNU 검사는 통과한다 — bjd_name으로 잡는다
    if [[ $SKIP_TEXT_CHECK -eq 0 ]]; then
      if [[ "$named" -eq 0 ]]; then
        log "실패: 법정동명(bjd_name)이 전부 비어 있습니다 — 컬럼 이름(--col-bjd-name)을 확인하세요(--skip-text-check로 생략 가능)"
        return 1
      fi
      if (( hangul * 100 < named * 99 )); then
        log "실패: 법정동명에 한글이 있는 행이 99% 미만입니다($hangul/$named) — 글자 인코딩이 틀렸을 가능성이 큽니다(--encoding CP949 | UTF-8 | auto)"
        return 1
      fi
      if [[ "$badtext" -ne 0 ]]; then
        log "실패: 법정동명에 깨진 글자(? 또는 U+FFFD)가 있는 행이 $badtext 건입니다 — 글자 인코딩을 확인하세요"
        return 1
      fi
    fi
    if [[ $FIRST_LOAD -eq 0 && "$prev" -gt 0 ]]; then
      local lo=$(( prev * (100 - TOLERANCE) / 100 )) hi=$(( prev * (100 + TOLERANCE) / 100 ))
      log "지난달 대비: 이번 $total / 지난달 $prev (허용 $lo ~ $hi)"
      (( total >= lo && total <= hi )) || { log "실패: 지난달 행 수 대비 ±${TOLERANCE}% 밖입니다(의도한 변화면 --first-load로 검사 생략)"; return 1; }
    fi
  fi
  # 잘못된 지오메트리 고치기(빈 결과는 지운다)
  qf <<SQL || return 1
SET maintenance_work_mem = '$MWM';
UPDATE $new SET geom = ST_Multi(ST_CollectionExtract(ST_MakeValid(geom), 3)) WHERE NOT ST_IsValid(geom);
DELETE FROM $new WHERE ST_IsEmpty(geom);
SQL

  # 4) 인덱스·제약·통계(그리고 UNLOGGED였다면 LOGGED로)
  log "인덱스 만드는 중(PNU)"
  qf <<SQL || return 1
SET maintenance_work_mem = '$MWM';
CREATE INDEX ON $new (pnu);
ALTER TABLE $new ADD CONSTRAINT lsmd_cont_ldreg_${c}_new_sido_chk CHECK (sido = '$c');
$set_logged
ANALYZE $new;
SQL

  # 5) 교체 — 한 트랜잭션(떼기·붙이기·이름·기록)이라 중간 상태가 보이지 않는다. 읽기는 몇 밀리초 기다릴 뿐 실패하지 않는다.
  log "교체 중"
  qf <<SQL || return 1
DROP TABLE IF EXISTS $old;
BEGIN;
SET LOCAL lock_timeout = '30s';
ALTER TABLE ref.lsmd_cont_ldreg DETACH PARTITION $cur;
ALTER TABLE ref.lsmd_cont_ldreg ATTACH PARTITION $new FOR VALUES IN ('$c');
ALTER TABLE $cur RENAME TO lsmd_cont_ldreg_${c}_old;
ALTER TABLE $new RENAME TO lsmd_cont_ldreg_${c};
INSERT INTO ref.load_meta (dataset, sido, version, status, row_count, base_date, loaded_at)
  SELECT 'parcel', '$c', '$ver', 'READY', count(*), max(base_date), now() FROM $cur
  ON CONFLICT (dataset, sido) DO UPDATE
    SET version = EXCLUDED.version, status = 'READY', row_count = EXCLUDED.row_count,
        base_date = EXCLUDED.base_date, loaded_at = EXCLUDED.loaded_at;
COMMIT;
SQL
  CLEAN_TABLES=()   # 교체 끝 — 임시 표 없음
  if [[ $KEEP_OLD -eq 0 ]]; then
    q "DROP TABLE IF EXISTS $old" >/dev/null || log "경고: $old 를 지우지 못했습니다"
  else
    log "옛 파티션 보관: $old (다음 적재 때 자동으로 지움)"
  fi
  log "완료 — 총 $((SECONDS - t0))초"
}

load_layer() {  # 인자: 데이터소스 레이어 새표 스테이지표 원본파일
  local ds=$1 layer=$2 new=$3 stage=$4 file=$5
  local target=$new
  local args=(-f PostgreSQL "$(conn_string)" "$ds" -nlt PROMOTE_TO_MULTI -t_srs EPSG:4326 -gt 65536
              --config PG_USE_COPY YES -dialect OGRSQL -sql "$(ogr_sql "$layer")")
  if [[ -n "$S_SRS" ]]; then args+=(-s_srs "$S_SRS"); fi
  # 기본 CP949: VWorld .cpg는 UTF-8이라고 적혀 있지만 실제 DBF는 CP949다. SHAPE_ENCODING이 .cpg보다 우선한다. auto면 .cpg를 따른다.
  if [[ -n "$ENCODING" && "$ENCODING" != "auto" && "${file,,}" != *.csv ]]; then args+=(--config SHAPE_ENCODING "$ENCODING"); fi
  if [[ "${file,,}" == *.csv ]]; then
    [[ -n "$S_SRS" ]] || { log "실패: .csv는 --s-srs가 필요합니다"; return 1; }
    args+=(-oo GEOM_POSSIBLE_NAMES=WKT -oo KEEP_GEOM_COLUMNS=NO)
  fi
  if [[ $VIA_STAGE -eq 1 ]]; then
    # 임시 표는 ogr2ogr가 만든다(FID 칸 포함). 파일이 여럿이면 두 번째부터 -append
    target=$stage
    local exists; exists=$(q "SELECT to_regclass('$stage') IS NOT NULL") || return 1
    if [[ "$exists" == "t" ]]; then args+=(-append); else args+=(-lco GEOMETRY_NAME=geom -overwrite); fi
    args+=(-nln "$stage")
  else
    args+=(-append -nln "$new")
  fi
  run "$OGR2OGR" "${args[@]}" || { log "실패: ogr2ogr가 오류로 끝났습니다"; return 1; }
  if [[ $VIA_STAGE -eq 1 ]]; then
    qf <<SQL || return 1
INSERT INTO $new (pnu, sido, bjd_code, bjd_name, jibun, jibun_jimok, base_date, sgg_code, geom)
  SELECT pnu, sido, bjd_code, bjd_name, jibun, jibun_jimok, base_date, sgg_code, geom FROM $stage;
DROP TABLE $stage;
SQL
  fi
}

# ---------- 실행 ----------
trap 'rc=$?; cleanup_tables; exit $rc' ERR INT TERM
if [[ $DRY -eq 1 ]]; then log "드라이런 — 명령만 출력하고 아무것도 실행하지 않습니다"; else preflight; fi

declare -a OK_LIST=() FAIL_LIST=() SKIP_NOTE=()
declare -A GROUP_FILES=() GROUP_VERSION=()

if [[ -n "$SIDO" ]]; then
  v=${VERSION:-$(version_of "${FILES[0]}")}
  [[ -n "$v" ]] || die "기준월을 알 수 없습니다 — --version YYYY-MM 을 주세요(파일 이름에 _YYYYMMDD가 없음)"
  GROUP_FILES[$SIDO]=$(printf '%s\n' "${FILES[@]}")
  GROUP_VERSION[$SIDO]=$v
else
  if [[ $DRY -eq 1 && ! -d "$ALL_DIR" ]]; then
    log "드라이런: 폴더($ALL_DIR)가 이 PC에 없어 파일 목록을 만들 수 없습니다"
  else
    while IFS= read -r f; do
      c=$(code_of "$f")
      if [[ -z "$c" ]]; then log "건너뜀(시도코드를 이름에서 읽을 수 없음): $f"; continue; fi
      if [[ -n "$ONLY" && ",$ONLY," != *",$c,"* ]]; then continue; fi
      if [[ "${f,,}" == *.shp && ( -e "${f%.*}.zip" || -e "${f%.*}.ZIP" ) ]]; then
        log "건너뜀(같은 이름의 zip이 있어 zip만 씁니다): $f"; continue
      fi
      GROUP_FILES[$c]+="${GROUP_FILES[$c]:+$'\n'}$f"
      v=${VERSION:-$(version_of "$f")}
      [[ -n "$v" ]] || die "기준월을 알 수 없습니다: $f — --version YYYY-MM 을 주세요"
      GROUP_VERSION[$c]=$v
    done < <(find "$ALL_DIR" -maxdepth 1 -type f \( -iname '*.zip' -o -iname '*.shp' \) | LC_ALL=C sort)
  fi
  [[ ${#GROUP_FILES[@]} -gt 0 || $DRY -eq 1 ]] || die "적재할 파일이 없습니다: $ALL_DIR (AL_D002_<코드>_<날짜>.zip|.shp)"
fi

# .csv는 좌표계를 파일에서 알 수 없다 — 적재를 시작하기 전에 막는다
if [[ -z "$S_SRS" ]]; then
  for c in "${!GROUP_FILES[@]}"; do
    [[ "${GROUP_FILES[$c],,}" != *.csv* ]] || die ".csv 파일은 --s-srs EPSG:xxxx 가 필요합니다"
  done
fi

for c in $(printf '%s\n' "${!GROUP_FILES[@]}" | LC_ALL=C sort); do
  mapfile -t group <<<"${GROUP_FILES[$c]}"
  if load_sido "$c" "${GROUP_VERSION[$c]}" "${group[@]}"; then
    OK_LIST+=("$c")
  else
    FAIL_LIST+=("$c")
    cleanup_tables
    log "이 시도는 교체하지 않았습니다(지난달 데이터 유지). 다음으로 넘어갑니다."
  fi
done

CUR=요약
log "성공/건너뜀: ${OK_LIST[*]:-없음}"
if [[ ${#FAIL_LIST[@]} -gt 0 ]]; then
  log "실패: ${FAIL_LIST[*]}  — 원인을 고친 뒤 같은 명령을 다시 실행하면 실패한 시도만 이어서 합니다"
  trap - ERR
  exit 1
fi
trap - ERR
