// 영역 분석 패널의 순수 표기 함수·얼린 표(React·DOM과 무관). 시험·UMD 안내에서도 같은 글자를 쓴다.
import type { AreaAnalysisColumn, AreaConfirm, AreaDrawShape, AreaSelectMode, AreaShape, CategoryResult, LayerAnalysisResult, NumericColumnStats } from '../../core'
import { formatCount } from '../mymap/format'

export const ANALYSIS_TITLE = '영역 분석'

export interface ShapeChoice {
    key: AreaDrawShape | 'extent'
    label: string
}

export const SHAPE_CHOICES: readonly ShapeChoice[] = Object.freeze([
    { key: 'polygon', label: '다각형' },
    { key: 'box', label: '사각형' },
    { key: 'circle', label: '원' },
    { key: 'extent', label: '현재 화면' },
])

/** 그리는 중 안내(도구 커서 안내와 같은 말) */
export const DRAW_HELP: Readonly<Record<AreaDrawShape, string>> = Object.freeze({
    polygon: '지도를 클릭해 꼭짓점을 찍고 더블클릭으로 마칩니다. 우클릭은 취소.',
    box: '모서리를 클릭하고 움직인 뒤 반대쪽 모서리를 다시 클릭하세요. 우클릭은 취소.',
    circle: '중심을 클릭하고 움직인 뒤 다시 클릭하세요(지상 반지름 원). 우클릭은 취소.',
})

export interface ModeChoice {
    key: AreaSelectMode
    label: string
    hint: string
}

export const MODE_CHOICES: readonly ModeChoice[] = Object.freeze([
    { key: 'intersects', label: '걸침', hint: '영역과 조금이라도 겹치는 피처' },
    { key: 'center', label: '중심점', hint: '피처의 중심점이 영역 안에 있는 피처(경계에 걸친 피처는 한쪽에만 셈)' },
    { key: 'within', label: '완전히 안', hint: '피처 전체가 영역 안에 들어 있는 것만' },
])

export const EMPTY_LAYERS_NOTE = '분석할 수 있는 레이어가 없습니다. 레이어 패널에서 GeoServer·VWorld 레이어를 올리면 여기에 나타납니다(로그인 전이거나 이 지도에 질의 수단이 없으면 비어 있습니다).'
export const NO_QUERYABLE_NOTE = '분석할 수 있는 레이어가 없습니다. 아래 레이어는 질의 수단이 없어 분석할 수 없습니다.'
export const NO_AREA_NOTE = '먼저 영역을 정하세요.'
export const NO_PICK_NOTE = '분석할 레이어를 하나 이상 고르세요.'
export const NO_HIT_NOTE = '영역에 걸치는 피처가 없습니다.'
export const OFF_MAP_NOTE = '이 레이어가 지도에서 꺼져 있습니다. 숫자는 남아 있지만 지도 강조는 그리지 않습니다. 다시 켜면 영역을 다시 분석하세요.'
export const CANCELLED_NOTE = '취소했습니다. 숫자를 보여 주지 않습니다.'

const PROVIDER_LABEL: Readonly<Record<string, string>> = Object.freeze({
    geoserver: 'GeoServer', vworld: 'VWorld', none: '레이어',
})

/** 종류 배지 class(문자열을 이어 붙이지 않는다 — 감사 8번이 class 토큰을 그대로 검사한다) */
const BADGE_CLASS: Readonly<Record<string, string>> = Object.freeze({
    geoserver: 'gm-analysis__badge gm-analysis__badge--geoserver',
    vworld: 'gm-analysis__badge gm-analysis__badge--vworld', none: 'gm-analysis__badge gm-analysis__badge--none',
})

export function badgeClass(p: string, gray = false): string {
    return BADGE_CLASS[gray ? 'none' : p] ?? BADGE_CLASS.none
}

const STATUS_CLASS: Readonly<Record<StatusTone, string>> = Object.freeze({
    ok: 'gm-analysis__status gm-analysis__status--ok', part: 'gm-analysis__status gm-analysis__status--part',
    run: 'gm-analysis__status gm-analysis__status--run', err: 'gm-analysis__status gm-analysis__status--err',
    cx: 'gm-analysis__status gm-analysis__status--cx',
})

export function statusClass(tone: StatusTone): string {
    return STATUS_CLASS[tone]
}

export function providerLabel(p: string): string {
    return PROVIDER_LABEL[p] ?? p
}

/** 면적 표기: 1만 ㎡ 미만 → ㎡, 1㎢ 미만 → ha(2자리), 그 이상 → ㎢(2자리). 값이 없으면 '—' */
export function formatAreaCompact(m2: number | null): { value: string; unit: string } {
    if (m2 === null || !Number.isFinite(m2)) return { value: '—', unit: '' }
    const a = Math.max(0, m2)
    if (a < 10_000) return { value: formatCount(a), unit: '㎡' }
    if (a < 1_000_000) return { value: fixed2(a / 10_000), unit: 'ha' }
    return { value: fixed2(a / 1_000_000), unit: '㎢' }
}

export function formatAreaText(m2: number | null): string {
    const f = formatAreaCompact(m2)
    return f.unit ? f.value + ' ' + f.unit : f.value
}

function fixed2(n: number): string {
    const s = n.toFixed(2)
    const [i, d] = s.split('.')
    return formatCount(Number(i)) + '.' + d
}

export function formatLengthText(m: number | null): string {
    if (m === null || !Number.isFinite(m)) return '—'
    return m >= 1000 ? fixed2(m / 1000) + ' km' : formatCount(m) + ' m'
}

/** 숫자 열 값(천 단위 쉼표, 소수는 최대 2자리). 값이 없으면 '—' */
export function formatStat(n: number | null): string {
    if (n === null || !Number.isFinite(n)) return '—'
    if (Number.isInteger(n)) return formatCount(n)
    const s = n.toFixed(2).replace(/\.?0+$/, '')
    const [i, d] = s.split('.')
    const ip = formatCount(Number(i))
    return (n < 0 && Number(i) === 0 ? '-' : '') + ip + (d ? '.' + d : '')
}

export function formatPercent(part: number, total: number): string {
    if (!(total > 0)) return '—'
    const p = (part / total) * 100
    return (p >= 99.95 || p === 0 ? p.toFixed(0) : p.toFixed(1)) + '%'
}

export type StatusTone = 'ok' | 'part' | 'run' | 'err' | 'cx'

export function statusView(r: LayerAnalysisResult): { label: string; tone: StatusTone } {
    switch (r.status) {
        case 'queued': return { label: '대기', tone: 'cx' }
        case 'counting': return { label: '확인 중', tone: 'run' }
        case 'loading': return { label: '받는 중', tone: 'run' }
        case 'computing': return { label: '계산 중', tone: 'run' }
        case 'confirm': return { label: '확인 필요', tone: 'part' }
        case 'partial': return { label: '일부만', tone: 'part' }
        case 'error': return { label: '오류', tone: 'err' }
        case 'cancelled': return { label: '취소됨', tone: 'cx' }
        default: return r.offMap ? { label: '꺼짐', tone: 'cx' } : { label: '완료', tone: 'ok' }
    }
}

/** 이 결과 카드의 단위 이름: 면 피처 중심이면 '건' */
export function countLabel(r: LayerAnalysisResult): string {
    const { polygon, line, point } = r.byKind
    if (polygon > 0 && line === 0 && point === 0) return '면'
    if (line > 0 && polygon === 0 && point === 0) return '선'
    if (point > 0 && polygon === 0 && line === 0) return '점'
    return '피처'
}

export function kindSummary(r: LayerAnalysisResult): string {
    const parts: string[] = []
    if (r.byKind.polygon > 0) parts.push('면 ' + formatCount(r.byKind.polygon))
    if (r.byKind.line > 0) parts.push('선 ' + formatCount(r.byKind.line))
    if (r.byKind.point > 0) parts.push('점 ' + formatCount(r.byKind.point))
    return parts.join(' · ')
}

export interface CategoryRowView {
    key: string
    label: string
    count: number
    areaText: string
    ratioText: string
    /** 막대 길이(0~100, 가장 큰 행이 100) */
    bar: number
    tone: 'row' | 'other' | 'blank'
    /** 줄 class('' = 기본) */
    rowClass: string
}

/** 범주표 줄들: 비율 = 잘라낸 면적(없으면 개수) 기준. 합계 줄은 따로(categoryTotal) */
export function categoryRows(r: LayerAnalysisResult, c: CategoryResult): CategoryRowView[] {
    const useArea = r.clipAreaM2 !== null && r.clipAreaM2 > 0
    const weight = (count: number, area: number | null): number => (useArea ? (area ?? 0) : count)
    const total = useArea ? (r.clipAreaM2 as number) : r.count
    const out: CategoryRowView[] = []
    const max = Math.max(1, ...c.rows.map(x => weight(x.count, x.clipAreaM2)), weight(c.other.count, c.other.clipAreaM2), weight(c.blank.count, c.blank.clipAreaM2))
    const add = (key: string, label: string, count: number, area: number | null, tone: CategoryRowView['tone']): void => {
        out.push({
            key, label, count, areaText: area === null ? '—' : formatAreaText(area), ratioText: formatPercent(weight(count, area), total),
            bar: Math.round((weight(count, area) / max) * 100), tone, rowClass: tone === 'other' ? 'gm-is-other' : tone === 'blank' ? 'gm-is-blank' : '',
        })
    }
    c.rows.forEach((x, i) => add('r' + i, x.value, x.count, x.clipAreaM2, 'row'))
    if (c.other.count > 0) add('other', '기타 ' + c.other.kinds + '종', c.other.count, c.other.clipAreaM2, 'other')
    if (c.blank.count > 0) add('blank', '(빈 값)', c.blank.count, c.blank.clipAreaM2, 'blank')
    return out
}

/** 범주 열로 고를 수 있는 열: 전부(숫자 열 포함 — 값이 같은 것끼리 센다) */
export function categoryOptions(r: LayerAnalysisResult): Array<{ value: string; label: string }> {
    return r.columns.map(c => ({ value: c.name, label: c.label }))
}

export function numericHeaderNote(n: NumericColumnStats): string {
    const bits: string[] = []
    if (n.nonNumeric > 0) bits.push('숫자 아님 ' + formatCount(n.nonNumeric))
    if (n.blank > 0) bits.push('빈 값 ' + formatCount(n.blank))
    return bits.join(' · ')
}

export function shapeLabel(shape: AreaShape): string {
    return shape === 'polygon' ? '다각형' : shape === 'box' ? '사각형' : shape === 'circle' ? '원' : shape === 'extent' ? '현재 화면' : '직접 지정'
}

/** 내보내기 파일 이름: 레이어이름_영역분석_YYYYMMDD.확장자 (파일에 못 쓰는 글자는 _) */
export function exportFileName(layerName: string, ext: 'csv' | 'geojson', now: Date): string {
    const safe = layerName.replace(/[\\/:*?"<>|\s]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40) || 'layer'
    const p = (n: number): string => String(n).padStart(2, '0')
    return safe + '_영역분석_' + now.getFullYear() + p(now.getMonth() + 1) + p(now.getDate()) + '.' + ext
}

/** 진행 중 카드의 안내 문구(상태별) */
export function progressNote(r: LayerAnalysisResult): string {
    if (r.status === 'confirm') return '아래 확인에 답하면 이어서 받습니다'
    if (r.status === 'counting') return '질의 가능 여부와 건수를 확인하는 중'
    if (r.status === 'loading') return '서버에서 영역에 걸친 피처를 받는 중' + (r.total !== null ? ' (전체 ' + formatCount(r.total) + '건)' : '')
    return '잘라낸 면적 계산 중 · 지도를 계속 움직여도 됩니다'
}

/** 결과 목록에 보이는 속성 열 상한(그 이상은 내보내기에서) */
export const LIST_MAX_COLUMNS = 30

export function listColumns(r: LayerAnalysisResult): AreaAnalysisColumn[] {
    return r.columns.slice(0, LIST_MAX_COLUMNS)
}

/** 사전 확인 문구들(패널 안 — 브라우저 대화상자를 쓰지 않는다) */
export function confirmLines(c: AreaConfirm): string[] {
    const lines: string[] = []
    for (const it of c.items) lines.push(it.name + ': 예상 ' + formatCount(it.expected) + '건 — 상한 ' + formatCount(it.limit) + '건까지만 집계합니다.')
    if (c.overAreaLimit) lines.push('영역이 ' + c.areaKm2.toFixed(1) + ' ㎢로 넓습니다(경고 기준 ' + formatCount(c.areaWarnKm2) + ' ㎢). 서버 요청이 많아질 수 있습니다.')
    return lines
}
