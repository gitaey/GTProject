// 설정 패널의 순수 함수: 날짜·요약·상태 문구·칩 계산(React 없음 — node로 시험한다).
import type { BasemapMode, GisDataInfoItem, GisMapStartView, StartViewState } from '../../core'

// ── 시작 화면 ─────────────────────────────────────────────────────────

/** 'YYYY-MM-DD HH:mm'(브라우저 시간대). 읽지 못하면 '' */
export function formatSavedAt(iso: string | null | undefined): string {
    if (!iso) return ''
    const t = new Date(iso)
    if (Number.isNaN(t.getTime())) return ''
    const p = (n: number): string => (n < 10 ? '0' + n : String(n))
    return t.getFullYear() + '-' + p(t.getMonth() + 1) + '-' + p(t.getDate()) + ' ' + p(t.getHours()) + ':' + p(t.getMinutes())
}

export function basemapLabel(mode: BasemapMode): string {
    return mode === 'satellite' ? '위성' : mode === 'none' ? '없음' : '일반'
}

export interface ScopeText {
    strong: string
    rest: string
}

/** 저장 위치 안내(저장소가 알려 준 scope로 문구가 바뀐다) */
export function scopeText(scope: 'account' | 'browser' | null): ScopeText {
    if (scope === 'browser') return { strong: '이 브라우저에 저장됩니다', rest: ' — 다른 PC·브라우저에서는 이 시작 화면이 보이지 않습니다.' }
    return { strong: '이 계정에 저장됩니다', rest: ' — 다른 PC·브라우저에서도 같은 화면으로 시작합니다.' }
}

export interface StartViewPaneSummary {
    index: number
    name: string
    /** '줌 15 · 일반' */
    detail: string
    /** 마우스를 올리면 보이는 좌표 */
    title: string
}

export interface StartViewSummary {
    /** '2026-11-09 14:20 저장 · 2분할 · 화면 연동 켬' */
    head: string
    panes: StartViewPaneSummary[]
}

function zoomText(zoom: number): string {
    return Number.isInteger(zoom) ? String(zoom) : zoom.toFixed(1)
}

/** 지역명이 "있는 값"인가(엔진 region 상태: '' = 모름, '-' = 결과 없음) */
export function usableRegionName(name: string | null | undefined): string | null {
    if (!name || name === '-') return null
    return name
}

/**
 * 요약. 지도 이름은 기본 '지도 N'. 지금 활성 지도의 지역명(regionName)은 **저장한 활성 지도의 위치와 같은 곳을 보고 있을 때만** 붙인다
 * (저장한 뒤 움직였다면 그 이름은 저장한 위치의 이름이 아니다). nearCurrent = 저장한 활성 지도 중심이 지금 활성 지도 중심과 같은 곳인가
 */
export function summarizeStartView(view: GisMapStartView, savedAt: string | null, regionName: string | null, nearCurrent: boolean): StartViewSummary {
    const when = formatSavedAt(savedAt ?? view.savedAt) || formatSavedAt(view.savedAt)
    const parts: string[] = [when ? when + ' 저장' : '저장됨']
    parts.push(view.split.count > 1 ? view.split.count + '분할' : '1분할')
    if (view.split.count > 1) parts.push('화면 연동 ' + (view.split.sync ? '켬' : '끔'))
    const region = usableRegionName(regionName)
    const panes = view.panes.map((p, i) => ({
        index: i + 1,
        name: i === view.split.activeIndex && region !== null && nearCurrent ? region : '지도 ' + (i + 1),
        detail: '줌 ' + zoomText(p.zoom) + ' · ' + basemapLabel(p.basemap),
        title: p.center[0].toFixed(4) + ', ' + p.center[1].toFixed(4),
    }))
    return { head: parts.join(' · '), panes }
}

/** 두 경위도가 같은 곳(약 100m 안)인가 */
export function samePlace(a: readonly [number, number], b: readonly [number, number]): boolean {
    return Math.abs(a[0] - b[0]) < 0.001 && Math.abs(a[1] - b[1]) < 0.001
}

export interface StartViewNotice {
    tone: 'error' | 'warn' | 'info'
    icon: 'clock' | 'alert' | 'database' | 'lock' | 'x'
    text: string
    /** 이 안내에 "다시 시도" 단추를 붙일 작업 */
    retry?: 'load' | 'save' | 'clear'
}

export interface StartViewCardModel {
    /** 카드를 아예 그리지 않는다(소스 없음·서버가 404) */
    hidden: boolean
    /** 회색 줄 자리표시 */
    loading: boolean
    notices: StartViewNotice[]
    /** 저장한 값 요약을 보인다 */
    showSummary: boolean
    /** 저장한 것이 없다는 안내 문장 */
    showEmpty: boolean
    /** 저장·덮어쓰기·기본값·시작 화면으로 단추를 그린다 */
    showButtons: boolean
    /** 저장·덮어쓰기·기본값 단추를 누를 수 있다(저장소 준비 중·요청 중이면 false) */
    canWrite: boolean
    /** [시작 화면으로]를 강조한다(늦게 받아 기본 위치로 열었다) */
    emphasizeGo: boolean
}

const LOGIN_EXPIRED = '로그인이 만료되었습니다. 다시 로그인한 뒤 시도하세요.'
const STORE_NOT_READY = '시작 화면 저장소가 아직 준비되지 않았습니다. 관리자에게 문의하세요. 지도는 기본 위치에서 정상으로 시작합니다.'

function reasonText(state: StartViewState): string {
    if (state.errorKind === 'timeout') return state.errorOp === 'save' || state.errorOp === 'clear' ? '서버 응답 없음 — 10초' : '서버 응답 없음 — 5초'
    return state.lastError ?? '알 수 없는 오류'
}

/** 카드 상태 표(F3)를 화면 모양으로. 같은 입력이면 같은 출력 */
export function startViewCardModel(state: StartViewState): StartViewCardModel {
    const base: StartViewCardModel = {
        hidden: false, loading: false, notices: [], showSummary: false, showEmpty: false, showButtons: false, canWrite: false, emphasizeGo: false,
    }
    if (state.status === 'unsupported') return { ...base, hidden: true }
    if (state.status === 'idle' || state.status === 'loading') return { ...base, loading: true }

    const notices: StartViewNotice[] = []
    const hasValue = state.value !== null
    let showButtons = true
    let canWrite = !state.saving
    let covered = false

    if (state.status === 'unavailable') {
        notices.push({ tone: 'warn', icon: 'database', text: STORE_NOT_READY })
        canWrite = false
        covered = true
    } else if (state.status === 'unauthorized') {
        notices.push({ tone: 'error', icon: 'lock', text: LOGIN_EXPIRED })
        covered = true
    } else if (state.status === 'timeout') {
        notices.push({ tone: 'error', icon: 'clock', text: '서버 응답이 늦어 시작 화면을 불러오지 못했습니다(5초). 지도는 기본 위치로 열었습니다.', retry: 'load' })
        showButtons = false
        covered = true
    } else if (state.status === 'error') {
        notices.push({ tone: 'error', icon: 'x', text: '시작 화면을 불러오지 못했습니다(' + (state.lastError ?? '알 수 없는 오류') + ').', retry: 'load' })
        showButtons = false
        covered = true
    } else if (state.invalid) {
        notices.push({ tone: 'error', icon: 'alert', text: '저장한 시작 화면을 읽지 못해 기본 위치로 시작했습니다. 다시 저장해 주세요.' })
    } else if (state.late && hasValue) {
        notices.push({ tone: 'info', icon: 'clock', text: '시작 화면을 늦게 받아 이번에는 기본 위치로 열었습니다.' })
    }

    // 저장·삭제 실패(이전 값은 그대로). 위에서 같은 이유를 이미 안내했으면 겹치지 않는다
    if (!covered && state.errorOp !== null && state.errorOp !== 'load') {
        if (state.errorKind === 'timeout') {
            notices.push({
                tone: 'error', icon: 'clock', retry: state.errorOp,
                text: (state.errorOp === 'save' ? '저장하지' : '지우지') + ' 못했습니다(서버 응답 없음 — 10초).' + (hasValue ? ' 이전에 저장한 시작 화면은 그대로입니다.' : ''),
            })
        } else {
            notices.push({
                tone: 'error', icon: 'x', retry: state.errorOp,
                text: (state.errorOp === 'save' ? '저장하지' : '지우지') + ' 못했습니다(' + reasonText(state) + ').' + (hasValue ? ' 이전에 저장한 시작 화면은 그대로입니다.' : ''),
            })
        }
    }

    return {
        ...base,
        notices,
        showSummary: hasValue,
        showEmpty: !hasValue && state.status === 'ready' && !state.invalid && notices.length === 0,
        showButtons,
        canWrite,
        emphasizeGo: state.late && hasValue,
    }
}

// ── 데이터 기준 정보 ────────────────────────────────────────────────────

export type DataInfoChipTone = 'warn' | 'info' | 'mute' | 'err'

export interface DataInfoChip {
    tone: DataInfoChipTone
    text: string
}

/** 상태 칩. 정상은 null(칩 없음), 정상이어도 오래됐으면 '오래됨' */
export function dataInfoChip(item: GisDataInfoItem): DataInfoChip | null {
    switch (item.status) {
        case 'updating': return { tone: 'info', text: '교체 중' }
        case 'partial': return { tone: 'warn', text: '일부만 적재' }
        case 'missing': return { tone: 'mute', text: '자료 없음' }
        case 'unavailable': return { tone: 'err', text: '읽지 못함' }
        default: return item.stale ? { tone: 'warn', text: '오래됨' } : null
    }
}

/** 기준 글자: '2026-09' · 여러 기준이 섞이면 '2026-08 ~ 09'(같은 해) · 없으면 '—' */
export function dataInfoVersion(item: GisDataInfoItem): string {
    const v = item.version
    if (!v) return '—'
    const latest = item.latestVersion
    if (!latest || latest === v) return v
    if (v.length >= 4 && latest.slice(0, 5) === v.slice(0, 5)) return v + ' ~ ' + latest.slice(5)
    return v + ' ~ ' + latest
}

/** 적재 일시 'YYYY-MM-DD HH:mm'. 읽지 못하면 '' */
export function formatLoadedAt(iso: string | null): string {
    return formatSavedAt(iso)
}

/** 항목 아래 작은 줄: '17/17 시도 · 매월 · 적재 2026-10-30 22:41' (없는 조각은 뺀다) */
export function dataInfoMeta(item: GisDataInfoItem): string {
    const parts: string[] = []
    if (item.coverage) parts.push(item.coverage.loaded + '/' + item.coverage.expected + ' 시도')
    if (item.updateCycle) parts.push(item.updateCycle)
    const loaded = formatLoadedAt(item.loadedAt)
    if (loaded) parts.push('적재 ' + loaded)
    return parts.join(' · ')
}

/** 일부만 적재일 때 설명 한 줄(지적도: 빠진 지역은 PNU 매칭이 안 된다). 아니면 null */
export function dataInfoPartialNote(item: GisDataInfoItem): string | null {
    if (item.status !== 'partial' || !item.coverage) return null
    return item.coverage.loaded + '/' + item.coverage.expected + ' 시도 적재 — 빠진 지역은 PNU 매칭이 되지 않습니다'
}

/** 오류 → 안내 문구 */
export function dataInfoErrorText(kind: 'unauthorized' | 'failed'): string {
    return kind === 'unauthorized'
        ? '로그인이 만료되었습니다. 다시 로그인한 뒤 [다시 불러오기]를 눌러 주세요.'
        : '불러오지 못했습니다. 잠시 뒤 [다시 시도]를 눌러 주세요.'
}
