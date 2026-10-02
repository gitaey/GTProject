#!/usr/bin/env bash
# 지도 모듈 이식성 감사(최종판). 저장소 루트에서 실행한다.
#
#   bash .claude/skills/map-module-export/scripts/audit-portability.sh [--pkg [경로]] [--report]
#        [--app 경로] [--backend 경로] [--node-modules 경로] [--strict 번호,번호]
#
#   --pkg           패키지 src 경로(기본 frontend/packages/gis-map/src, 패키지 루트를 주면 src를 찾음). 인자 없이 실행해도 같다
#   --report        14번(백엔드 이식 비용 정보) 출력
#   --app           앱 소스(기본 frontend/src) — 11·12번
#   --backend       백엔드 패키지 루트(기본 backend/src/main/java/com/gtp) — 13·14번
#   --node-modules  ol·ol-wind가 설치된 node_modules(기본 frontend/node_modules) — 15번
#   --strict        경고 항목을 실패로 올린다(지금은 경고 항목이 없다. 아래 WARN_ITEMS)
#
# 검사 항목 1~15는 설계문서 "audit-portability.sh 개정안 (v2)" 표와 번호가 같다.
# 위반 1건 이상 exit 1, 경로 없음·옵션 오류 exit 2, 검사 도구(grep/awk) 자체 오류 exit 2. [경고]는 exit 코드에 영향이 없다.
# 옛 v1 모드(components/map·hooks/map·stores/map 세 폴더 검사)는 FE-7에서 없앴다 — 그 폴더가 다시 생기면 12번이 실패로 잡는다.
# 설계: .claude/design-docs/2026-09-23-map-module-restructure.md "audit-portability.sh 개정안 (v2)"

set -u

# "경고만" 하는 항목 번호(앞뒤 공백 필수, 예: " 8 13 "). 재개편 중 8·12·13이 여기 있다가 FE-5b-2/FE-5a/FE-7에서 모두 실패로 바뀌었다.
# 새 항목을 단계적으로 들일 때만 잠시 넣는다.
WARN_ITEMS=" "

usage() { sed -n '2,17p' "$0" | sed 's/^# \{0,1\}//'; }

PKG="frontend/packages/gis-map/src"
APP="frontend/src"
BACKEND="backend/src/main/java/com/gtp"
NODE_MODULES="frontend/node_modules"
REPORT=0
STRICT=""

# 값이 필요한 옵션: 값이 없거나 --로 시작하면(예: --strict --report) exit 2
need_value() {
    if [ "$2" -lt 2 ] || [ "${3#--}" != "$3" ]; then echo "$1 뒤에 값이 필요하다" >&2; exit 2; fi
}

while [ $# -gt 0 ]; do
    case "$1" in
        --pkg)
            if [ $# -gt 1 ] && [ "${2#--}" = "$2" ]; then PKG="$2"; shift; fi ;;
        --report) REPORT=1 ;;
        --app) need_value "$1" $# "${2-}"; APP="$2"; shift ;;
        --backend) need_value "$1" $# "${2-}"; BACKEND="$2"; shift ;;
        --node-modules) need_value "$1" $# "${2-}"; NODE_MODULES="$2"; shift ;;
        --strict)
            need_value "$1" $# "${2-}"
            [[ "$2" =~ ^[0-9]+(,[0-9]+)*$ ]] || { echo "--strict 값은 번호 목록이어야 한다(예: 6,13): $2" >&2; exit 2; }
            STRICT=" ${2//,/ } "; shift ;;
        -h|--help) usage; exit 0 ;;
        --*) echo "알 수 없는 옵션: $1" >&2; exit 2 ;;
        *) echo "인자 '$1'을 알 수 없다 — 옛 v1 모드(src 경로 인자)는 없어졌다. 패키지 경로는 --pkg <경로>로 준다" >&2; exit 2 ;;
    esac
    shift
done

PKG="${PKG%/}"; APP="${APP%/}"; BACKEND="${BACKEND%/}"; NODE_MODULES="${NODE_MODULES%/}"
if [ -d "$PKG/src" ] && [ ! -d "$PKG/core" ]; then PKG="$PKG/src"; fi
for d in "$PKG" "$APP" "$BACKEND"; do
    if [ ! -d "$d" ]; then echo "경로 없음: $d (저장소 루트에서 실행했는지 확인)" >&2; exit 2; fi
done
# 패키지 루트(vite.config.ts·dist가 있는 곳) — src의 부모
PKG_ROOT=$(dirname "$PKG")

MAP_DOMAINS="map mymap geoserver geotiff wind"
FAIL=0
WARN=0
SCRIPT_ERR=0


# 검사 도구(grep/awk) 자체가 실패하면 이 표시로 시작하는 줄을 내보낸다.
# report()는 이 줄을 보면 항목과 무관하게(경고 항목이라도) 스크립트 오류로 세고, 마지막에 exit 2로 끝낸다.
ERR_MARK="스크립트 오류:"
AWK_ERR="$ERR_MARK awk 실패 — 이 항목 결과를 믿을 수 없음"
ERRF=$(mktemp) || { echo "mktemp 실패" >&2; exit 2; }
trap 'rm -f "$ERRF"' EXIT

# 결과 출력: report <번호> <출력>. 경고 항목이면 [경고], 아니면 실패로 센다.
report() {
    local n="$1" out="$2"
    if [ -z "$out" ]; then echo "  없음"; return; fi
    if [[ $'\n'"$out" == *$'\n'"$ERR_MARK"* ]]; then
        echo "$out" | sed 's/^/  /'
        SCRIPT_ERR=1
        return
    fi
    if [[ "$WARN_ITEMS" == *" $n "* ]] && [[ "$STRICT" != *" $n "* ]]; then
        echo "$out" | sed 's/^/  [경고] /'
        WARN=$((WARN + $(echo "$out" | wc -l)))
    else
        echo "$out" | sed 's/^/  /'
        FAIL=1
    fi
}

# 줄 목록 합치기(빈 줄 제거)
join_out() { printf '%s\n' "$@" | sed '/^$/d'; }

mapfile -t PKG_FILES < <(find "$PKG" -type f \( -name '*.ts' -o -name '*.tsx' \) \
    ! -path '*/node_modules/*' ! -path '*/dist/*' ! -name 'vite.config.*' | sort)
mapfile -t APP_FILES < <(find "$APP" -type f \( -name '*.ts' -o -name '*.tsx' \) ! -path '*/node_modules/*' | sort)

# 패키지 안 파일 중 특정 계층만 고르기
pkg_files_under() {
    local f
    for f in "${PKG_FILES[@]}"; do
        case "${f#"$PKG"/}" in "$1"/*) echo "$f" ;; esac
    done
}
mapfile -t CORE_FILES < <(pkg_files_under core)
mapfile -t UIRB_FILES < <(pkg_files_under ui; pkg_files_under react)


# 한 항목에 실패 줄과 경고 줄이 같이 있을 때: report_mixed <번호> <실패 출력> <경고 출력>.
# 경고 줄은 --strict에 그 번호가 있으면 실패로 센다. 둘 다 비면 "없음".
report_mixed() {
    local n="$1" bad="$2" warn="$3"
    if [ -z "$bad" ] && [ -z "$warn" ]; then echo "  없음"; return; fi
    if [[ $'\n'"$bad"$'\n'"$warn" == *$'\n'"$ERR_MARK"* ]]; then
        printf '%s\n%s\n' "$bad" "$warn" | sed '/^$/d; s/^/  /'
        SCRIPT_ERR=1
        return
    fi
    if [ -n "$bad" ]; then echo "$bad" | sed 's/^/  /'; FAIL=1; fi
    if [ -n "$warn" ]; then
        if [[ "$STRICT" == *" $n "* ]]; then
            echo "$warn" | sed 's/^/  /'; FAIL=1
        else
            echo "$warn" | sed 's/^/  [경고] /'
            WARN=$((WARN + $(echo "$warn" | wc -l)))
        fi
    fi
}
# grep 종료 코드 확인: 0=찾음, 1=없음, 2 이상=grep 자체 오류(정규식 오류, 파일 못 읽음) → 오류 줄 출력
grep_rc() {
    if [ "$1" -ge 2 ]; then echo "$ERR_MARK grep 실패(rc=$1) — $(head -1 "$ERRF")"; fi
    return 0
}

# grep 래퍼: 파일 목록이 비면 아무것도 안 한다(빈 목록이면 grep이 stdin을 기다리므로).
g() {
    local pat="$1" rc; shift
    [ $# -eq 0 ] && return 0
    grep -nHE -- "$pat" "$@" 2>"$ERRF"; rc=$?
    grep_rc $rc
}

# 표준입력에서 패턴에 맞는 줄을 뺀다(grep -vE). 오류 표시 줄은 항상 통과시킨다.
gv() {
    local pat="$1" rc
    grep -vE -- "$pat" 2>"$ERRF"; rc=$?
    grep_rc $rc
}

# 폴더 재귀 grep(.java)
gr() {
    local pat="$1" rc; shift
    grep -rnHE --include='*.java' -- "$pat" "$@" 2>"$ERRF"; rc=$?
    grep_rc $rc
}

# import 추출: "파일:줄<TAB>원본계층<TAB>종류<TAB>지정자<TAB>대상"
#   종류 alias(@/) | self(@gtp/gis-map) | rel(상대) | bare(npm)
#   대상 rel → 대상 계층(core|wind|react|ui|adapters|styles|entry|other|ESCAPE), bare → 패키지 이름
AWK_IMPORTS='
function layer_of(p,   a, n) {
    n = split(p, a, "/")
    if (a[1] == "core") return (n >= 2 && a[2] == "wind") ? "wind" : "core"
    if (a[1] == "react" || a[1] == "ui" || a[1] == "adapters" || a[1] == "styles") return a[1]
    if (n == 1 && a[1] ~ /^standalone/) return "entry"
    return "other"
}
function norm(dir, spec,   parts, n, i, st, k, out, path) {
    path = (dir == "" ? spec : dir "/" spec)
    n = split(path, parts, "/"); k = 0
    for (i = 1; i <= n; i++) {
        if (parts[i] == "" || parts[i] == ".") continue
        if (parts[i] == "..") { if (k == 0) return "ESCAPE"; k--; continue }
        st[++k] = parts[i]
    }
    out = ""
    for (i = 1; i <= k; i++) out = out (i > 1 ? "/" : "") st[i]
    return out
}
FNR == 1 {
    rel = substr(FILENAME, length(pkg) + 2)
    dir = rel; if (!sub(/\/[^\/]*$/, "", dir)) dir = ""
    src = layer_of(rel)
}
{
    line = $0
    while (match(line, /(from|import|require)[ \t]*\(?[ \t]*["\047][^"\047]+["\047]/)) {
        pre = (RSTART > 1) ? substr(line, RSTART - 1, 1) : ""
        m = substr(line, RSTART, RLENGTH)
        line = substr(line, RSTART + RLENGTH)
        if (pre ~ /[A-Za-z0-9_$.]/) continue
        spec = m; sub(/^[^"\047]*["\047]/, "", spec); sub(/["\047]$/, "", spec)
        if (spec ~ /^@\//) { kind = "alias"; tgt = "-" }
        else if (spec ~ /^@gtp\/gis-map(\/|$)/) { kind = "self"; tgt = "-" }
        else if (spec ~ /^\./) {
            kind = "rel"; t = norm(dir, spec)
            tgt = (t == "ESCAPE") ? "ESCAPE" : layer_of(t)
        } else {
            kind = "bare"; split(spec, sp, "/")
            tgt = (spec ~ /^@/) ? sp[1] "/" sp[2] : sp[1]
        }
        printf "%s:%d\t%s\t%s\t%s\t%s\n", FILENAME, FNR, src, kind, spec, tgt
    }
}'

IMPORTS=""
if [ ${#PKG_FILES[@]} -gt 0 ]; then
    IMPORTS=$(awk -v pkg="$PKG" "$AWK_IMPORTS" "${PKG_FILES[@]}") || { echo "스크립트 오류: import 추출 awk 실패" >&2; exit 2; }
fi
# awk가 실패하면 결과를 믿을 수 없으므로 오류 줄(AWK_ERR)을 내보낸다 → report()가 스크립트 오류로 센다.
imp() { [ -n "$IMPORTS" ] || return 0; echo "$IMPORTS" | awk -F'\t' "$1" || echo "$AWK_ERR"; }

echo "감사 v2 — 패키지: $PKG (ts/tsx ${#PKG_FILES[@]}개) / 앱: $APP / 백엔드: $BACKEND"
echo "[1/15] 별칭 import (@/…, 자기 자신 @gtp/gis-map, 패키지 밖으로 나가는 상대 경로)"
report 1 "$(imp '$3 == "alias" || $3 == "self" || ($3 == "rel" && $5 == "ESCAPE") { print $1 "  " $4 }')"

echo "[2/15] 환경 변수 (process.env, import.meta.env)"
report 2 "$(g 'process\.env|import\.meta\.env' "${PKG_FILES[@]}")"

echo "[3/15] 호스트 경로 하드코딩 (localhost 전체 금지, 문자열 안의 /proxy·/api 경로는 adapters/ 밖 금지 — core/host.ts 기본값만 예외)"
# (a) '/proxy/…'·'/api/…'로 시작하는 문자열  (b) 문자열 중간·끝의 /proxy·/api(`${base}/api/x`, '/proxy' 단독) — QA FE-4a L1
# 예외: core/host.ts의 DEFAULT_HOST(proxyBaseUrl: '/proxy')는 호스트가 덮어쓰는 기본값이라 허용(설계 API 2절). import 줄과 주석 줄은 보지 않는다.
# 못 잡는 것: '/pro' + 'xy' 같은 문자열 조립, 변수에 나눠 담은 경로.
mapfile -t NON_ADAPTER_FILES < <(for f in "${PKG_FILES[@]}"; do case "${f#"$PKG"/}" in adapters/*|core/host.ts) ;; *) echo "$f" ;; esac; done)
report 3 "$(join_out "$(g 'localhost|127\.0\.0\.1' "${PKG_FILES[@]}")" \
                     "$(g "['\"\`]/(proxy|api)/" "${NON_ADAPTER_FILES[@]}")" \
                     "$(g "['\"\`][^'\"\`]*/(proxy|api)(/|['\"\`])" "${NON_ADAPTER_FILES[@]}" |
                         gv "^([A-Za-z]:)?[^:]*:[0-9]+:[[:space:]]*(import[[:space:]]|export[[:space:]].*[[:space:]]from[[:space:]]|//|/\*|\*)" |
                         gv "^([A-Za-z]:)?[^:]*:[0-9]+:.*['\"\`]/(proxy|api)/")")"

echo "[4/15] 계층 방향 (core↛react/ui/adapters·React 계열 npm, core↛core/wind, adapters↛react/ui, react↛ui, standalone↛React)"
report 4 "$(imp '
    function rx(p) { return p == "react" || p == "react-dom" || p == "lucide-react" || p == "zustand" }
    {
        bad = ""
        if ($2 == "core" || $2 == "wind") {
            if ($3 == "rel" && ($5 == "react" || $5 == "ui" || $5 == "adapters" || $5 == "entry")) bad = $2 " → " $5
            if ($3 == "bare" && rx($5)) bad = $2 " → " $5
            if ($2 == "core" && $3 == "rel" && $5 == "wind") bad = "core → core/wind (ol-wind가 core 진입점에 끌려옴)"
        } else if ($2 == "adapters") {
            if ($3 == "rel" && ($5 == "react" || $5 == "ui" || $5 == "entry")) bad = "adapters → " $5
            if ($3 == "bare" && rx($5)) bad = "adapters → " $5
        } else if ($2 == "react") {
            if ($3 == "rel" && ($5 == "ui" || $5 == "entry")) bad = "react → " $5
        } else if ($2 == "ui") {
            if ($3 == "rel" && $5 == "entry") bad = "ui → entry"
        } else if ($2 == "entry") {
            if ($3 == "rel" && ($5 == "react" || $5 == "ui")) bad = "standalone → " $5 " (UMD 엔트리는 React 없음)"
            if ($3 == "bare" && rx($5)) bad = "standalone → " $5 " (UMD 엔트리는 React 없음)"
        }
        if (bad != "") print $1 "  " $4 "  [" bad "]"
    }')"

echo "[5/15] npm 허용 목록 (core: ol·proj4 / core/wind: +ol-wind / react: +react / ui: +react·react-dom·lucide-react / adapters: 없음)"
report 5 "$(imp '
    $3 == "bare" {
        p = $5; ok = 0
        base = (p == "ol" || p == "proj4")
        if ($2 == "core" || $2 == "entry" || $2 == "other") ok = base
        else if ($2 == "wind") ok = base || p == "ol-wind"
        else if ($2 == "react") ok = base || p == "react"
        else if ($2 == "ui") ok = base || p == "react" || p == "react-dom" || p == "lucide-react"
        else if ($2 == "adapters") ok = 0
        if (!ok) print $1 "  " $4 "  [" $2 "에서 허용 안 됨]"
    }')"

echo "[6/15] 모듈 전역 가변 상태 (최상위 let/var, 최상위 new Map/Set/WeakMap/WeakSet, zustand식 '= create(', 얼리지 않은 최상위 [ ]/{ } 상수)"
# 6-a 최상위 let/var, new Map/Set…, create( 대입 → 실패.
# 6-b 최상위 `const X = [ … ]` / `{ … }` 중 Object.freeze(…)·as const·readonly/Readonly 타입·함수 호출 결과(`[…].map(…)` 등)가 아닌 것:
#     · 패키지 안에서 그 이름을 고치면(push/splice/sort…, X[i] = …, X.k = …, Object.assign(X, …), delete X.k) → 실패
#       (모듈 전역에 상태를 쌓는 것 = 한 페이지의 지도 2개가 서로 영향을 줌). export 안 한 것은 그 파일 안만, export한 것은 패키지 전체를 본다
#     · 공개 진입점(*/index.ts, standalone*.ts)에 그 이름이 나오면 → 실패(호스트가 고치면 모든 지도가 바뀜 — QA FE-4b L1 WIND_COLOR_STOPS)
#     · export만 하고(패키지 안 다른 파일이 씀) 공개되지 않으면 → 경고
#     · 모듈 안에서만 읽는 표(들여쓰기 폭·선택지 목록 등) → 통과. 전부 실패로 하면 오탐이 크다(FE-7 시점 9건 모두 읽기 전용 표).
#     못 잡는 것: 여러 줄에 걸친 타입 주석, 다른 이름에 담아서 고치기, 함수가 돌려준 같은 객체를 밖에서 고치기, 중첩 객체(freeze는 얕다).
AWK_LITERAL='
function close_of(pos,   depth, j, c, q) {
    depth = 0; j = pos
    while (j <= length(T)) {
        c = substr(T, j, 1)
        if (c == "\047" || c == "\"" || c == "`") {
            q = c; j++
            while (j <= length(T) && substr(T, j, 1) != q) { if (substr(T, j, 1) == "\\") j++; j++ }
            j++; continue
        }
        if (c == "[" || c == "{" || c == "(") depth++
        else if (c == "]" || c == "}" || c == ")") { depth--; if (depth == 0) return j }
        j++
    }
    return 0
}
function scanfile(   i, ln, start, line, tmp, name, rest, ann, col, pos, e, after, exported) {
    nnl = 0
    for (i = 1; i <= length(T); i++) if (substr(T, i, 1) == "\n") nl[++nnl] = i
    start = 1
    for (ln = 1; ln <= nnl; ln++) {
        line = substr(T, start, nl[ln] - start)
        if (line ~ /^(export[ \t]+)?const[ \t]+[A-Za-z_$][A-Za-z0-9_$]*/) {
            exported = (line ~ /^export/) ? 1 : 0
            tmp = line; sub(/^(export[ \t]+)?const[ \t]+/, "", tmp)
            match(tmp, /^[A-Za-z_$][A-Za-z0-9_$]*/); name = substr(tmp, 1, RLENGTH); rest = substr(tmp, RLENGTH + 1)
            if (match(rest, /=[ \t]*[\[{]/)) {
                ann = substr(rest, 1, RSTART - 1)
                if (ann !~ /[Rr]eadonly/) {
                    col = length(line) - length(rest) + RSTART + RLENGTH - 1
                    pos = start + col - 1
                    e = close_of(pos)
                    if (e > 0) {
                        after = substr(T, e + 1, 40); sub(/^[ \t\n]*/, "", after)
                        if (after !~ /^as[ \t]+const/ && after !~ /^(\.|\?\.|\(|\[)/) print FN ":" ln "\t" name "\t" exported
                    }
                }
            }
        }
        start = nl[ln] + 1
    }
}
FNR == 1 { if (NR > 1) scanfile(); T = ""; FN = FILENAME; delete nl }
{ T = T $0 "\n" }
END { if (NR > 0) scanfile() }'
LITERALS=""
if [ ${#PKG_FILES[@]} -gt 0 ]; then LITERALS=$(awk "$AWK_LITERAL" "${PKG_FILES[@]}") || LITERALS="$AWK_ERR"; fi
mapfile -t ENTRY_FILES < <(for f in "${PKG_FILES[@]}"; do case "${f#"$PKG"/}" in */index.ts|standalone*.ts) echo "$f" ;; esac; done)
bad6=""; warn6=""
if [[ "$LITERALS" == "$ERR_MARK"* ]]; then bad6="$LITERALS"
elif [ -n "$LITERALS" ]; then
    while IFS=$'\t' read -r loc name exported; do
        [ -n "$name" ] || continue
        file="${loc%:*}"
        re="${name//\$/\\\$}"
        if [ "$exported" = 1 ]; then scope=("${PKG_FILES[@]}"); else scope=("$file"); fi
        mut=$(join_out \
            "$(g "(^|[^A-Za-z0-9_\$.])$re(\.(push|pop|shift|unshift|splice|sort|reverse|fill|copyWithin|set|add|delete|clear)[[:space:]]*\(|(\[[^]]*\]|\.[A-Za-z_\$][A-Za-z0-9_\$]*)[[:space:]]*([-+*/%&|^]|\*\*|<<|>>>?|&&|\|\||\?\?)?=([^=]|\$))" "${scope[@]}")" \
            "$(g "Object\.(assign|defineProperty|defineProperties)\([[:space:]]*$re[[:space:]]*[,)]|delete[[:space:]]+$re[.[]" "${scope[@]}")" | head -1)
        pub=""
        for ef in "${ENTRY_FILES[@]}"; do
            [ "$ef" = "$file" ] && continue
            if grep -qE "(^|[^A-Za-z0-9_\$])$re([^A-Za-z0-9_\$]|\$)" "$ef"; then pub="$ef"; break; fi
        done
        if [[ "$mut" == "$ERR_MARK"* ]]; then bad6=$(join_out "$bad6" "$mut")
        elif [ -n "$mut" ]; then bad6=$(join_out "$bad6" "$loc  $name: 얼리지 않은 모듈 최상위 객체를 고친다 → $mut")
        elif [ -n "$pub" ]; then bad6=$(join_out "$bad6" "$loc  $name: 공개 진입점($pub)에 나오는데 얼리지 않았다 — Object.freeze(…)·as const·readonly 타입")
        elif [ "$exported" = 1 ]; then warn6=$(join_out "$warn6" "$loc  $name: export한 최상위 [ ]/{ } 상수가 얼려 있지 않다(as const 또는 Object.freeze 권장)")
        fi
    done <<< "$LITERALS"
fi
report_mixed 6 "$(join_out \
    "$(g '^(export[[:space:]]+)?(let|var)[[:space:]]' "${PKG_FILES[@]}")" \
    "$(g '^(export[[:space:]]+)?const[[:space:]].*=[[:space:]]*new[[:space:]]+(Map|Set|WeakMap|WeakSet)([^A-Za-z0-9_$]|$)' "${PKG_FILES[@]}")" \
    "$(g '=[[:space:]]*create[[:space:]]*(<.*>)?[[:space:]]*\(' "${PKG_FILES[@]}")" \
    "$bad6")" "$warn6"

echo "[7/15] 브라우저 전역 쓰기 (window/self/globalThis에 대입·Object.assign·defineProperty·Reflect.set, 'window as', globalThis, localStorage/sessionStorage는 react/usePersistentExpanded.ts만)"
# 허용 목록: src/standalone.ts, src/standalone-attach.ts — UMD 진입점은 전역 GisMap을 내보내는 것이 목적이라 7-a~7-c에서 뺀다.
#   지금은 두 파일 모두 전역 쓰기 0이다(전역 대입은 Vite UMD 래퍼가 한다). AMD 페이지에서도 전역을 만들어야 할 때(QA FE-6c Q3)처럼
#   진입점이 직접 전역을 다뤄야 하는 경우를 위한 자리다. 코어·어댑터·react·ui에서는 어떤 전역 쓰기도 안 된다.
# 못 잡는 것: 전역 객체를 다른 이름에 담아 쓰기(const w = window; w.x = 1), Function('return this')(), eval.
#   `self`는 창·Worker의 전역 이름이라 `self.x =`를 잡는다 — `const self = this` 같은 지역 변수는 오탐이 나므로 이름을 바꾼다.
mapfile -t NON_STORAGE_FILES < <(for f in "${PKG_FILES[@]}"; do [ "${f#"$PKG"/}" = "react/usePersistentExpanded.ts" ] || echo "$f"; done)
mapfile -t NON_ENTRY_FILES < <(for f in "${PKG_FILES[@]}"; do case "${f#"$PKG"/}" in standalone.ts|standalone-attach.ts) ;; *) echo "$f" ;; esac; done)
GLOBAL_OBJ='(window|self|globalThis)'
report 7 "$(join_out \
    "$(g "(^|[^A-Za-z0-9_\$.])$GLOBAL_OBJ[[:space:]]*(\.[A-Za-z_\$][A-Za-z0-9_\$]*|\[[^]]*\])+[[:space:]]*([-+*/%&|^]|\*\*|<<|>>>?|&&|\|\||\?\?)?=([^=]|\$)" "${NON_ENTRY_FILES[@]}")" \
    "$(g "(Object\.(assign|defineProperty|defineProperties|setPrototypeOf)|Reflect\.(set|defineProperty|deleteProperty))\([[:space:]]*$GLOBAL_OBJ([^A-Za-z0-9_\$]|\$)" "${NON_ENTRY_FILES[@]}")" \
    "$(g '(^|[^A-Za-z0-9_$.])(window|self)[[:space:]]+as[[:space:]]|globalThis' "${NON_ENTRY_FILES[@]}")" \
    "$(g '(local|session)Storage' "${NON_STORAGE_FILES[@]}")")"

echo "[8/15] Tailwind (ui/react의 className·cx() 문자열 토큰은 전부 gm-로 시작, className 템플릿 문자열 금지)"
# FE-5b-2에서 패키지 Tailwind가 0이 돼 실패 처리다(옛 경고 단계 끝).
# 한계: className과 cx(…) 안의 문자열만 본다. 인라인 style={{ … }}의 고정값(색·크기 리터럴)은 세지 않는다 — 인라인 style은
#   동적 값(위치·색)용으로 허용돼 있고(설계 프론트 5절), 고정값을 CSS로 옮길지는 리뷰에서 본다(QA FE-5b-2 Q1).
#   변수에 담아 둔 클래스 문자열(const c = 'p-2'; className={c})도 못 잡는다.
# 파일 전체를 한 문자열로 읽어 className=… / cx(…) 식 안의 문자열 리터럴을 모은다(여러 줄 식 포함).
# 비교 연산(=== 'x', 'x' !==)의 피연산자 문자열은 클래스가 아니므로 건너뛴다.
AWK_CLASS='
function lineof(pos,   i, n) { n = 1; for (i = 1; i <= nnl; i++) { if (nl[i] < pos) n++; else break } return n }
function flag(pos, msg,   key) {
    key = FN ":" lineof(pos) ":" msg
    if (!(key in seen)) { seen[key] = 1; print FN ":" lineof(pos) ":  " msg }
}
function prevtok(pos,   j) {
    j = pos - 1
    while (j > 0 && substr(T, j, 1) ~ /[ \t\n]/) j--
    return substr(T, (j >= 2 ? j - 1 : 1), 2)
}
function nexttok(pos,   j) {
    j = pos + 1
    while (j <= length(T) && substr(T, j, 1) ~ /[ \t\n]/) j++
    return substr(T, j, 2)
}
function checkstr(start, stop, s,   pt, nt, toks, n, i) {
    pt = prevtok(start); nt = nexttok(stop)
    if (pt ~ /[=!]=$/ || nt ~ /^[=!]=/) return
    n = split(s, toks, /[ \t\n]+/)
    for (i = 1; i <= n; i++) if (toks[i] != "" && toks[i] !~ /^gm-/) flag(start, "gm- 접두사 아님: \047" toks[i] "\047")
}
function readstr(pos,   q, j, c, s) {
    q = substr(T, pos, 1); j = pos + 1; s = ""
    while (j <= length(T)) {
        c = substr(T, j, 1)
        if (c == "\\") { s = s substr(T, j + 1, 1); j += 2; continue }
        if (c == q) break
        s = s c; j++
    }
    STR = s
    return j
}
function scanexpr(pos, op, cl,   depth, j, c, e) {
    depth = 0; j = pos
    while (j <= length(T)) {
        c = substr(T, j, 1)
        if (c == "\047" || c == "\"") { e = readstr(j); checkstr(j, e, STR); j = e + 1; continue }
        if (c == "`") { flag(j, "className 템플릿 문자열 금지"); e = readstr(j); j = e + 1; continue }
        if (c == op) depth++
        else if (c == cl) { depth--; if (depth == 0) return j }
        j++
    }
    return j
}
function scanfile(   p, j, c, e, off) {
    nnl = 0
    for (j = 1; j <= length(T); j++) if (substr(T, j, 1) == "\n") nl[++nnl] = j
    off = 0
    while ((p = index(substr(T, off + 1), "className")) > 0) {
        p += off; off = p + 8
        j = p + 9
        while (substr(T, j, 1) ~ /[ \t\n]/) j++
        if (substr(T, j, 1) != "=" || substr(T, j + 1, 1) == "=") continue
        j++
        while (substr(T, j, 1) ~ /[ \t\n]/) j++
        c = substr(T, j, 1)
        if (c == "\047" || c == "\"") { e = readstr(j); checkstr(j, e, STR) }
        else if (c == "`") flag(j, "className 템플릿 문자열 금지")
        else if (c == "{") scanexpr(j, "{", "}")
    }
    off = 0
    while ((p = index(substr(T, off + 1), "cx(")) > 0) {
        p += off; off = p + 2
        if (p > 1 && substr(T, p - 1, 1) ~ /[A-Za-z0-9_$.]/) continue
        scanexpr(p + 2, "(", ")")
    }
}
FNR == 1 { if (NR > 1) scanfile(); T = ""; FN = FILENAME; delete nl }
{ T = T $0 "\n" }
END { if (NR > 0) scanfile() }'
out8=""
if [ ${#UIRB_FILES[@]} -gt 0 ]; then out8=$(awk "$AWK_CLASS" "${UIRB_FILES[@]}") || { echo "스크립트 오류: 8번 awk 실패" >&2; exit 2; }; fi
report 8 "$out8"

echo "[9/15] 코어의 React 전용 API (core에서 createRoot, 'use client', .tsx 파일)"
report 9 "$(join_out \
    "$(for f in "${CORE_FILES[@]}"; do case "$f" in *.tsx) echo "$f:  .tsx 파일" ;; esac; done)" \
    "$(g "createRoot|['\"]use client['\"]" "${CORE_FILES[@]}")")"

echo "[10/15] 좌표계 하드코딩 (core의 'EPSG:3857'은 core/config.ts·core/projection.ts만)"
mapfile -t CORE_NO_CFG < <(for f in "${CORE_FILES[@]}"; do case "${f#"$PKG"/}" in core/config.ts|core/projection.ts) ;; *) echo "$f" ;; esac; done)
report 10 "$(g "['\"\`]EPSG:3857['\"\`]" "${CORE_NO_CFG[@]}")"

echo "[11/15] 앱의 깊은 import (@gtp/gis-map/…는 공개 진입점 6개만, packages/gis-map 상대 경로 import 금지)"
report 11 "$(join_out \
    "$(g "['\"]@gtp/gis-map[^'\"]*['\"]" "${APP_FILES[@]}" | gv "['\"]@gtp/gis-map/(core|core/wind|react|ui|adapters/rest|adapters/proxy)['\"]")" \
    "$(g "(from|import|require)[[:space:]]*\(?[[:space:]]*['\"][^'\"]*packages/gis-map" "${APP_FILES[@]}")")"

echo "[12/15] 옛 폴더 잔존 (frontend/src의 components/map·hooks/map·stores/map — FE-5a에서 삭제됨, 다시 생기면 실패)"
report 12 "$(for d in components/map hooks/map stores/map; do
    [ -d "$APP/$d" ] && echo "$APP/$d  (파일 $(find "$APP/$d" -type f | wc -l | tr -d ' ')개)"
done)"

echo "[13/15] 백엔드 도메인 독립 (지도 5개 도메인 → 다른 com.gtp.domain.* 참조 금지, 지도 도메인끼리도 금지, 공통은 global/gis — BK-1 뒤 실패 처리)"
report 13 "$(for d in $MAP_DOMAINS; do
    [ -d "$BACKEND/domain/$d" ] || continue
    gr 'com\.gtp\.domain\.' "$BACKEND/domain/$d" |
        awk -v own="$d" -v mark="$ERR_MARK" '
        index($0, mark) == 1 { print; next }
        {
            s = $0
            while (match(s, /com\.gtp\.domain\.[A-Za-z_]+/)) {
                x = substr(s, RSTART + 15, RLENGTH - 15); s = substr(s, RSTART + RLENGTH)
                if (x != own) { print $0; break }
            }
        }' || echo "$AWK_ERR"
done)"

if [ "$REPORT" -eq 1 ]; then
    echo "[14/15] (정보) 백엔드 지도 도메인 이식 비용 — JDK 11/javax 기준, 실패 아님"
    BD=()
    for d in $MAP_DOMAINS; do [ -d "$BACKEND/domain/$d" ] && BD+=("$BACKEND/domain/$d"); done
    cnt() {
        local o rc
        [ ${#BD[@]} -eq 0 ] && { echo 0; return; }
        o=$(grep -rhoE --include='*.java' -- "$1" "${BD[@]}" 2>"$ERRF"); rc=$?
        if [ $rc -ge 2 ]; then echo "$ERR_MARK grep 실패(rc=$rc) — $(head -1 "$ERRF")"; return; fi
        [ -z "$o" ] && { echo 0; return; }
        echo "$o" | wc -l | tr -d ' '
    }
    # row는 서브셸 밖에서 불러야 SCRIPT_ERR가 바깥에 남는다
    row() {
        local v; v=$(cnt "$2")
        [[ "$v" == "$ERR_MARK"* ]] && SCRIPT_ERR=1
        printf '  %-34s %s\n' "$1" "$v"
    }
    row "jakarta.* import" '^import jakarta\.'
    row "record (Java 16)" '(^|[[:space:]])record[[:space:]]+[A-Z][A-Za-z0-9_]*[[:space:]]*[(<]'
    row "텍스트 블록 \"\"\" (Java 15, 여닫기 합)" '"""'
    row "switch 식/화살표 case/yield (14)" '(case[^:]*->|=[[:space:]]*switch[[:space:]]*\(|return[[:space:]]+switch[[:space:]]*\(|[[:space:]]yield[[:space:]])'
    row ".toList() (Java 16)" '\.toList\(\)'
else
    echo "[14/15] (정보) 백엔드 이식 비용 — --report로 출력"
fi

echo "[15/15] ol 사용 경로 (attach 번들이 읽는 ol/* 값 import ↔ REQUIRED_OL_API ↔ vite 전역 매핑 규칙 ↔ 설치된 ol full build, dist가 있으면 번들도)"
# attach 번들((b) gis-map.attach.umd.js)은 ol을 싣지 않고 `import X from 'ol/a/B'` → 전역 `ol.a.B`, `import { f } from 'ol/a'` → `ol.a.f`로 읽는다
# (vite.config.ts olGlobalsPlugin). checkOl()은 core/olCompat.ts의 REQUIRED_OL_API만 검사하므로, 이 목록이 실제로 읽는 경로와 어긋나면
# checkOl은 통과하는데 붙인 뒤 도구가 죽는다(QA FE-6c Q01: 전역 경로 하나 오타 → tsc·감사·checkOl 모두 통과). 그래서 네 가지를 대조한다.
#   15-a 소스: attach 번들에 들어가는 파일(core/**, adapters/**, standalone-attach.ts)과 ol-wind ESM의 ol 값 import → 전역 경로 집합.
#        그 집합 ⊆ REQUIRED ∪ OPTIONAL ∪ 예외, REQUIRED ⊆ 그 집합. `import type`이 아닌데 타입만 있는 이름을 값으로 import하면
#        REQUIRED에 없는 경로로 나와 여기서 걸린다(타입은 import type). 네임스페이스·동적·CSS import도 실패.
#        예외: View — createGisMap(엔진이 지도를 만드는 (a)/React 경로) 전용이라 attach 번들에서는 트리 셰이킹으로 빠진다(QA FE-6c 2절).
#              standalone-attach.ts의 `import * as olGlobal from 'ol'` — 전역 ol 전체를 checkOl에 넘기는 자리.
#   15-b vite.config.ts: 전역 매핑이 "ol/a/b → a.b" 한 줄 규칙 그대로인지(경로별 예외·오타가 없는지), 바깥 모듈이 'ol' 하나인지.
#        감사가 아는 문장 그대로를 찾는다 — 빌드 설정을 바꿨다면 이 검사도 같이 고친다.
#   15-c 설치된 ol(--node-modules)의 dist/ol.d.ts(full build 네임스페이스)에 REQUIRED 경로가 있는지. 없으면 기본 내보내기가 있는
#        모듈의 이름 내보내기 = 그 클래스의 정적 속성(ol.interaction.Draw.createBox) 규칙으로 ESM 파일에서 확인한다.
#   15-d dist/gis-map.attach.umd.js가 있고 소스보다 새것이면: 번들의 olPath("…")·olMember(…,"…","…") 호출(압축된 이름은 모양으로 찾음)이
#        읽는 경로 = REQUIRED, 바깥 모듈 require("ol/…") 0. dist가 없으면 15-a~c(소스)만 하고 그렇다고 적는다. 소스보다 오래된 dist는 경고 후 대조 생략.
# 못 잡는 것: 메서드·옵션 존재(View#animate 등 — 버전 호환 표로 확인), ol-wind가 아닌 다른 서드파티의 ol import(지금 없음), 런타임 동작.
OLCOMPAT="$PKG/core/olCompat.ts"
VITE_CFG="$PKG_ROOT/vite.config.ts"
ATTACH_BUNDLE="$PKG_ROOT/dist/gis-map.attach.umd.js"
OL_DIR="$NODE_MODULES/ol"
OLWIND_ESM="$NODE_MODULES/ol-wind/dist/ol-wind.esm.js"
OL15_EXEMPT=" View "
bad15=""; warn15=""

# REQUIRED_OL_API / OPTIONAL_OL_API 문자열 목록 읽기(주석 제외)
AWK_OLLIST='
$0 ~ ("export const " name "[^=]*=") { on = 1 }
on {
    s = $0; sub(/\/\/.*/, "", s)
    while (match(s, /\047[^\047]+\047/)) { print substr(s, RSTART + 1, RLENGTH - 2); s = substr(s, RSTART + RLENGTH) }
    if ($0 ~ /\]\)/) exit
}'
# ol 값 import 추출: USE<TAB>전역경로<TAB>파일:줄 / NS·SIDE·DYN<TAB>지정자<TAB>파일:줄. 주석 줄은 빈 줄로 바꿔 줄 번호를 지킨다
AWK_OLIMP='
function lineof(pos,   i, n) { n = 1; for (i = 1; i <= nnl; i++) { if (nl[i] < pos) n++; else break } return n }
function trim(x) { gsub(/^[ \t\n]+|[ \t\n]+$/, "", x); return x }
function emit(p, ln) { print "USE\t" p "\t" FN ":" ln }
function handle(clause, spec, ln,   base, named, dflt, items, n, i, it, k) {
    gsub(/[\n\t]+/, " ", clause); clause = trim(clause)
    if (clause ~ /^type[ {]/) return
    base = spec; sub(/^ol\/?/, "", base); gsub(/\//, ".", base)
    named = ""; dflt = clause
    k = index(clause, "{")
    if (k > 0) { named = substr(clause, k + 1); sub(/}.*/, "", named); dflt = substr(clause, 1, k - 1) }
    gsub(/[ ,]/, "", dflt)
    if (dflt ~ /\*as/ || (dflt != "" && base == "")) { print "NS\t" spec "\t" FN ":" ln; dflt = "" }
    if (dflt != "") emit(base, ln)
    n = split(named, items, ",")
    for (i = 1; i <= n; i++) {
        it = trim(items[i])
        if (it == "" || it ~ /^type[ ]/) continue
        sub(/[ ]+as[ ]+.*/, "", it)
        if (it == "default") { if (base == "") print "NS\t" spec "\t" FN ":" ln; else emit(base, ln) }
        else emit(base == "" ? it : base "." it, ln)
    }
}
function scanfile(   s, off, m, pos, clause, spec) {
    nnl = 0
    for (i = 1; i <= length(T); i++) if (substr(T, i, 1) == "\n") nl[++nnl] = i
    s = T; off = 0
    while (match(s, /\n[ \t]*(import|export)[ \t\n]+[^;\047"`=()]*from[ \t\n]*[\047"]ol(\/[^\047"]*)?[\047"]/)) {
        m = substr(s, RSTART + 1, RLENGTH - 1); pos = off + RSTART + 1
        s = substr(s, RSTART + RLENGTH); off += RSTART + RLENGTH - 1
        sub(/^[ \t]*/, "", m)
        clause = m; sub(/^(import|export)[ \t\n]+/, "", clause)
        spec = clause; sub(/.*from[ \t\n]*[\047"]/, "", spec); sub(/[\047"]$/, "", spec)
        sub(/[ \t\n]*from[ \t\n]*[\047"][^\047"]*[\047"]$/, "", clause)
        handle(clause, spec, lineof(pos))
    }
    s = T; off = 0
    while (match(s, /\n[ \t]*import[ \t]*[\047"]ol\/[^\047"]*[\047"]/)) {
        m = substr(s, RSTART + 1, RLENGTH - 1); pos = off + RSTART + 1
        s = substr(s, RSTART + RLENGTH); off += RSTART + RLENGTH - 1
        sub(/^[ \t]*import[ \t]*[\047"]/, "", m); sub(/[\047"]$/, "", m)
        print "SIDE\t" m "\t" FN ":" lineof(pos)
    }
    s = T; off = 0
    while (match(s, /import[ \t]*\([ \t\n]*[\047"]ol[\047"\/]/)) {
        pos = off + RSTART
        s = substr(s, RSTART + RLENGTH); off += RSTART + RLENGTH - 1
        print "DYN\tol\t" FN ":" lineof(pos)
    }
}
FNR == 1 { if (NR > 1) scanfile(); T = "\n"; FN = FILENAME; delete nl }
{ if ($0 ~ /^[ \t]*(\/\/|\/\*|\*)/) T = T "\n"; else T = T $0 "\n" }
END { if (NR > 0) scanfile() }'
# ol.d.ts → full build 네임스페이스 경로 목록(namespace 블록 + export { X as Y })
AWK_OLDTS='
function jp(k,   i, s) { s = ""; for (i = 1; i <= k; i++) s = (i == 1 ? st[i] : s "." st[i]); return s }
/^declare namespace ol \{/ { inol = 1; d = 0; next }
!inol { next }
/^[ \t]*(export[ \t]+)?namespace[ \t]+[A-Za-z_$][A-Za-z0-9_$]*[ \t]*\{/ {
    x = $0; sub(/^[ \t]*(export[ \t]+)?namespace[ \t]+/, "", x); sub(/[ \t]*\{.*/, "", x); st[++d] = x; print jp(d); next
}
/^[ \t]*export[ \t]*\{.* as [A-Za-z_$][A-Za-z0-9_$]*[ \t]*\};/ {
    x = $0; sub(/.* as /, "", x); sub(/[ \t]*\};.*/, "", x); p = jp(d); print (p == "" ? x : p "." x); next
}
/^[ \t]*\}/ { if (d == 0) inol = 0; else d--; next }'
# 번들의 olPath/olMember 호출(압축 이름) → PATH<TAB>경로 / MEMBER<TAB>경로.이름 / BASE<TAB>경로
AWK_BUNDLE='
function esc(x) { gsub(/\$/, "\\$", x); return x }
{ T = T $0 "\n" }
END {
    s = T
    while (match(s, /[A-Za-z_$][A-Za-z0-9_$]*\([A-Za-z_$][A-Za-z0-9_$]*,"[A-Za-z0-9_.]+","[A-Za-z0-9_$]+"\)/)) {
        m = substr(s, RSTART, RLENGTH); s = substr(s, RSTART + RLENGTH)
        f = m; sub(/\(.*/, "", f)
        rest = m; sub(/^[^(]*\(/, "", rest); b = rest; sub(/,.*/, "", b)
        split(rest, q, "\"")
        k = ++mc[f]; mpath[f, k] = q[2]; mname[f, k] = q[4]; mbase[f, k] = b
    }
    best = ""; for (f in mc) if (best == "" || mc[f] > mc[best]) best = f
    if (best == "") { print "NOMEMBER"; exit }
    b = mbase[best, 1]
    if (!match(T, "(^|[^A-Za-z0-9_$])" esc(b) "=[A-Za-z_$][A-Za-z0-9_$]*\\(\"")) { print "NOPATHFN"; exit }
    g = substr(T, RSTART, RLENGTH); sub(/^[^=]*=/, "", g); sub(/\("$/, "", g)
    for (k = 1; k <= mc[best]; k++) { print "MEMBER\t" mpath[best, k] "." mname[best, k]; print "BASE\t" mpath[best, k] }
    # olPath는 늘 `변수=olPath("경로")` 꼴로 불린다(가상 모듈의 const base = olPath(…)). 같은 짧은 이름을 다른 스코프가 쓰는 오탐을 줄이려고 그 꼴만 센다
    s = T; re = "(^|[^A-Za-z0-9_$.])[A-Za-z_$][A-Za-z0-9_$]*=" esc(g) "\\(\"[A-Za-z0-9_.]*\"\\)"
    while (match(s, re)) {
        m = substr(s, RSTART, RLENGTH); s = substr(s, RSTART + RLENGTH)
        split(m, q, "\""); print "PATH\t" q[2]
    }
}'

if [ ! -f "$OLCOMPAT" ]; then
    bad15="$OLCOMPAT 없음 — REQUIRED_OL_API를 읽을 수 없다"
else
    REQ=$(awk -v name=REQUIRED_OL_API "$AWK_OLLIST" "$OLCOMPAT") || REQ="$AWK_ERR"
    OPT=$(awk -v name=OPTIONAL_OL_API "$AWK_OLLIST" "$OLCOMPAT") || OPT="$AWK_ERR"
    if [[ "$REQ$OPT" == *"$ERR_MARK"* ]]; then bad15="$AWK_ERR"
    elif [ -z "$REQ" ]; then bad15="$OLCOMPAT  REQUIRED_OL_API 목록을 읽지 못했다(선언 모양이 바뀌었으면 15번 AWK_OLLIST를 고친다)"
    else
        # 15-a 소스
        mapfile -t ATTACH_SRC < <(pkg_files_under core; pkg_files_under adapters; [ -f "$PKG/standalone-attach.ts" ] && echo "$PKG/standalone-attach.ts")
        OLW=()
        if [ -f "$OLWIND_ESM" ]; then OLW=("$OLWIND_ESM")
        else warn15=$(join_out "$warn15" "$OLWIND_ESM 없음 — ol-wind가 읽는 ol 경로는 대조하지 못했다(--node-modules로 위치를 준다)"); fi
        USES=""
        if [ ${#ATTACH_SRC[@]} -gt 0 ]; then USES=$(awk "$AWK_OLIMP" "${ATTACH_SRC[@]}" "${OLW[@]}") || USES="$AWK_ERR"; fi
        if [[ "$USES" == "$ERR_MARK"* ]]; then bad15="$USES"
        else
            CMP=$(printf '%s\n' "$USES" | awk -F'\t' -v req="$REQ" -v opt="$OPT" -v exempt="$OL15_EXEMPT" -v olw="${#OLW[@]}" \
                -v entry="$PKG/standalone-attach.ts" '
                BEGIN {
                    n = split(req, a, "\n"); for (i = 1; i <= n; i++) if (a[i] != "") R[a[i]] = 1
                    n = split(opt, a, "\n"); for (i = 1; i <= n; i++) if (a[i] != "") O[a[i]] = 1
                }
                $1 == "USE" {
                    U[$2] = 1
                    if (!($2 in R) && !($2 in O) && index(exempt, " " $2 " ") == 0)
                        print "BAD\t" $3 "  ol 경로 " $2 ": REQUIRED_OL_API에 없다 — 새 API면 core/olCompat.ts 목록에 넣고, 타입이면 import type으로"
                }
                $1 == "NS" { if (!($2 == "ol" && index($3, entry ":") == 1)) print "BAD\t" $3 "  " $2 ": 네임스페이스/기본 import는 어떤 경로를 쓰는지 대조할 수 없다(이름을 골라 import)" }
                $1 == "SIDE" { print "BAD\t" $3 "  import \047" $2 "\047: attach 번들에 들어가는 파일은 ol CSS·부수효과 import를 하지 않는다(호스트의 ol.css를 쓴다)" }
                $1 == "DYN" { print "BAD\t" $3 "  동적 import(\047ol…\047)는 대조할 수 없다" }
                END {
                    for (k in R) if (!(k in U))
                        print (olw > 0 ? "BAD" : "WARN") "\tcore/olCompat.ts  REQUIRED_OL_API의 " k ": 이 경로를 쓰는 값 import가 없다(목록에서 빼거나 import 경로를 확인)"
                }' | sort) || CMP="BAD	$AWK_ERR"
            bad15=$(join_out "$bad15" "$(printf '%s\n' "$CMP" | sed -n 's/^BAD	//p')")
            warn15=$(join_out "$warn15" "$(printf '%s\n' "$CMP" | sed -n 's/^WARN	//p')")
            NUSE=$(printf '%s\n' "$USES" | awk -F'\t' '$1 == "USE" { u[$2] = 1 } END { n = 0; for (k in u) n++; print n }')
            echo "  (소스: attach 번들 파일 ${#ATTACH_SRC[@]}개 + ol-wind ${#OLW[@]}개의 ol 값 import → 전역 경로 ${NUSE}개 / REQUIRED $(echo "$REQ" | wc -l | tr -d ' ')개)"
        fi

        # 15-b vite.config.ts 전역 매핑 규칙
        if [ -f "$VITE_CFG" ]; then
            CANON="const globalPath = spec.slice(3).split('/').join('.')"
            n_canon=$(grep -cF -- "$CANON" "$VITE_CFG"); n_all=$(grep -cE 'const[[:space:]]+globalPath[[:space:]]*=' "$VITE_CFG")
            if [ "$n_canon" -ne 1 ] || [ "$n_all" -ne 1 ]; then
                bad15=$(join_out "$bad15" "$VITE_CFG  전역 매핑이 'ol/a/b → a.b' 한 줄 규칙이 아니다(경로별 예외·오타 금지): $(grep -nE 'const[[:space:]]+globalPath[[:space:]]*=' "$VITE_CFG" | head -2 | tr '\n' ' ')")
            fi
            for need in "if (source === 'ol') return { id: 'ol', external: true }" \
                        "if (!source.startsWith('ol/')) return null" \
                        "'const base = olPath(' + JSON.stringify(globalPath) + ')'" \
                        "olMember(base, ' + JSON.stringify(globalPath)" \
                        "globals: { ol: 'ol' }"; do
                grep -qF -- "$need" "$VITE_CFG" || bad15=$(join_out "$bad15" "$VITE_CFG  attach 전역 매핑 규칙에서 \"$need\"를 찾지 못했다(빌드 설정을 바꿨다면 감사 15-b도 함께 고친다)")
            done
        else
            warn15=$(join_out "$warn15" "$VITE_CFG 없음 — 전역 매핑 규칙 대조 생략(빌드 설정 없이 소스만 복사한 경우)")
        fi

        # 15-c 설치된 ol full build
        OL_DTS="$OL_DIR/dist/ol.d.ts"
        if [ -f "$OL_DTS" ]; then
            OLVER=$(sed -n 's/^[[:space:]]*"version":[[:space:]]*"\([^"]*\)".*/\1/p' "$OL_DIR/package.json" 2>/dev/null | head -1)
            NSP=$(awk "$AWK_OLDTS" "$OL_DTS") || NSP="$AWK_ERR"
            if [[ "$NSP" == "$ERR_MARK"* ]] || [ -z "$NSP" ]; then
                bad15=$(join_out "$bad15" "$ERR_MARK $OL_DTS에서 네임스페이스를 읽지 못했다")
            else
                while IFS= read -r r; do
                    [ -n "$r" ] || continue
                    grep -qxF -- "$r" <<< "$NSP" && continue
                    prefix="${r%.*}"; last="${r##*.}"; esm="$OL_DIR/${prefix//.//}.js"
                    if [ "$prefix" != "$r" ] && grep -qxF -- "$prefix" <<< "$NSP" && [ -f "$esm" ] &&
                       grep -qE "^export (function|const|let|class) $last([^A-Za-z0-9_\$]|\$)|^export \{[^}]*([^A-Za-z0-9_\$]|^)$last([^A-Za-z0-9_\$]|\$)" "$esm"; then
                        continue
                    fi
                    bad15=$(join_out "$bad15" "$OLCOMPAT  $r: 설치된 ol ${OLVER:-?}의 full build(ol.d.ts 네임스페이스·정적 속성 규칙)에 없다 — 공개되지 않은 내부 모듈은 쓰지 않는다")
                done <<< "$(printf '%s\n%s\n' "$REQ" "$OPT")"
            fi
        else
            warn15=$(join_out "$warn15" "$OL_DTS 없음 — full build 대조 생략(--node-modules로 ol 위치를 준다)")
        fi

        # 15-d 빌드 산출물
        if [ ! -f "$ATTACH_BUNDLE" ]; then
            echo "  (dist 없음: $ATTACH_BUNDLE — 번들 대조 없이 소스(15-a~c)만 검사했다)"
        else
            newer=$(find "$PKG" "$VITE_CFG" -type f -newer "$ATTACH_BUNDLE" 2>/dev/null | head -1)
            if [ -n "$newer" ]; then
                warn15=$(join_out "$warn15" "$ATTACH_BUNDLE이 소스보다 오래됐다($newer) — 번들 대조 생략, npm run build:gis-umd 뒤 다시 실행")
            else
                BUN=$(awk "$AWK_BUNDLE" "$ATTACH_BUNDLE") || BUN="$AWK_ERR"
                if [[ "$BUN" == "$ERR_MARK"* ]]; then bad15=$(join_out "$bad15" "$BUN")
                elif [ "$BUN" = NOMEMBER ] || [ "$BUN" = NOPATHFN ]; then
                    bad15=$(join_out "$bad15" "$ATTACH_BUNDLE  olPath/olMember 호출 모양을 찾지 못했다($BUN) — 전역 매핑 방식이 바뀌었으면 15-d를 고친다")
                else
                    CMPB=$(printf '%s\n' "$BUN" | awk -F'\t' -v req="$REQ" -v opt="$OPT" -v f="$ATTACH_BUNDLE" '
                        BEGIN {
                            n = split(req, a, "\n"); for (i = 1; i <= n; i++) if (a[i] != "") R[a[i]] = 1
                            n = split(opt, a, "\n"); for (i = 1; i <= n; i++) if (a[i] != "") O[a[i]] = 1
                        }
                        { L[NR] = $0; if ($1 == "BASE") B[$2] = 1 }
                        END {
                            for (i = 1; i <= NR; i++) {
                                split(L[i], c, "\t")
                                if (c[1] == "MEMBER") { use[c[2]] = 1; nm++; if (!(c[2] in R) && !(c[2] in O)) print f "  번들이 읽는 ol." c[2] ": REQUIRED_OL_API에 없다" }
                                if (c[1] == "PATH") { np++; if (c[2] in R) use[c[2]] = 1; else if (!(c[2] in B)) print f "  번들 olPath(\"" c[2] "\"): REQUIRED_OL_API에 없다(전역 경로 오타?)" }
                            }
                            for (k in R) if (!(k in use)) print f "  REQUIRED_OL_API의 " k ": 번들이 읽지 않는다"
                            nu = 0; for (k in use) nu++
                            print "INFO\t" np "\t" nm "\t" nu
                        }' | sort)
                    info=$(printf '%s\n' "$CMPB" | sed -n 's/^INFO	//p' | tr '\t' ' ')
                    bad15=$(join_out "$bad15" "$(printf '%s\n' "$CMPB" | grep -v '^INFO	')")
                    nreq=$(grep -c 'require("ol/' "$ATTACH_BUNDLE")
                    [ "$nreq" -gt 0 ] && bad15=$(join_out "$bad15" "$ATTACH_BUNDLE  바깥 모듈 require(\"ol/…\") ${nreq}개 — 바깥 모듈은 'ol' 하나여야 한다(ol/*마다 두면 로드 순간 경로를 읽어 checkOl 전에 멈춘다)")
                    read -r np nm nu <<< "$info"
                    echo "  (번들: olPath ${np:-?}개 · olMember ${nm:-?}개 → 읽는 API ${nu:-?}개 / REQUIRED $(echo "$REQ" | wc -l | tr -d ' ')개)"
                fi
            fi
        fi
    fi
fi
report_mixed 15 "$bad15" "$warn15"

if [ "$SCRIPT_ERR" -ne 0 ]; then
    echo "결과: 스크립트 오류 — 검사 도구(grep/awk)가 실패해 결과를 믿을 수 없다 (위 '$ERR_MARK' 줄 참고)"
    exit 2
fi
if [ "$FAIL" -ne 0 ]; then
    echo "결과: 위반 있음 (경고 ${WARN}건 별도) — 계약은 .claude/rules/map.md, 항목 설명은 이 스크립트 주석과 설계문서 개정안 v2"
    exit 1
fi
echo "결과: 통과 (경고 ${WARN}건)"
