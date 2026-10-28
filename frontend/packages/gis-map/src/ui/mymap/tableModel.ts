// 속성 테이블 모달의 계산(순수 함수 — React·DOM과 무관). 큰 레이어(shp 최대 10만 피처)에서도 멈추지 않게
// 행 객체를 복사하지 않고 "행 번호 배열(인덱스)"만 만든다: 필터 → 정렬 → 쪽 자르기 순서로 인덱스 배열만 걸러 낸다.

/** 한 번에 그리는 행 수 */
export const TABLE_PAGE_SIZE = 100
/** 표시하는 열 상한(넘으면 안내) */
export const TABLE_MAX_COLUMNS = 200
/** 셀에 그리는 글자 상한(넘으면 …) — 한 셀이 수 MB여도 화면이 무거워지지 않게 */
export const CELL_MAX_CHARS = 200
/** 이 길이를 넘는 셀에만 title(전체 값)을 단다 — 나머지는 안 잘린다 */
export const CELL_TITLE_MIN_CHARS = 20
/** title에 담는 글자 상한 */
export const CELL_TITLE_MAX_CHARS = 2000

export type PropertyRow = Readonly<Record<string, unknown>>
export type SortDir = 'asc' | 'desc'
/** 행 번호 배열. null = 원래 순서 그대로(0..n-1) — 배열을 만들지 않는다 */
export type RowOrder = Int32Array | null

export interface TableModel {
    /** 피처 순서 그대로의 속성 객체(서버 응답 객체를 그대로 가리킨다 — 복사 없음) */
    rows: readonly PropertyRow[]
    /** 속성 키 합집합(처음 나온 순서, 최대 TABLE_MAX_COLUMNS) */
    columns: readonly string[]
    /** 열이 상한을 넘기 전 전체 개수 */
    totalColumns: number
}

const EMPTY_ROW: PropertyRow = Object.freeze({})

/** FeatureCollection → 표. features가 없으면 빈 표 */
export function buildTable(fc: unknown): TableModel {
    const features = fc && typeof fc === 'object' && Array.isArray((fc as { features?: unknown }).features)
        ? (fc as { features: unknown[] }).features : []
    const rows: PropertyRow[] = new Array(features.length)
    const seen = new Set<string>()
    const columns: string[] = []
    for (let i = 0; i < features.length; i++) {
        const f = features[i]
        const p = f && typeof f === 'object' ? (f as { properties?: unknown }).properties : null
        if (!p || typeof p !== 'object' || Array.isArray(p)) { rows[i] = EMPTY_ROW; continue }
        rows[i] = p as PropertyRow
        for (const k in p) {
            if (seen.has(k)) continue
            seen.add(k)
            if (columns.length < TABLE_MAX_COLUMNS) columns.push(k)
        }
    }
    return { rows, columns, totalColumns: seen.size }
}

/** 셀에 보일 글자 — null·undefined는 빈 칸, 객체는 JSON, 나머지는 문자열 */
export function cellText(v: unknown): string {
    if (v === null || v === undefined) return ''
    if (typeof v === 'string') return v
    if (typeof v === 'object') {
        try { return JSON.stringify(v) ?? '' } catch { return String(v) }
    }
    return String(v)
}

/** 긴 글자 말줄임(max 글자 + …) */
export function clipText(s: string, max: number): string {
    return s.length > max ? `${s.slice(0, max)}…` : s
}

/** 모든 열을 대상으로 한 글자 필터(대소문자 무시). 빈 검색어면 null(= 전체, 배열을 만들지 않는다) */
export function filterIndices(rows: readonly PropertyRow[], columns: readonly string[], query: string): RowOrder {
    const needle = query.trim().toLowerCase()
    if (needle === '') return null
    const hit = new Int32Array(rows.length)
    let n = 0
    for (let i = 0; i < rows.length; i++) {
        const row = rows[i]
        for (let c = 0; c < columns.length; c++) {
            const v = row[columns[c]]
            if (v === null || v === undefined) continue
            const s = typeof v === 'string' ? v : cellText(v)
            if (s.toLowerCase().includes(needle)) { hit[n++] = i; break }
        }
    }
    return hit.slice(0, n)
}

/** 소수·정수 글자로 읽히는 값(앞이 0인 코드·15자리 넘는 긴 숫자(PNU 등)는 숫자로 보지 않는다 — 코드가 숫자 정렬로 망가지지 않게) */
const NUMERIC_TEXT = /^-?(0|[1-9]\d{0,14})(\.\d+)?$/

function isBlank(v: unknown): boolean {
    return v === null || v === undefined || v === ''
}

/** 이 열을 숫자로 정렬하는가: 빈 값을 뺀 모든 값이 숫자(또는 숫자 글자)이고 하나 이상 있다 */
export function isNumericColumn(rows: readonly PropertyRow[], key: string, base: RowOrder = null): boolean {
    const n = base ? base.length : rows.length
    let any = false
    for (let p = 0; p < n; p++) {
        const v = rows[base ? base[p] : p][key]
        if (isBlank(v)) continue
        if (typeof v === 'number') { if (!Number.isFinite(v)) return false }
        else if (typeof v !== 'string' || !NUMERIC_TEXT.test(v)) return false
        any = true
    }
    return any
}

/**
 * 열 정렬. base(필터 결과)가 있으면 그 안에서만, 없으면 전체. 새 배열을 돌려준다(base는 그대로).
 * 숫자 열은 숫자 비교, 그 밖은 대소문자 무시 글자 비교(로캘 비의존 — 한글은 가나다 순). 빈 값은 오름·내림 모두 맨 뒤. 같은 값은 원래 순서 유지.
 */
export function sortIndices(rows: readonly PropertyRow[], base: RowOrder, key: string, dir: SortDir): Int32Array {
    const n = base ? base.length : rows.length
    const idx = new Int32Array(n)
    for (let p = 0; p < n; p++) idx[p] = base ? base[p] : p
    const sign = dir === 'asc' ? 1 : -1
    const blank = new Uint8Array(n)
    const numeric = isNumericColumn(rows, key, base)
    const nums = numeric ? new Float64Array(n) : null
    const texts: string[] | null = numeric ? null : new Array(n)
    for (let p = 0; p < n; p++) {
        const v = rows[idx[p]][key]
        if (isBlank(v)) { blank[p] = 1; continue }
        if (nums) nums[p] = typeof v === 'number' ? v : Number(v)
        else texts![p] = cellText(v).toLowerCase()
    }
    const order = new Uint32Array(n)
    for (let p = 0; p < n; p++) order[p] = p
    order.sort((a, b) => {
        if (blank[a] || blank[b]) return blank[a] === blank[b] ? a - b : blank[a] ? 1 : -1
        let d: number
        if (nums) d = nums[a] - nums[b]
        else d = texts![a] < texts![b] ? -1 : texts![a] > texts![b] ? 1 : 0
        return d === 0 ? a - b : d * sign
    })
    const out = new Int32Array(n)
    for (let p = 0; p < n; p++) out[p] = idx[order[p]]
    return out
}

/** 전체 쪽 수(행이 0개여도 1쪽) */
export function pageCount(total: number): number {
    return Math.max(1, Math.ceil(total / TABLE_PAGE_SIZE))
}

/** 쪽 번호(0부터)를 0..쪽 수-1로 맞춘다 */
export function clampPage(page: number, total: number): number {
    const last = pageCount(total) - 1
    if (!Number.isFinite(page)) return 0
    return Math.min(Math.max(0, Math.floor(page)), last)
}

/** 그 쪽의 [시작, 끝) 위치 */
export function pageRange(page: number, total: number): { start: number; end: number } {
    const start = clampPage(page, total) * TABLE_PAGE_SIZE
    return { start, end: Math.min(total, start + TABLE_PAGE_SIZE) }
}

// ── 행 → 지도 이동 ─────────────────────────────────────────────────────────

/** [minLon, minLat, maxLon, maxLat] (EPSG:4326) */
export type LonLatExtent = [number, number, number, number]

/** 중첩된 GeometryCollection을 따라 내려가는 깊이 상한(악의적으로 깊은 응답에서 호출 스택을 지킨다) */
const GEOMETRY_NEST_MAX = 8

function featureGeometry(fc: unknown, index: number): unknown {
    const features = fc && typeof fc === 'object' ? (fc as { features?: unknown }).features : null
    const f = Array.isArray(features) ? features[index] : null
    return f && typeof f === 'object' ? (f as { geometry?: unknown }).geometry : null
}

/** 좌표 배열(coordinates)들을 stack에 모은다 — GeometryCollection이면 안쪽 geometry로 내려간다. 모은 게 없으면 false */
function collectCoordinates(g: unknown, stack: unknown[][], depth: number): boolean {
    if (!g || typeof g !== 'object' || depth > GEOMETRY_NEST_MAX) return false
    const o = g as { coordinates?: unknown; geometries?: unknown }
    if (Array.isArray(o.geometries)) {
        let any = false
        for (const x of o.geometries) if (collectCoordinates(x, stack, depth + 1)) any = true
        return any
    }
    if (Array.isArray(o.coordinates) && o.coordinates.length > 0) { stack.push(o.coordinates); return true }
    return false
}

/** 이 행의 피처에 지도로 옮길 모양(geometry)이 있는가. 범위 계산은 눌렀을 때만 하므로(10만 행을 미리 훑지 않는다) 여기서는 껍데기만 본다 */
export function hasFeatureGeometry(fc: unknown, index: number): boolean {
    return collectCoordinates(featureGeometry(fc, index), [], 0)
}

/**
 * 한 피처의 좌표 범위(EPSG:4326). 점·선·면·멀티·GeometryCollection을 모두 훑고, 숫자가 아니거나 경위도 범위 밖(±180·±90)인 좌표는 건너뛴다.
 * 쓸 수 있는 좌표가 하나도 없으면 null(이동하지 않는다). 점 하나면 두 모서리가 같다.
 */
export function featureExtent(fc: unknown, index: number): LonLatExtent | null {
    const stack: unknown[][] = []
    if (!collectCoordinates(featureGeometry(fc, index), stack, 0)) return null
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    while (stack.length > 0) {
        const a = stack.pop() as unknown[]
        if (a.length >= 2 && typeof a[0] === 'number' && typeof a[1] === 'number') {
            const x = a[0], y = a[1]
            if (Number.isFinite(x) && Number.isFinite(y) && x >= -180 && x <= 180 && y >= -90 && y <= 90) {
                if (x < minX) minX = x
                if (x > maxX) maxX = x
                if (y < minY) minY = y
                if (y > maxY) maxY = y
            }
        } else {
            for (const c of a) if (Array.isArray(c)) stack.push(c)
        }
    }
    return minX <= maxX ? [minX, minY, maxX, maxY] : null
}
