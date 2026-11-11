// 업로드 창의 순수 규칙 — 엑셀 추천 판정·열 기본값·바닥줄 문장·카드 문구·칩·예외 문구(설계 6장). React·DOM과 무관. 시험: _workspace/mymap-upload-redesign/check/run-check.mjs
import type { ExcelPreviewResponse, MyMapLimits, MyMapQuota, MyMapUploadMode } from '../../core'
import { formatBytes } from './convertModel'
import { formatCount } from './format'
import { SRID_OPTIONS } from './sridOptions'
import { baseOf, extOf } from './uploadFiles'
import type { FileLike, FileProblem, PickItem, ShpGroup, UploadPick } from './uploadFiles'

// ───────────── 말투 도우미 ─────────────
const BATCHIM_DIGITS = '013678'
const BATCHIM_LETTERS = 'lmnr'

/** 글자의 읽는 소리가 받침으로 끝나는가(한글은 받침, 숫자·영문은 읽는 소리 기준의 근사). 은/는·이/가 고르기용 */
export function hasBatchim(text: string): boolean {
    const ch = text.trim().slice(-1)
    if (ch === '') return false
    const code = ch.charCodeAt(0)
    if (code >= 0xac00 && code <= 0xd7a3) return (code - 0xac00) % 28 !== 0
    if (BATCHIM_DIGITS.includes(ch)) return true
    return BATCHIM_LETTERS.includes(ch.toLowerCase())
}

export const eunNeun = (text: string): string => (hasBatchim(text) ? '은' : '는')
export const iGa = (text: string): string => (hasBatchim(text) ? '이' : '가')

// ───────────── 엑셀 방법·열 ─────────────
export const MODES: readonly MyMapUploadMode[] = Object.freeze(['PNU', 'ADDRESS', 'COORD'] as MyMapUploadMode[])
export const LEGACY_MODES: readonly MyMapUploadMode[] = Object.freeze(['COORD'] as MyMapUploadMode[])
export const MODE_LABELS: Readonly<Record<string, string>> = Object.freeze({ PNU: 'PNU로 필지 찾기', ADDRESS: '주소로 필지 찾기', COORD: '위도·경도로 점 찍기' })
export const MODE_HINTS: Readonly<Record<string, string>> = Object.freeze({ PNU: '19자리 PNU 열', ADDRESS: '도로명·지번 열', COORD: '좌표 열 2개' })

export interface ExcelCols {
    pnu: string
    address: string
    lat: string
    lon: string
}

export const EMPTY_COLS: Readonly<ExcelCols> = Object.freeze({ pnu: '', address: '', lat: '', lon: '' })

export interface ExcelDefaults {
    mode: MyMapUploadMode
    cols: ExcelCols
    /** 서버가 추천한 좌표계(선택지에 있을 때만). 없으면 null */
    srid: string | null
    /** 추천이 그대로 맞아 "놓기 → 만들기"로 끝낼 수 있는가 */
    quick: boolean
}

/** 추천 값이 실제 머리글에 있을 때만 쓴다 */
function header(p: ExcelPreviewResponse, v: string | null | undefined): string {
    return v && p.headers.includes(v) ? v : ''
}

export function rowLimit(limits: MyMapLimits | null | undefined, mode: MyMapUploadMode): number | null {
    if (!limits) return null
    return mode === 'PNU' ? limits.pnu : mode === 'ADDRESS' ? limits.address : limits.coord
}

export function hasOverLimitWarning(preview: ExcelPreviewResponse): boolean {
    return (preview.warnings ?? []).some(w => w.code === 'OVER_LIMIT')
}

/** 필요한 열이 채워졌는가 */
export function columnsFilled(mode: MyMapUploadMode, cols: ExcelCols): boolean {
    return mode === 'PNU' ? !!cols.pnu : mode === 'ADDRESS' ? !!cols.address : !!cols.lat && !!cols.lon
}

/** "경도(X) 열을 골라 주세요." — 다 채워졌으면 null */
export function missingText(mode: MyMapUploadMode, cols: ExcelCols): string | null {
    if (columnsFilled(mode, cols)) return null
    if (mode === 'PNU') return 'PNU 열을 골라 주세요.'
    if (mode === 'ADDRESS') return '주소 열을 골라 주세요.'
    if (!cols.lat && !cols.lon) return '위도(Y)·경도(X) 열을 골라 주세요.'
    return cols.lat ? '경도(X) 열을 골라 주세요.' : '위도(Y) 열을 골라 주세요.'
}

/** 행 한도 판정(예전 규칙 그대로): 한도를 알면 행 수와 비교, 모르는데 서버가 OVER_LIMIT를 알리면 서버 문구를 따른다 */
export interface OverLimit {
    blocked: boolean
    text: string | null
    /** 줄여야 할 행 수(한도) */
    limit: number | null
}

export function overLimitOf(preview: ExcelPreviewResponse, quota: MyMapQuota | null | undefined, mode: MyMapUploadMode): OverLimit {
    const limit = rowLimit(preview.limits ?? quota?.maxRows ?? null, mode)
    const total = preview.totalRows
    if (limit !== null && total !== undefined && total > limit) {
        return { blocked: true, limit, text: `데이터가 ${formatCount(total)}행이라 한 번에 올릴 수 있는 ${formatCount(limit)}행을 넘습니다. 파일을 나누어 올려 주세요.` }
    }
    const warn = (preview.warnings ?? []).find(w => w.code === 'OVER_LIMIT')
    if (limit === null && warn) return { blocked: true, limit: null, text: warn.message }
    return { blocked: false, limit, text: null }
}

/** 서버 미리보기의 추천을 화면 기본값으로 */
export function pickExcelDefaults(preview: ExcelPreviewResponse, quota?: MyMapQuota | null): ExcelDefaults {
    const sg = preview.suggestions
    const cols: ExcelCols = {
        pnu: header(preview, sg?.pnuColumn), address: header(preview, sg?.addressColumn),
        lat: header(preview, sg?.latColumn), lon: header(preview, sg?.lonColumn),
    }
    let mode: MyMapUploadMode = 'COORD'
    if (sg) {
        if (sg.mode === 'PNU' || sg.mode === 'COORD' || (sg.mode === 'ADDRESS' && cols.address)) mode = sg.mode
        else if (cols.pnu) mode = 'PNU'
        else if (cols.lat && cols.lon) mode = 'COORD'
        else if (cols.address) mode = 'ADDRESS'
        else mode = 'PNU'
    }
    const srid = sg?.sourceSrid && SRID_OPTIONS.some(o => o.value === sg.sourceSrid) ? sg.sourceSrid : null
    return { mode, cols, srid, quick: quickReady(preview, mode, cols, srid, quota) }
}

/**
 * 추천이 맞아 요약 한 장만 보여 줘도 되는가(설계 4.3): 새 서버(suggestions)·추천 방법이 PNU/ADDRESS/COORD·그 방법의 열이 실제 머리글에 있음·
 * COORD면 좌표계 추천도 있음·행 한도 안·OVER_LIMIT 경고 없음. 방법이 추천과 다르게 고쳐졌다면(열이 없어 바뀜) 빠른 길이 아니다
 */
export function quickReady(preview: ExcelPreviewResponse, mode: MyMapUploadMode, cols: ExcelCols, srid: string | null, quota?: MyMapQuota | null): boolean {
    const sg = preview.suggestions
    if (!sg) return false
    if (sg.mode !== 'PNU' && sg.mode !== 'ADDRESS' && sg.mode !== 'COORD') return false
    if (mode !== sg.mode) return false
    if (!columnsFilled(mode, cols)) return false
    if (mode === 'COORD' && srid === null) return false
    if (hasOverLimitWarning(preview)) return false
    if (overLimitOf(preview, quota, mode).blocked) return false
    return true
}

/** 좌표계 짧은 이름(요약 문구용) */
export function sridShort(srid: string): string {
    if (srid === 'EPSG:4326') return 'WGS84 경위도'
    if (srid === 'EPSG:5186') return '중부원점(EPSG:5186)'
    if (srid === 'EPSG:5179') return 'UTM-K(EPSG:5179)'
    if (srid === 'EPSG:3857') return 'Web Mercator(EPSG:3857)'
    return srid
}

export interface Headline {
    title: string
    detail: string
}

/** 추천이 잡힌 빠른 길의 요약 한 장 문구 */
export function summaryText(mode: MyMapUploadMode, cols: ExcelCols, srid: string): Headline {
    if (mode === 'PNU') return { title: 'PNU로 필지를 찾습니다', detail: `'${cols.pnu}' 열을 자동으로 골랐습니다.` }
    if (mode === 'ADDRESS') return { title: '주소로 필지를 찾습니다', detail: `'${cols.address}' 열을 자동으로 골랐습니다.` }
    return { title: '위도·경도로 점을 찍습니다', detail: `위도 '${cols.lat}', 경도 '${cols.lon}' · ${sridShort(srid)}(자동으로 골랐습니다)` }
}

/** 직접 고르는 화면(추천이 없거나 일부만)의 카드 머리 문구 */
export function manualHeadline(preview: ExcelPreviewResponse, cols: ExcelCols): Headline {
    if (preview.suggestions === undefined) return { title: '위도·경도 열을 골라 주세요', detail: '' }
    const any = !!cols.pnu || !!cols.address || !!cols.lat || !!cols.lon
    if (!any && !preview.suggestions.mode) return { title: '위치를 알려 줄 열을 찾지 못했습니다', detail: '아래에서 방법과 열을 골라 주세요.' }
    return { title: '위치를 알려 줄 열을 골라 주세요', detail: '' }
}

export const SRID_UNCONFIRMED_HINT = '좌표계를 확인해 주세요 — 숫자가 37.5·127.0처럼 생겼으면 WGS84, 20만·50만처럼 크면 중부원점(EPSG:5186)입니다.'
export const ADDRESS_TIP = '도로명·지번이 섞여도 됩니다. 시도·시군구까지 적을수록 정확합니다. 같은 이름이 여러 곳이면 "정하지 못했습니다"로 실패하고 결과 창에서 후보를 볼 수 있습니다. 행정동이 아닌 법정동 이름을 써 주세요.'
export const NUMERIC_PNU_TEXT = 'PNU가 숫자 서식이라 뒷자리가 바뀌었을 수 있습니다. 엑셀에서 그 열을 \'텍스트\' 서식으로 바꿔 다시 올려 주세요.'

// ───────────── 문구 ─────────────
export const TEXT = Object.freeze({
    title: '레이어 올리기',
    convertTitle: '주소 변환 — 엑셀로 받기',
    dropTitle: '파일을 여기로 끌어 놓거나 눌러서 고르세요',
    dropSub: '엑셀(.xlsx) 1개 또는 SHP 묶음(.shp · .shx · .dbf · .prj 함께)',
    moreDrop: '파일 더 끌어 놓기',
    moreDropSub: '— 이미 놓은 파일과 합쳐집니다',
    otherDrop: '다른 파일 끌어 놓기',
    pick: '고르기',
    overlay: '여기에 놓으세요',
    overlaySub: '엑셀 1개 또는 SHP 묶음 · 폴더도 됩니다',
    overlayLocked: '지금은 놓을 수 없습니다',
    overlayLockedSub: '처리 중입니다. 끝난 뒤에 놓아 주세요.',
    canUpload: '무엇을 올릴 수 있나요?',
    nameLabel: '레이어 이름',
    namePlaceholder: '예: 우리 동네 공공시설',
    submit: '레이어 만들기',
    submitting: '만드는 중…',
    convertSubmit: '변환하고 엑셀 받기',
    convertBack: '지도에 올리기로 돌아가기',
    convertOnly: '엑셀로만 받기',
    convertOnlyHint: '지도에 올리지 않고 변환한 엑셀만 받을 수도 있습니다',
    methodLabel: '위치를 무엇으로 찾을까요?',
    changeMethod: '바꾸기',
    otherFile: '다른 파일',
    reread: '다시 읽기',
    sendingKeep: '창을 닫아도 보내기는 계속됩니다.',
})

/** "무엇을 올릴 수 있나요?" 펼친 안의 한도 줄(한도를 모르면 null) */
export function limitsLine(quota: MyMapQuota | null | undefined): string | null {
    if (!quota) return null
    return `엑셀 최대 ${formatCount(quota.maxRows.pnu)}행·${formatCount(quota.maxExcelMb)}MB · SHP 최대 ${formatCount(quota.maxShpFeatures)}개·${formatCount(quota.maxShpMb)}MB · 내 레이어 ${quota.ownedLayers} / ${quota.maxLayers}`
}

// ───────────── 파일별 문구 ─────────────
export function problemText(problem: FileProblem, name: string): string {
    switch (problem) {
        case 'EMPTY': return `'${name}'${eunNeun(name)} 비어 있는 파일입니다(0바이트). 저장이 끝났는지 확인해 주세요.`
        case 'XLS': return `'${name}'${eunNeun(name)} 옛 엑셀 형식(.xls)입니다. 엑셀에서 [다른 이름으로 저장] → 'Excel 통합 문서(.xlsx)'로 저장해 다시 올려 주세요.`
        case 'CSV': return `'${name}' — CSV는 바로 올릴 수 없습니다. 엑셀에서 열어 .xlsx로 저장해 올려 주세요.`
        case 'ZIP': return `'${name}' — 압축 파일은 풀어서 안의 .shp·.shx·.dbf·.prj를 함께 끌어 놓아 주세요.`
        case 'OTHER': return `'${name}'${eunNeun(name)} 올릴 수 없는 파일입니다. 엑셀(.xlsx)이나 SHP 묶음만 올릴 수 있습니다.`
        case 'COMPANION_ONLY': return `'${name}'${eunNeun(name)} 단독으로는 올릴 수 없습니다. .shp와 .dbf를 함께 끌어 놓아 주세요.`
        case 'SOURCE_EXCEL': return `'${name}' — 이 화면에서는 엑셀을 올릴 수 없습니다.`
        case 'SOURCE_SHP': return `'${name}' — 이 화면에서는 SHP를 올릴 수 없습니다.`
        case 'NAME_MISMATCH': return `'${name}'${eunNeun(name)} 다른 이름의 파일과 묶여 있지 않습니다.`
    }
}

export type ExcelBlockCode = 'ENCRYPTED_OR_OLD' | 'NOT_EXCEL' | 'SERVER'

export interface ExcelBlock {
    code: ExcelBlockCode
    name: string
    /** SERVER일 때 서버가 준 문구 */
    message?: string
}

export function excelBlockText(b: ExcelBlock): string {
    if (b.code === 'ENCRYPTED_OR_OLD') return `'${b.name}'${eunNeun(b.name)} 암호가 걸려 있거나 옛 형식이라 읽을 수 없습니다. 엑셀에서 암호를 풀고 .xlsx로 다시 저장해 주세요.`
    if (b.code === 'NOT_EXCEL') return `'${b.name}'${eunNeun(b.name)} 엑셀 파일이 아닌 것 같습니다. 엑셀에서 열어 .xlsx로 다시 저장해 주세요.`
    return b.message && b.message.trim() ? b.message : '파일을 읽지 못했습니다. 다른 파일로 다시 시도해 주세요.'
}

export function excelOverSizeText(name: string, size: number, maxExcelMb: number): string {
    return `'${name}'${iGa(name)} ${formatBytes(size)}라 최대 ${formatCount(maxExcelMb)}MB를 넘습니다. 필요 없는 시트·열을 지우거나 나누어 올려 주세요.`
}

export function shpOverSizeText(bytes: number, maxShpMb: number): string {
    return `합계 ${formatBytes(bytes)} — 최대 ${formatCount(maxShpMb)}MB까지 올릴 수 있습니다. 지역을 나누어 저장해 올려 주세요.`
}

export const NO_SHX_TEXT = '색인 파일(.shx)이 없습니다. 함께 있으면 더 끌어 놓아 주세요(없어도 시도는 합니다).'
export const NO_PRJ_TEXT = '좌표계 파일(.prj)이 없어 아래에서 고른 좌표계로 읽습니다. 모르면 자료를 준 곳에 물어보세요.'

// ───────────── SHP 묶음 설명 ─────────────
const EXT_ORDER: readonly string[] = Object.freeze(['shp', 'dbf', 'shx', 'prj'])

/** 묶음 한 줄 설명: ".shp .dbf .shx .prj · 820KB" (+ "(.dbf 없음)") */
export function groupDescribe(g: ShpGroup<FileLike>): string {
    const have = EXT_ORDER.filter(e => g[e as 'shp' | 'dbf' | 'shx' | 'prj'] !== undefined).map(e => '.' + e)
    const lack = (['shp', 'dbf'] as const).filter(e => !g[e]).map(e => '.' + e)
    return `${have.join(' ')} · ${formatBytes(g.bytes)}${lack.length ? ` (${lack.join('·')} 없음)` : ''}`
}

/** "엑셀로 계속 / SHP로 계속" 단추 밑 글: SHP 파일들의 이름과 확장자 */
export function shpSummary(files: readonly FileLike[]): string {
    if (files.length === 0) return ''
    const shp = files.find(f => extOf(f.name) === 'shp') ?? files[0]
    const exts = EXT_ORDER.filter(e => files.some(f => extOf(f.name) === e)).map(e => '.' + e)
    return `${baseOf(shp.name)} (${exts.join(' ')})`
}

// ───────────── 칩(파일 한 줄) ─────────────
export type ChipTone = 'ok' | 'warn' | 'need' | 'ign'

export interface Chip {
    label: string
    tone: ChipTone
}

const ROLE_LABELS: Readonly<Record<string, string>> = Object.freeze({ shp: '도형', dbf: '속성', shx: '색인', prj: '좌표계', xlsx: '엑셀' })
const BAD_LABELS: Readonly<Record<FileProblem, string>> = Object.freeze({
    EMPTY: '0바이트', XLS: '옛 엑셀 형식', CSV: 'CSV', ZIP: '압축 파일', OTHER: '올릴 수 없음', COMPANION_ONLY: '단독 불가',
    SOURCE_EXCEL: '지원 안 함', SOURCE_SHP: '지원 안 함', NAME_MISMATCH: '이름 불일치',
})
const IGNORED_LABELS: Readonly<Record<string, string>> = Object.freeze({
    COMPANION: '쓰지 않음(빼고 올림)', ORPHAN: '이름이 달라 뺌', DUPLICATE: '같은 이름이 있어 뺌', NOT_CHOSEN: '고르지 않음',
})

export function chipOf(item: PickItem<FileLike>): Chip {
    if (item.use === 'bad') return { label: BAD_LABELS[item.problem ?? 'OTHER'], tone: 'need' }
    if (item.use === 'ignored') return { label: IGNORED_LABELS[item.why ?? 'COMPANION'], tone: 'ign' }
    return { label: ROLE_LABELS[item.kind] ?? '', tone: 'ok' }
}

// ───────────── 판별 카드 ─────────────
export interface CardView {
    tone: 'ok' | 'need' | 'err' | 'info'
    title: string
    lines: string[]
}

/** 엑셀이 아닌 판별(엑셀의 방법·열 카드는 ExcelLocationCard가 따로 그린다)의 카드. 보여 줄 게 없으면 null */
export function cardForPick(pick: UploadPick<FileLike>, maxShpMb: number | null | undefined): CardView | null {
    switch (pick.kind) {
        case 'empty': return null
        case 'unsupported': {
            const lines = pick.items.filter(i => i.use === 'bad' && i.problem).map(i => problemText(i.problem as FileProblem, i.file.name))
            return { tone: 'err', title: '올릴 수 있는 파일이 없습니다', lines }
        }
        case 'mixed': return { tone: 'need', title: '엑셀과 SHP는 따로 올려야 합니다', lines: ['어느 쪽부터 올릴까요? 고르지 않은 파일은 빠집니다.'] }
        case 'choose-excel': return { tone: 'need', title: '엑셀은 한 번에 하나씩 올릴 수 있습니다', lines: ['올릴 파일을 고르세요.'] }
        case 'choose-shp': return { tone: 'need', title: `SHP가 ${pick.groups.length}벌 있습니다`, lines: ['SHP는 한 번에 한 레이어씩 올릴 수 있습니다. 올릴 묶음을 고르세요.'] }
        case 'excel': return null
        case 'shp': {
            const base = pick.group.base
            if (pick.nameMismatch) return { tone: 'err', title: '파일 이름이 서로 다릅니다', lines: [`파일 이름(확장자 앞부분)이 같아야 한 묶음입니다: ${pick.nameMismatch.join(' · ')}`] }
            // 파일은 있는데 0바이트라 빠진 것으로 센 경우 — "빠졌습니다"가 아니라 비어 있다고 말한다
            const emptyShp = pick.missing.includes('shp') ? pick.emptyNames.shp : undefined
            const emptyDbf = pick.missing.includes('dbf') ? pick.emptyNames.dbf : undefined
            if (emptyShp) return { tone: 'err', title: '도형 파일(.shp)이 비어 있습니다', lines: [problemText('EMPTY', emptyShp)] }
            if (emptyDbf) return { tone: 'err', title: '속성 파일(.dbf)이 비어 있습니다', lines: [problemText('EMPTY', emptyDbf)] }
            if (pick.missing.length === 2) return { tone: 'err', title: '도형 파일(.shp)과 속성 파일(.dbf)이 빠졌습니다', lines: [`'${base}.shp'·'${base}.dbf'를 더 끌어 놓으세요. SHP는 같은 이름의 .shp·.dbf가 꼭 함께 있어야 합니다.`] }
            if (pick.missing[0] === 'shp') return { tone: 'err', title: '도형 파일(.shp)이 빠졌습니다', lines: [`'${base}.shp'를 더 끌어 놓으세요. SHP는 같은 이름의 .shp·.dbf가 꼭 함께 있어야 합니다.`] }
            if (pick.missing[0] === 'dbf') return { tone: 'err', title: '속성 파일(.dbf)이 빠졌습니다', lines: [`'${base}.dbf'를 더 끌어 놓으세요. SHP는 같은 이름의 .shp·.dbf가 꼭 함께 있어야 합니다.`] }
            if (pick.overSize && maxShpMb) return { tone: 'err', title: '용량이 너무 큽니다', lines: [shpOverSizeText(pick.bytes, maxShpMb)] }
            const prjLine = pick.noPrj ? '좌표계는 아래에서 고른 값을 씁니다' : '좌표계는 .prj에서 자동으로 읽습니다'
            const size = maxShpMb ? `합계 ${formatBytes(pick.bytes)} / 최대 ${formatCount(maxShpMb)}MB` : `합계 ${formatBytes(pick.bytes)}`
            return { tone: 'ok', title: 'SHP 묶음이 준비됐습니다', lines: [`${prjLine} · ${size}`] }
        }
    }
}

/** 카드 아래 주의 띠(막지 않는 경고). SHP .shx 없음 */
export function shpWarnings(pick: UploadPick<FileLike>): string[] {
    if (pick.kind !== 'shp' || pick.nameMismatch || pick.missing.length > 0) return []
    return pick.noShx ? [NO_SHX_TEXT] : []
}

// ───────────── 바닥줄 ─────────────
export interface FooterInput {
    sending: boolean
    reading: boolean
    /** 화면이 따르는 판별(choose-shp는 고른 묶음으로 푼 것) */
    pick: UploadPick<FileLike>
    /** 머리 바이트·서버 미리보기 실패 */
    excelBlocked: boolean
    /** 미리보기가 있고 만료되지 않았나 */
    hasPreview: boolean
    expired: boolean
    /** 열 select에서 빠진 것 문장(없으면 null) */
    missing: string | null
    over: OverLimit | null
    nameEmpty: boolean
    convert: boolean
    convertRows: number
    maxShpFeatures: number | null
}

export interface Footer {
    text: string
    /** 주황 강조(사용자가 해야 할 일이 있을 때) */
    need: boolean
    /** [만들기] 단추를 켤 수 있나 */
    ready: boolean
}

export const READY_TEXT = '만들기를 누르면 창이 닫히고 목록에서 진행률이 보입니다. 끝나면 결과 창이 열립니다.'

export function footerOf(i: FooterInput): Footer {
    const no = (text: string, need = true): Footer => ({ text, need, ready: false })
    if (i.sending) return no(i.convert ? '변환하는 중입니다…' : TEXT.sendingKeep, false)
    if (i.reading) return no('파일을 읽고 있습니다…', false)
    const p = i.pick
    switch (p.kind) {
        case 'empty': return no('파일을 올리면 위치를 찾는 방법을 자동으로 고릅니다.', false)
        case 'unsupported': return no('엑셀(.xlsx)이나 SHP 묶음을 올려 주세요.')
        case 'mixed': return no('올릴 쪽을 골라 주세요.')
        case 'choose-excel': return no('올릴 파일을 골라 주세요.')
        case 'choose-shp': return no('올릴 묶음을 골라 주세요.')
        case 'shp': {
            if (p.nameMismatch) return no('파일 이름을 맞춰 다시 올려 주세요.')
            if (p.missing.includes('shp')) return no(p.emptyNames.shp ? '내용이 있는 도형 파일(.shp)을 다시 놓아 주세요.' : '도형 파일(.shp)을 더 놓아 주세요.')
            if (p.missing.includes('dbf')) return no(p.emptyNames.dbf ? '내용이 있는 속성 파일(.dbf)을 다시 놓아 주세요.' : '속성 파일(.dbf)을 더 놓아 주세요.')
            if (p.overSize) return no('파일 용량을 줄이거나 나누어 올려 주세요.')
            if (i.nameEmpty) return no('레이어 이름을 적어 주세요.')
            const cap = i.maxShpFeatures ? ` 도형은 최대 ${formatCount(i.maxShpFeatures)}개까지(넘으면 처리 중 실패로 표시).` : ''
            return { text: `만들기를 누르면 창이 닫히고 목록에서 진행률이 보입니다.${cap}`, need: false, ready: true }
        }
        case 'excel': {
            if (i.excelBlocked) return no('다른 엑셀 파일을 올려 주세요.')
            if (p.overSize) return no('파일을 줄이거나 나누어 올려 주세요.')
            if (i.expired) return no('[다시 읽기]를 눌러 주세요.')
            if (!i.hasPreview) return no('파일을 읽고 있습니다…', false)
            if (i.over?.blocked) return no(i.over.limit !== null ? `행 수를 ${formatCount(i.over.limit)}행 이하로 줄여 주세요.` : '행 수를 줄여 주세요.')
            if (i.missing) return no(i.missing)
            if (i.convert) return { text: `최대 ${formatCount(i.convertRows)}행 · 변환이 끝나면 엑셀이 바로 내려받아집니다.`, need: false, ready: true }
            if (i.nameEmpty) return no('레이어 이름을 적어 주세요.')
            return { text: READY_TEXT, need: false, ready: true }
        }
    }
}

/** 화면 낭독(aria-live)용 한 문장. 판별 카드의 제목·첫 줄 */
export function liveMessage(input: { sending: boolean; reading: boolean; convert: boolean; title: string | null; detail: string | null }): string {
    if (input.sending) return input.convert ? '변환하는 중입니다' : '파일을 보내는 중입니다'
    if (input.reading) return '파일을 읽고 있습니다'
    if (!input.title) return ''
    return input.detail ? `${input.title}. ${input.detail}` : input.title
}

/** 큰 파일을 보내는 중 안내(8MB부터) */
export function sendingNote(bytes: number): string | null {
    if (bytes < 8 * 1024 * 1024) return null
    return `${formatBytes(bytes)}를 보내는 중입니다. 몇 분 걸릴 수 있습니다.`
}

const HANGUL = /[가-힣]/
const BUSY_TEXT = '앞에 올린 레이어를 아직 처리하고 있습니다. 목록에서 끝난 것을 확인한 뒤 다시 [레이어 만들기]를 눌러 주세요.'

/**
 * 업로드 실패를 "원인 + 다음 행동"이 맞는 문장으로. status = 서버 HTTP 상태(어댑터가 붙임, 없으면 null = 네트워크·소스 오류).
 * 다시 눌러도 같은 결과인 4xx(손상 파일·한도 초과 등)에는 "잠시 뒤 다시"라고 하지 않고, 일시 오류(429·5xx·네트워크)만 다시 시도하라고 한다.
 * 영어 원문(Failed to fetch 등)은 문구에 넣지 않는다
 */
export function uploadFailText(msg: string | null | undefined, status?: number | null): string {
    const m = (msg ?? '').trim()
    const korean = HANGUL.test(m)
    const has = typeof status === 'number'
    if (status === 429 || m.includes('처리 중인 업로드')) return BUSY_TEXT
    if (status === 413 || m.includes('너무 큽니다')) return korean ? `${m} 나누어 올려 주세요.` : '파일이 너무 큽니다. 나누어 올려 주세요.'
    if (m.includes('shp 파일 세트')) return 'SHP 파일이 손상됐거나 올바른 .shp·.dbf가 아닙니다. 파일을 확인하거나 원본에서 다시 저장해 올려 주세요.'
    if (status === 409 || m.includes('만들 수 있습니다')) return '레이어가 가득 찼습니다. 안 쓰는 레이어를 지운 뒤 다시 올려 주세요.'
    if (has && status >= 400 && status < 500) return korean ? `레이어를 만들지 못했습니다(${m}). 파일과 이름을 확인해 주세요.` : '레이어를 만들지 못했습니다. 파일과 이름을 확인해 주세요.'
    if (has) return korean ? `레이어를 만들지 못했습니다(${m}). 잠시 뒤 다시 눌러 주세요.` : '레이어를 만들지 못했습니다. 잠시 뒤 다시 눌러 주세요.'
    // 상태 없음: 한국어 문구는 소스가 준 것, 영어 원문이면 네트워크 실패로 본다
    if (m === '' || m === '업로드 실패') return '레이어를 만들지 못했습니다. 잠시 뒤 다시 눌러 주세요.'
    return korean ? `레이어를 만들지 못했습니다(${m}).` : '네트워크 연결을 확인한 뒤 다시 눌러 주세요.'
}

/** 파일이 바뀌었다는 알림 */
export function replacedNotice(name: string): string {
    const code = name.trim().slice(-1).charCodeAt(0)
    const rieul = code >= 0xac00 && code <= 0xd7a3 && (code - 0xac00) % 28 === 8
    return `파일을 '${name}'${hasBatchim(name) && !rieul ? '으로' : '로'} 바꿨습니다.`
}
