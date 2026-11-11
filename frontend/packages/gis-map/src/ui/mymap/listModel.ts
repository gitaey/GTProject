// 나만의지도 패널 목록의 판단 규칙(순수 함수 — React·DOM과 무관). 행을 어떻게 그릴지·누를 수 있는지·검색·한도 문구·
// "처음 등록했을 때 결과 창을 한 번만 띄울 대상"을 정한다.
// 목록 행에는 실패 개수·실패 사유를 적지 않는다(처리 실패는 "등록하지 못했습니다", 전부 못 찾은 레이어는 "지도에 표시할 위치가 없습니다"만).
// 자세한 건수·사유는 업로드 결과 창에서 본다.
import { defaultMyMapStyle, parseMyMapStyle } from '../../core'
import type { UserMapListItem } from '../../core'
import { countLabel, formatCount, kindLabel, processingVerb } from './format'
import { isExcelItem } from './itemMenuModel'

/** 목록 전체(내 것 + 공유받은 것)가 이 개수 이상일 때만 검색창을 보인다 */
export const SEARCH_MIN_ITEMS = 8

export type RowPhase = 'ready' | 'empty' | 'processing' | 'failed'

export interface RowCtx {
    /** 선택 모드(일괄 공유) 중인가 */
    selecting: boolean
    /** 지도에 켜져 있는가(체크) */
    active: boolean
    /** 지도에 그리는 중(받기 → 피처 변환) */
    mapLoading: boolean
    /** 변환 진행률 0~100, 모르면 null */
    mapLoadPct: number | null
    /** 묶음(원 + 숫자)으로 그리는 중 */
    mapClustered: boolean
}

export interface RowView {
    phase: RowPhase
    /** 종류 칩 글자(SHP·PNU·주소·좌표) */
    kind: string
    /** `필지 10개` — 처리 중·실패·표시할 위치 없음이면 null */
    countText: string | null
    /** 지도 표시 체크를 켤 수 있는가 */
    canToggle: boolean
    /** 위치로 이동을 보일 수 있는가 */
    canLocate: boolean
    /** 선택 모드에서 고를 수 있는가(내 레이어 + 처리 실패가 아님) */
    pickable: boolean
    /** 선택 모드에서 흐리게 보일 행(고를 수 없는 행) */
    dim: boolean
    /** 처리 중: 정보 줄 글자(`주소 찾는 중 24%`)와 아래 보조 줄 */
    processing: { text: string; sub: string; pct: number | null; done: number; total: number } | null
    /** 지도에 그리는 중 글자(`지도에 그리는 중 42%`) — 아니면 null */
    mapLoadingText: string | null
    /** 묶음 표시 칩을 보일까(그리는 중이 아닐 때) */
    clustered: boolean
    /** 처리 실패 — 정보 줄에 "등록하지 못했습니다" */
    failed: boolean
    /** 소유자의 `지우기` 단추(처리 실패 + 내 레이어 + 선택 모드 아님) */
    canDelete: boolean
    /** 상태 줄의 중립 문구(개수·사유 없음). 없으면 null */
    note: string | null
    /** 체크가 꺼져 있는 이유(비활성일 때의 title) */
    toggleHint: string | null
    /** 공유받은 레이어의 보낸 사람(`김가상 님`)·툴팁(`김가상(kim01)님이 공유`) */
    senderText: string | null
    senderTitle: string | null
    /** 내가 공유 중인 대상 수(0이면 안 보임) */
    shareCount: number
}

export const NOTE_NO_LOCATION = '지도에 표시할 위치가 없습니다'
export const NOTE_FAILED_NOT_SHAREABLE = '등록하지 못한 레이어는 공유할 수 없습니다'

/** 지도에 그릴 피처가 없는 끝난 레이어인가(전부 위치를 못 찾았거나 빈 파일). 건수·사유는 말하지 않는다 */
export function hasNoLocation(item: Pick<UserMapListItem, 'status' | 'featureCount' | 'matchedCount' | 'failedCount' | 'sourceKind' | 'sourceType'>): boolean {
    if (item.status !== 'READY') return false
    if ((item.featureCount ?? 0) <= 0) return true
    // 엑셀은 매칭된 행이 0이면 피처도 없다(SHP는 matchedCount를 안 쓰므로 보지 않는다)
    return isExcelItem(item) && item.matchedCount === 0 && (item.failedCount ?? 0) > 0
}

export function rowView(item: UserMapListItem, ctx: RowCtx): RowView {
    const processing = item.status === 'PROCESSING'
    const failed = item.status === 'FAILED'
    const empty = hasNoLocation(item)
    const phase: RowPhase = processing ? 'processing' : failed ? 'failed' : empty ? 'empty' : 'ready'
    const total = Math.max(0, item.progressTotal ?? 0)
    const done = Math.min(Math.max(0, item.progressDone ?? 0), total)
    const pct = processing && total > 0 ? Math.min(100, Math.floor((done / total) * 100)) : null
    const verb = processingVerb(item)
    const owner = item.owner
    const pickable = ctx.selecting && owner && !failed
    const sender = !owner ? (item.ownerName || item.ownerId || '') : ''
    const mapLoading = ctx.active && ctx.mapLoading
    // 상태 문구는 소유자 행에만(공유받은 사람은 고칠 수도 없다 — 공유받은 FAILED는 목록에서도 뺀다: splitItems)
    let note: string | null = null
    if (owner && empty) note = NOTE_NO_LOCATION
    else if (owner && failed && ctx.selecting) note = NOTE_FAILED_NOT_SHAREABLE
    return {
        phase,
        kind: kindLabel(item),
        countText: phase === 'ready' ? countLabel(item) : null,
        canToggle: phase === 'ready',
        canLocate: phase === 'ready',
        pickable,
        dim: ctx.selecting && !pickable,
        processing: processing
            ? {
                text: pct !== null ? `${verb} ${pct}%` : `${verb}…`,
                sub: total > 0 ? `${formatCount(done)} / ${formatCount(total)}행 · 패널을 닫아도 계속됩니다` : '패널을 닫아도 계속됩니다',
                pct, done, total,
            }
            : null,
        mapLoadingText: mapLoading ? (ctx.mapLoadPct !== null ? `지도에 그리는 중 ${ctx.mapLoadPct}%` : '지도에 그리는 중') : null,
        clustered: ctx.active && !ctx.mapLoading && ctx.mapClustered,
        failed: failed && owner,
        canDelete: failed && owner && !ctx.selecting,
        note,
        toggleHint: processing ? '처리가 끝나면 켤 수 있습니다' : owner && failed ? '등록하지 못한 레이어는 지도에 켤 수 없습니다' : owner && empty ? NOTE_NO_LOCATION : null,
        senderText: sender ? `${sender} 님` : null,
        senderTitle: sender ? (item.ownerName && item.ownerId ? `${item.ownerName}(${item.ownerId})님이 공유` : `${sender}님이 공유`) : null,
        shareCount: owner ? Math.max(0, item.shareCount ?? 0) : 0,
    }
}

// ── 검색 ──

/** 이름·보낸 사람(이름·아이디) 부분 일치(대소문자 무시, 앞뒤 공백 무시). 빈 검색어는 전부 맞다 */
export function matchesSearch(item: Pick<UserMapListItem, 'name' | 'ownerName' | 'ownerId'>, query: string): boolean {
    const q = query.trim().toLowerCase()
    if (!q) return true
    return [item.name, item.ownerName, item.ownerId].some(v => typeof v === 'string' && v.toLowerCase().includes(q))
}

export function shouldShowSearch(totalItems: number): boolean {
    return totalItems >= SEARCH_MIN_ITEMS
}

/** 검색으로 가려졌지만 지도에 켜 둔 레이어 수 */
export function hiddenActiveCount(all: readonly UserMapListItem[], shown: readonly UserMapListItem[], activeIds: ReadonlySet<number>): number {
    const shownIds = new Set(shown.map(i => i.id))
    return all.filter(i => activeIds.has(i.id) && !shownIds.has(i.id)).length
}

// ── 탭(내 레이어 / 공유받은 레이어) ──

/**
 * 목록을 두 탭으로 나눈다. 공유받은 레이어 중 처리 실패(FAILED)는 목록·건수에서 뺀다 —
 * 받는 사람은 이유를 보지도 고치지도 못하는 레이어라 "등록하지 못했습니다"를 보여 줄 이유가 없다(서버가 보내는 일도 거의 없다)
 */
export function splitItems(items: readonly UserMapListItem[]): { owned: UserMapListItem[]; shared: UserMapListItem[] } {
    return {
        owned: items.filter(i => i.owner),
        shared: items.filter(i => !i.owner && i.status !== 'FAILED'),
    }
}

export type ListTab = 'owned' | 'shared'

/** 처음 보여 줄 탭: 내 레이어. 내 레이어가 0개이고 공유받은 것만 있으면 공유받은 탭 */
export function defaultTab(ownedCount: number, sharedCount: number): ListTab {
    return ownedCount === 0 && sharedCount > 0 ? 'shared' : 'owned'
}

/** 지금 보이는 탭 — 사용자가 직접 고른 탭(chosen)이 있으면 그것, 없으면 기본 규칙 */
export function resolveTab(chosen: ListTab | null, ownedCount: number, sharedCount: number): ListTab {
    return chosen ?? defaultTab(ownedCount, sharedCount)
}

/** 한 탭의 목록 — 검색은 그 탭 안에서만 적용한다(탭 건수는 검색과 무관하게 전체) */
export function itemsForTab(items: readonly UserMapListItem[], tab: ListTab, query: string): UserMapListItem[] {
    const { owned, shared } = splitItems(items)
    return (tab === 'owned' ? owned : shared).filter(i => matchesSearch(i, query))
}

// ── 섹션 머리 · 한도 문구 ──

/** 내 레이어 섹션 오른쪽 글자. 한도를 모르면 개수만, 남은 개수가 3개 이하면 `18 / 20 · 2개 남음` */
export function quotaText(count: number, max: number | null): string {
    if (max === null) return formatCount(count)
    const base = `${formatCount(count)} / ${formatCount(max)}`
    const left = max - count
    return left > 0 && left <= 3 ? `${base} · ${formatCount(left)}개 남음` : base
}

/** 한도에 다 찼을 때 안내(등록하지 못한 레이어가 있으면 그것부터 지우라고 덧붙인다 — 개수는 적지 않는다) */
export function limitNoteText(max: number, hasFailed: boolean): string {
    const base = `레이어가 ${formatCount(max)}개로 가득 찼습니다. 안 쓰는 레이어를 지우면 다시 올릴 수 있습니다.`
    return hasFailed ? `${base} 등록하지 못한 레이어부터 지워 보세요.` : base
}

// ── 색 견본 ──

export interface Swatch {
    shape: 'square' | 'circle' | 'line'
    /** 비면 테마 기본색(스타일 설정이 없는 레이어). 값별·구간별이면 앞 3색 */
    colors: string[]
}

/** 이름 앞 색 견본(보기만) — 지도에 그려지는 색. 스타일 설정이 없으면 colors가 비어 테마 기본색을 쓴다 */
export function swatchOf(item: Pick<UserMapListItem, 'styleConfig' | 'geomType'>): Swatch {
    const g = (item.geomType ?? '').toUpperCase()
    const style = parseMyMapStyle(item.styleConfig, defaultMyMapStyle('').fill)
    const isLine = g.endsWith('LINESTRING')
    const isPoint = g.endsWith('POINT') || style?.display === 'point'
    const shape: Swatch['shape'] = isPoint ? 'circle' : isLine ? 'line' : 'square'
    if (!style) return { shape, colors: [] }
    const c = style.classify
    if (c) {
        const list = c.type === 'categorical' ? c.classes.map(x => x.color) : c.colors
        if (list.length > 0) return { shape, colors: list.slice(0, 3) }
    }
    const one = isPoint ? (style.pointColor ?? style.stroke) : isLine ? style.stroke : style.fill
    return { shape, colors: [one] }
}

// ── 처음 등록했을 때 결과 창을 한 번만 ──

/**
 * id를 모르는 업로드(SHP·옛 서버)에서 "방금 올린 내 레이어"를 찾는다 — 올리기 직전 목록(before)과 비교.
 * 가장 안전하게: 올리기 직전 목록을 **제대로 받아 둔 경우(beforeTrusted)에만** 비교하고(조회 실패·로딩 중이라 기준이 비어 있으면 아무것도 안 잡는다 —
 * 기존 레이어 전부가 새 레이어로 잡히는 사고 방지), 그것도 직전 최대 id보다 큰 내 레이어만 새 것으로 본다
 */
export function newOwnedIds(before: readonly UserMapListItem[], beforeTrusted: boolean, after: readonly UserMapListItem[]): number[] {
    if (!beforeTrusted) return []
    const known = new Set(before.map(i => i.id))
    const maxBefore = before.reduce((m, i) => Math.max(m, i.id), 0)
    return after.filter(i => i.owner && !known.has(i.id) && i.id > maxBefore).map(i => i.id)
}

export interface FreshPlanInput {
    /** 엔진이 기억하는 "방금 올린" 레이어 id(패널을 닫았다 열어도 남는다) */
    fresh: readonly number[]
    /** 이 패널을 연 뒤 이 화면에서 올린 id(목록에 아직 안 나왔을 수 있다) */
    mine: ReadonlySet<number>
    /** 이 패널을 연 뒤 처리 중으로 관찰한 id */
    seenProcessing: ReadonlySet<number>
    items: readonly UserMapListItem[]
    /** 끝난 항목의 결과 창을 열 수 있는가(itemMenuModel.canViewImportResult) */
    canOpen: (item: UserMapListItem) => boolean
}

export interface FreshPlan {
    /** 처리 중으로 처음 본 id — seenProcessing에 더한다 */
    seen: number[]
    /** 기억에서 지울 id(열 필요 없음: 패널이 닫힌 사이 끝났거나, 결과 창이 없거나, 사라졌다) */
    drop: number[]
    /** 결과 창을 열 후보(끝났고 이 패널이 끝나는 순간을 봤다). 여러 개면 open 하나만 열고 나머지는 조용히 지운다 */
    ready: number[]
    /** 열 하나 = ready 중 가장 최근(큰 id). 후보가 없으면 null */
    open: number | null
}

/**
 * 규칙: 처리가 끝나는 순간을 이 패널이 지켜봤거나(처리 중으로 보였다가 끝남) 이 패널에서 방금 올린 레이어만 연다.
 * 패널을 닫은 사이 끝난 레이어·새로고침·이미 올라가 있던 레이어는 열지 않는다(재등장 금지). 동시에 여러 건이 끝나면 가장 최근 하나만 연다.
 */
export function planFreshReports(input: FreshPlanInput): FreshPlan {
    const { fresh, mine, seenProcessing, items, canOpen } = input
    const seen: number[] = []
    const drop: number[] = []
    const ready: number[] = []
    for (const id of fresh) {
        const item = items.find(i => i.id === id)
        if (!item) {
            // 이 패널에서 방금 올렸다면 목록이 아직 안 받아졌을 수 있다 — 아니면 사라진 레이어
            if (!mine.has(id)) drop.push(id)
            continue
        }
        if (!item.owner) { drop.push(id); continue }
        if (item.status === 'PROCESSING') { seen.push(id); continue }
        if (mine.has(id) || seenProcessing.has(id)) {
            if (canOpen(item)) ready.push(id)
            else drop.push(id)
        } else drop.push(id)
    }
    return { seen, drop, ready, open: ready.length > 0 ? Math.max(...ready) : null }
}
