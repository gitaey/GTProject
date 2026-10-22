// 공유 화면의 순수 함수(React·DOM 없음) — 입력 정리·중복 제거·본인 제외·합계 검사·그룹 묶기·일괄 결과 문구.
// 서버도 같은 규칙으로 다시 검사한다(화면은 빠른 안내용).
import type { BulkShareResult, ShareChange, ShareEntryState, ShareGroup, ShareSnapshot } from '../../core'

/** 한 번에 공유할 수 있는 대상(사용자+그룹) 합계 한도(서버 한도와 같음) */
export const SHARE_MAX_TARGETS = 100
/** 일괄 공유로 한 번에 고를 수 있는 레이어 수(서버 한도와 같음) */
export const SHARE_MAX_ITEMS = 50
/** 사용자 검색을 시작하는 최소 글자 수 */
export const SHARE_MIN_QUERY = 2
/** 사용자 검색 입력 최대 글자 수(서버 한도) */
export const SHARE_MAX_QUERY = 50

/** 화면이 들고 있는 사용자 한 명(칩) */
export interface ShareUserEntry {
    userId: string
    name: string | null
    state: ShareEntryState
    /** 검색 결과에서 온 소속(칩 보조 글씨) */
    groupLabel?: string | null
}

/** trim → 빈 값 제거 → 중복 제거(처음 순서 유지) */
export function uniqueTrimmed(values: readonly string[]): string[] {
    const seen = new Set<string>()
    const out: string[] = []
    for (const v of values) {
        const t = v.trim()
        if (t === '' || seen.has(t)) continue
        seen.add(t)
        out.push(t)
    }
    return out
}

/** 직접 입력 칸의 글(콤마·공백·줄바꿈으로 구분)을 낱개로 */
export function parseDirectInput(text: string): string[] {
    return uniqueTrimmed(text.split(/[\s,;]+/))
}

/** 서버로 보낼 값: 정리·중복 제거, 본인 아이디는 뺀다(서버도 조용히 뺀다) */
export function cleanChange(change: ShareChange, selfUserId?: string | null): ShareChange {
    const self = selfUserId?.trim() ?? ''
    return {
        userIds: uniqueTrimmed(change.userIds).filter(id => id !== self),
        roleCodes: uniqueTrimmed(change.roleCodes),
    }
}

export function countTargets(change: ShareChange): number {
    return change.userIds.length + change.roleCodes.length
}

/** 저장 전 검사. 문제가 없으면 null */
export function validateChange(change: ShareChange, opts: { requireTarget?: boolean } = {}): string | null {
    const total = countTargets(change)
    if (opts.requireTarget && total === 0) return '공유 대상을 한 명 이상 고르세요.'
    if (total > SHARE_MAX_TARGETS) return `공유 대상은 ${SHARE_MAX_TARGETS}개까지입니다.`
    return null
}

/** 검색어가 검색을 시작할 수 있는 길이인지(앞뒤 공백 제외 2~50자) */
export function queryLength(query: string): number {
    return query.trim().length
}

/** 사용자 칩 이름표: 이름이 있으면 `이름 (아이디)`, 없으면 아이디만 */
export function userDisplay(u: { userId: string; name: string | null }): string {
    return u.name ? `${u.name} (${u.userId})` : u.userId
}

export function stateBadge(state: ShareEntryState): string | null {
    if (state === 'INACTIVE') return '비활성'
    if (state === 'MISSING') return '없는 사용자'
    return null
}

/** 저장된 공유 → 화면의 사용자 칩 */
export function snapshotUsers(s: ShareSnapshot): ShareUserEntry[] {
    return s.users.map(u => ({ userId: u.userId, name: u.name, state: u.state }))
}

/** 화면의 사용자 칩 → 서버로 보낼 아이디(그대로, 정리는 cleanChange) */
export function entryIds(entries: readonly ShareUserEntry[]): string[] {
    return entries.map(e => e.userId)
}

// ── 그룹(역할 + 세부권한) ──

export interface ShareGroupNode {
    group: ShareGroup
    children: ShareGroup[]
}

/**
 * 역할(parentCode 없음) 아래에 세부권한을 묶는다. 서버가 준 순서를 지킨다.
 * 소속 역할이 목록에 없는 세부권한은 맨 위 항목으로 올린다(숨기지 않는다)
 */
export function buildGroupTree(groups: readonly ShareGroup[]): ShareGroupNode[] {
    const codes = new Set(groups.map(g => g.code))
    const nodes: ShareGroupNode[] = []
    const byCode = new Map<string, ShareGroupNode>()
    for (const g of groups) {
        if (g.parentCode && codes.has(g.parentCode)) continue
        const node: ShareGroupNode = { group: g, children: [] }
        nodes.push(node)
        byCode.set(g.code, node)
    }
    for (const g of groups) {
        if (!g.parentCode) continue
        byCode.get(g.parentCode)?.children.push(g)
    }
    return nodes
}

/** 이름으로 걸러보기(코드도 함께 본다). 역할은 자기나 자식 중 하나라도 맞으면 남는다 */
export function filterGroupTree(tree: readonly ShareGroupNode[], filter: string): ShareGroupNode[] {
    const f = filter.trim().toLowerCase()
    if (f === '') return tree.slice()
    const hit = (g: ShareGroup) => g.label.toLowerCase().includes(f) || g.code.toLowerCase().includes(f)
    const out: ShareGroupNode[] = []
    for (const node of tree) {
        if (hit(node.group)) out.push(node)
        else {
            const kids = node.children.filter(hit)
            if (kids.length > 0) out.push({ group: node.group, children: kids })
        }
    }
    return out
}

/** 그룹 목록에 없는 선택값(옛 코드·삭제된 역할) */
export function unlistedCodes(selected: readonly string[], groups: readonly ShareGroup[]): string[] {
    const listed = new Set(groups.map(g => g.code))
    return selected.filter(c => !listed.has(c))
}

// ── 일괄 ──

export interface BulkCurrent {
    users: Array<{ userId: string; name: string | null; state: ShareEntryState; count: number }>
    roles: Array<{ code: string; label: string | null; state: ShareEntryState; count: number }>
}

/** 여러 레이어의 현재 공유를 하나로 합친다(같은 대상이 몇 개 레이어에 있는지 센다). 처음 나온 순서 유지 */
export function mergeSnapshots(snapshots: readonly ShareSnapshot[]): BulkCurrent {
    const users = new Map<string, BulkCurrent['users'][number]>()
    const roles = new Map<string, BulkCurrent['roles'][number]>()
    for (const s of snapshots) {
        for (const u of s.users) {
            const cur = users.get(u.userId)
            if (cur) { cur.count++; cur.name = cur.name ?? u.name } else users.set(u.userId, { ...u, count: 1 })
        }
        for (const r of s.roles) {
            const cur = roles.get(r.code)
            if (cur) { cur.count++; cur.label = cur.label ?? r.label } else roles.set(r.code, { ...r, count: 1 })
        }
    }
    return { users: Array.from(users.values()), roles: Array.from(roles.values()) }
}

export const BULK_FAIL_REASON: Readonly<Record<string, string>> = Object.freeze({
    NOT_AVAILABLE: '삭제되었거나 권한이 없습니다',
    LIMIT_EXCEEDED: `공유 대상이 ${SHARE_MAX_TARGETS}개를 넘어 건너뛰었습니다`,
})

export function failReason(reason: string): string {
    return BULK_FAIL_REASON[reason] ?? '처리하지 못했습니다'
}

/** `성공 n · 실패 m` */
export function bulkSummary(result: BulkShareResult): string {
    return `성공 ${result.succeededIds.length} · 실패 ${result.failed.length}`
}
