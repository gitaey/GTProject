// PNU → 주소 찾기: 순수 함수 모음(React·fetch·xlsx 없음). 시험은 _workspace/etc-pnu-address/check/ 에서 node로 돌린다.
// 서버 PnuAddressService(U26)의 형식 검사와 같은 규칙: ^\d{10}[12]\d{8}$

// ── 한도·상수 ─────────────────────────────────────────
export const PNU_BATCH_SIZE = 500
export const MAX_DATA_ROWS = 20_000
export const MAX_FILE_BYTES = 10 * 1024 * 1024
export const MAX_ROAD_JOIN = 20
export const SUGGEST_SAMPLE_ROWS = 50
const SUGGEST_MIN_RATIO = 0.6

// ── 서버 응답 모양(U26) ─────────────────────────────────
export interface PnuRoadAddress {
    roadAddress: string
    zipCode: string | null
    buildingName: string | null
    relation: 'MAIN' | 'RELATED'
}

export interface PnuAddressItem {
    pnu: string
    jibunAddress: string | null
    buildingCount: number
    roadAddressCount: number
    roadAddresses: PnuRoadAddress[]
}

export interface PnuAddressMeta {
    referenceVersion: string | null
    roadAvailable: boolean
    relatedIncluded: boolean
    maxRoadAddresses: number
}

// ── 셀 판정 ───────────────────────────────────────────
/** SheetJS 셀 중 판정에 쓰는 부분만(t: b/n/d/s/z/e, v: 값, w: 표시 글자) */
export interface CellLike {
    t?: string
    v?: unknown
    w?: string
}

export type PnuCellKind = 'EMPTY' | 'EXP' | 'NUMERIC' | 'OK' | 'FORMAT'

export interface PnuCellResult {
    kind: PnuCellKind
    /** kind === 'OK'일 때만: 하이픈·공백을 뺀 19자리 */
    pnu: string | null
    /** OK가 아닐 때 상세(결과 엑셀 '비고', 미리보기 title) */
    detail: string | null
}

const EXP_PATTERN = /^[+-]?\d+(\.\d+)?[eE][+-]?\d+$/
// 공백(\s는 NBSP·FEFF 포함)·하이픈 여러 종류·폭 없는 공백
const STRIP_PATTERN = /[\s ​-‍⁠﻿\-‐-―−]/g

const RESULT_EMPTY: PnuCellResult = { kind: 'EMPTY', pnu: null, detail: null }

const INVISIBLE_PATTERN = /[\s ​-‍⁠﻿]/g

/** 값이 없거나 공백·보이지 않는 글자뿐인 칸(하이픈은 값으로 본다) */
export function isBlankCell(cell: CellLike | null | undefined): boolean {
    if (!cell || cell.t === 'z') return true
    if (cell.v === undefined || cell.v === null) return true
    return typeof cell.v === 'string' && cell.v.replace(INVISIBLE_PATTERN, '') === ''
}

/** 엑셀 PNU 칸 하나를 판정한다. 숫자 셀은 값을 보지 않는다(19자리는 숫자로 저장되는 순간 뒷자리가 이미 바뀐다). */
export function classifyPnuCell(cell: CellLike | null | undefined): PnuCellResult {
    if (!cell || cell.t === 'z' || cell.v === undefined || cell.v === null) return RESULT_EMPTY

    if (cell.t === 'n') {
        const shown = typeof cell.w === 'string' ? cell.w : ''
        if (/e/i.test(shown)) {
            return { kind: 'EXP', pnu: null, detail: '숫자(지수 표기)로 저장돼 뒷자리가 이미 바뀌었습니다. 텍스트 서식으로 다시 받아 오세요.' }
        }
        return { kind: 'NUMERIC', pnu: null, detail: '숫자 서식으로 저장돼 뒷자리가 이미 바뀌었습니다. 텍스트 서식으로 다시 받아 오세요.' }
    }
    if (cell.t === 'b' || cell.t === 'e' || cell.t === 'd' || typeof cell.v !== 'string') {
        return { kind: 'FORMAT', pnu: null, detail: '숫자가 아닌 값입니다.' }
    }

    // 글자 셀: NFKC(전각 숫자·전각 하이픈 등을 반각으로) → 앞 ' 제거
    let s = cell.v.normalize('NFKC').trim()
    if (s.startsWith("'")) s = s.slice(1)
    if (EXP_PATTERN.test(s.replace(/\s/g, ''))) {
        return { kind: 'EXP', pnu: null, detail: '지수 표기(예: 1.17E+18)라 뒷자리가 이미 바뀌었습니다. 텍스트 서식으로 다시 받아 오세요.' }
    }
    const cleaned = s.replace(STRIP_PATTERN, '')
    if (cleaned === '') return RESULT_EMPTY
    if (!/^\d+$/.test(cleaned)) {
        return { kind: 'FORMAT', pnu: null, detail: 'PNU 형식 오류(숫자가 아닌 글자)' }
    }
    if (cleaned.length !== 19) {
        return { kind: 'FORMAT', pnu: null, detail: `PNU 형식 오류(${cleaned.length}자리 — 19자리여야 합니다)` }
    }
    const mountain = cleaned.charAt(10)
    if (mountain !== '1' && mountain !== '2') {
        return { kind: 'FORMAT', pnu: null, detail: `PNU 형식 오류(11번째 자리 ${mountain} — 1(일반)·2(산)만 됩니다)` }
    }
    return { kind: 'OK', pnu: cleaned, detail: null }
}

// ── 열 추천 ───────────────────────────────────────────
export interface PnuColumnSuggestion {
    column: number | null
    /** true = 정상 PNU 열이 아니라 "숫자로 깨진 PNU 열 후보"를 골랐다(경고와 함께 선택) */
    broken: boolean
}

const HEADER_HINT = /pnu|필지\s*고유|필지\s*번호/i

function isBrokenNumber(cell: CellLike | null | undefined): boolean {
    return !!cell && cell.t === 'n' && typeof cell.v === 'number' && cell.v >= 1e18 && cell.v < 1e19
}

/**
 * 머리글과 앞 50행 표본으로 PNU 열을 추천한다(서버 ColumnSuggester와 같은 기준).
 * columns[c] = c번째 열의 표본 셀들. 비율 분모는 빈 칸을 뺀 셀 수.
 */
export function suggestPnuColumn(headers: readonly string[], columns: readonly (readonly (CellLike | undefined)[])[]): PnuColumnSuggestion {
    let best = -1
    let bestRatio = -1
    let bestHint = false
    const brokenByHint: number[] = []
    let brokenByValue = -1

    for (let c = 0; c < columns.length; c++) {
        const hint = HEADER_HINT.test(headers[c] ?? '')
        let ok = 0
        let nonEmpty = 0
        let broken = 0
        for (const cell of columns[c]) {
            if (isBlankCell(cell)) continue
            nonEmpty++
            if (classifyPnuCell(cell).kind === 'OK') ok++
            if (isBrokenNumber(cell)) broken++
        }
        const ratio = nonEmpty === 0 ? 0 : ok / nonEmpty
        if (ok > 0 && (ratio >= SUGGEST_MIN_RATIO || hint)) {
            // 비율 최고 → 같으면 머리글 힌트 → 같으면 왼쪽 열
            if (ratio > bestRatio || (ratio === bestRatio && hint && !bestHint)) {
                best = c
                bestRatio = ratio
                bestHint = hint
            }
        }
        if (hint) brokenByHint.push(c)
        if (brokenByValue < 0 && nonEmpty > 0 && broken / nonEmpty >= SUGGEST_MIN_RATIO) brokenByValue = c
    }
    if (best >= 0) return { column: best, broken: false }
    if (brokenByHint.length > 0) return { column: brokenByHint[0], broken: true }
    if (brokenByValue >= 0) return { column: brokenByValue, broken: true }
    return { column: null, broken: false }
}

// ── 검사 요약 ─────────────────────────────────────────
export interface PnuCheckSummary {
    /** 데이터 행 수(완전히 빈 행 제외) */
    rows: number
    ok: number
    /** 서로 다른 정상 PNU 수(= 서버에 보낼 건수) */
    unique: number
    /** 같은 PNU가 또 나온 행 수(ok - unique) */
    duplicates: number
    format: number
    numeric: number
    exp: number
    empty: number
    /** numeric + exp */
    unrecoverable: number
}

export interface ColumnAnalysis {
    results: PnuCellResult[]
    summary: PnuCheckSummary
    uniquePnus: string[]
}

/** 판정 결과 목록을 세고, 중복을 뺀 PNU 목록(처음 나온 순서)을 만든다. */
export function summarize(results: readonly PnuCellResult[]): { summary: PnuCheckSummary; uniquePnus: string[] } {
    const seen = new Set<string>()
    const uniquePnus: string[] = []
    let ok = 0
    let format = 0
    let numeric = 0
    let exp = 0
    let empty = 0
    for (const r of results) {
        switch (r.kind) {
            case 'OK':
                ok++
                if (r.pnu !== null && !seen.has(r.pnu)) {
                    seen.add(r.pnu)
                    uniquePnus.push(r.pnu)
                }
                break
            case 'FORMAT': format++; break
            case 'NUMERIC': numeric++; break
            case 'EXP': exp++; break
            default: empty++
        }
    }
    return {
        summary: {
            rows: results.length, ok, unique: uniquePnus.length, duplicates: ok - uniquePnus.length,
            format, numeric, exp, empty, unrecoverable: numeric + exp,
        },
        uniquePnus,
    }
}

export function analyzeColumn(cells: readonly (CellLike | undefined)[]): ColumnAnalysis {
    const results = cells.map(classifyPnuCell)
    return { results, ...summarize(results) }
}

export type StartBlock = 'ALL_BROKEN' | 'NONE_OK' | null

/** 시작을 막아야 하는 이유. ALL_BROKEN = 빈 칸을 뺀 모든 칸이 숫자 서식(복구 불가) */
export function startBlock(summary: PnuCheckSummary): StartBlock {
    if (summary.unique > 0) return null
    const filled = summary.rows - summary.empty
    if (summary.unrecoverable > 0 && summary.unrecoverable === filled) return 'ALL_BROKEN'
    return 'NONE_OK'
}

export function chunk<T>(items: readonly T[], size: number): T[][] {
    if (!(size >= 1)) throw new RangeError('size는 1 이상이어야 합니다.')
    const out: T[][] = []
    for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
    return out
}

// ── 응답 정리 ─────────────────────────────────────────
function str(v: unknown): string | null {
    return typeof v === 'string' && v !== '' ? v : null
}

function count(v: unknown): number {
    return typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0
}

/** 서버 item 하나를 믿을 수 있는 모양으로 고친다(pnu가 없거나 글자가 아니면 null). */
export function normalizeItem(raw: unknown): PnuAddressItem | null {
    if (typeof raw !== 'object' || raw === null) return null
    const r = raw as Record<string, unknown>
    if (typeof r.pnu !== 'string') return null
    const roads: PnuRoadAddress[] = []
    if (Array.isArray(r.roadAddresses)) {
        for (const a of r.roadAddresses) {
            if (typeof a !== 'object' || a === null) continue
            const x = a as Record<string, unknown>
            const road = str(x.roadAddress)
            if (road === null) continue
            roads.push({ roadAddress: road, zipCode: str(x.zipCode), buildingName: str(x.buildingName), relation: x.relation === 'RELATED' ? 'RELATED' : 'MAIN' })
        }
    }
    return {
        pnu: r.pnu,
        jibunAddress: str(r.jibunAddress),
        buildingCount: count(r.buildingCount),
        roadAddressCount: Math.max(count(r.roadAddressCount), roads.length),
        roadAddresses: roads,
    }
}

// ── 행 상태 ───────────────────────────────────────────
export type RowStatusCode =
    | 'SUCCESS' | 'NO_BUILDING' | 'JIBUN_ONLY' | 'NO_LEGAL_DONG'
    | 'FORMAT' | 'NUMERIC' | 'EXP' | 'EMPTY' | 'NOT_FETCHED'

export type StatusTone = 'ok' | 'warn' | 'err' | 'none'

export interface RowStatus {
    code: RowStatusCode
    label: string
    tone: StatusTone
}

const STATUS: Readonly<Record<RowStatusCode, RowStatus>> = Object.freeze({
    SUCCESS: { code: 'SUCCESS', label: '성공', tone: 'ok' },
    NO_BUILDING: { code: 'NO_BUILDING', label: '건물 없음', tone: 'warn' },
    JIBUN_ONLY: { code: 'JIBUN_ONLY', label: '지번만(도로명 자료 없음)', tone: 'warn' },
    NO_LEGAL_DONG: { code: 'NO_LEGAL_DONG', label: '법정동 없음', tone: 'warn' },
    FORMAT: { code: 'FORMAT', label: 'PNU 형식 오류', tone: 'err' },
    NUMERIC: { code: 'NUMERIC', label: '복구 불가(숫자 서식)', tone: 'err' },
    EXP: { code: 'EXP', label: '복구 불가(지수 표기)', tone: 'err' },
    EMPTY: { code: 'EMPTY', label: '빈 값', tone: 'none' },
    NOT_FETCHED: { code: 'NOT_FETCHED', label: '조회 안 됨', tone: 'err' },
})

export const STATUS_CODES: readonly RowStatusCode[] = Object.freeze(Object.keys(STATUS) as RowStatusCode[])

export function statusOf(code: RowStatusCode): RowStatus {
    return STATUS[code]
}

/** 판정이 OK가 아니면 그 판정. OK면 조회 결과로 결정한다. */
export function rowStatus(cell: PnuCellResult, item: PnuAddressItem | undefined, roadAvailable: boolean): RowStatus {
    switch (cell.kind) {
        case 'EMPTY': return STATUS.EMPTY
        case 'EXP': return STATUS.EXP
        case 'NUMERIC': return STATUS.NUMERIC
        case 'FORMAT': return STATUS.FORMAT
        default: break
    }
    if (!item) return STATUS.NOT_FETCHED
    if (item.jibunAddress === null && item.roadAddressCount === 0) return STATUS.NO_LEGAL_DONG
    if (!roadAvailable) return STATUS.JIBUN_ONLY
    if (item.roadAddressCount === 0) return STATUS.NO_BUILDING
    return STATUS.SUCCESS
}

export type PnuResultSummary = Readonly<Record<RowStatusCode, number>>

export function countStatuses(codes: readonly RowStatusCode[]): PnuResultSummary {
    const out = {} as Record<RowStatusCode, number>
    for (const c of STATUS_CODES) out[c] = 0
    for (const c of codes) out[c]++
    return out
}

// ── 결과 열 ───────────────────────────────────────────
export const RESULT_COLUMN_NAMES: readonly string[] = Object.freeze([
    '처리상태', 'PNU(정리)', '지번주소', '도로명주소', '우편번호', '건물명', '도로명주소_수', '도로명주소_전체', '비고',
])

/** 이름이 taken에 있으면 `이름 (2)`, `이름 (3)`… 으로 바꾸고 taken에 넣는다. */
export function uniqueHeader(name: string, taken: Set<string>): string {
    let candidate = name
    let n = 2
    while (taken.has(candidate)) candidate = `${name} (${n++})`
    taken.add(candidate)
    return candidate
}

/** 도로명주소를 ` | `로 잇는다. 서버가 자른 만큼(roadAddressCount - 보낸 수)은 끝에 ` 외 N건`. */
export function joinRoadAddresses(item: PnuAddressItem, max: number = MAX_ROAD_JOIN): string {
    const shown = item.roadAddresses.slice(0, Math.max(1, max))
    const text = shown.map((a) => a.roadAddress).join(' | ')
    const rest = item.roadAddressCount - shown.length
    return rest > 0 ? `${text} 외 ${rest}건` : text
}

export type ResultCellValue = string | number | null

export interface ResultRowInput {
    cell: PnuCellResult
    item: PnuAddressItem | undefined
}

export interface ResultColumns {
    headers: string[]
    /** inputs와 같은 길이. 입력이 null(완전히 빈 행)이면 빈 배열 */
    rows: ResultCellValue[][]
    statuses: (RowStatus | null)[]
}

function noteOf(status: RowStatus, cell: PnuCellResult, item: PnuAddressItem | undefined): string | null {
    switch (status.code) {
        case 'FORMAT': case 'NUMERIC': case 'EXP': return cell.detail
        case 'NO_BUILDING': return '건물이 없거나 없어진 PNU일 수 있습니다'
        case 'NO_LEGAL_DONG': return '법정동을 찾지 못했습니다'
        case 'JIBUN_ONLY': return '도로명주소 자료가 아직 준비되지 않아 지번주소만 채웠습니다'
        case 'NOT_FETCHED': return '조회를 마치기 전에 결과를 받았습니다'
        case 'SUCCESS':
            return item && item.roadAddresses.length > 0 && item.roadAddresses[0].relation === 'RELATED' ? '관련지번으로 찾은 건물' : null
        default: return null
    }
}

/** 원본 오른쪽에 덧붙일 열 머리글과 행별 값을 만든다. 머리글은 existingHeaders와 겹치면 `이름 (2)`. */
export function buildResultColumns(
    inputs: readonly (ResultRowInput | null)[],
    roadAvailable: boolean,
    existingHeaders: readonly string[],
): ResultColumns {
    const taken = new Set(existingHeaders.map((h) => h.trim()))
    const headers = RESULT_COLUMN_NAMES.map((n) => uniqueHeader(n, taken))
    const statuses: (RowStatus | null)[] = []
    const rows: ResultCellValue[][] = inputs.map((input) => {
        if (input === null) {
            statuses.push(null)
            return []
        }
        const { cell, item } = input
        const status = rowStatus(cell, item, roadAvailable)
        statuses.push(status)
        const known = cell.kind === 'OK' && item ? item : null
        const first = known && known.roadAddresses.length > 0 ? known.roadAddresses[0] : null
        return [
            status.label,
            cell.pnu,
            known ? known.jibunAddress : null,
            first ? first.roadAddress : null,
            first ? first.zipCode : null,
            first ? first.buildingName : null,
            known && roadAvailable ? known.roadAddressCount : null,
            known && known.roadAddressCount >= 2 ? joinRoadAddresses(known) : null,
            noteOf(status, cell, item),
        ]
    })
    return { headers, rows, statuses }
}
