import type { LayerGroupMember, LayerGroupMemberRef } from './types'

// 수정 모드: 편집 전(GeoServer에서 읽은 원본)과 편집 후를 비교해 변경 요약을 만드는 순수 함수.
// 2단계(수정 화면)에서 쓴다. 순서 방향은 API와 같다(0 = 맨 위 줄 = 먼저 그림).

export interface EditSnapshot {
    title: string
    description: string
    mode: string
    members: LayerGroupMemberRef[]
}

export interface DiffSummary {
    added: number
    removed: number
    /** 구성(추가·빼기)은 그대로인데 순서만 다름 — 추가·빼기가 있으면 순서 비교는 남은 것끼리 한다 */
    reordered: boolean
    titleChanged: boolean
    descriptionChanged: boolean
    modeChanged: boolean
    /** 레이어 구성(무엇이 들었는지)이 바뀜 — 저장할 때 영역을 다시 계산한다 */
    layersChanged: boolean
    hasChange: boolean
}

function key(m: { type: string; name: string }): string {
    return `${m.type}|${m.name}`
}

function countBy(list: readonly { type: string; name: string }[]): Map<string, number> {
    const map = new Map<string, number>()
    for (const m of list) map.set(key(m), (map.get(key(m)) ?? 0) + 1)
    return map
}

/** 원본 상세의 멤버를 편집용 참조 목록으로. 모르는 type은 화면 진입 전에 막으므로(types.ts frontBlockedReason) 여기까지 오지 않는다 */
export function toRefs(members: readonly LayerGroupMember[]): LayerGroupMemberRef[] {
    return members.map(m => ({ type: m.type === 'layerGroup' ? 'layerGroup' : 'layer', name: m.name }))
}

/** 같은 (type, name)이 앞에서부터 n번째인지까지 구분해 비교용 열쇠로 — 순서 비교에서 중복 멤버를 안전하게 다룬다 */
function orderedKeys(list: readonly { type: string; name: string }[], keep: Map<string, number>): string[] {
    const seen = new Map<string, number>()
    const out: string[] = []
    for (const m of list) {
        const k = key(m)
        const n = (seen.get(k) ?? 0) + 1
        seen.set(k, n)
        if (n <= (keep.get(k) ?? 0)) out.push(`${k}#${n}`)
    }
    return out
}

export function diffEdit(original: EditSnapshot, current: EditSnapshot): DiffSummary {
    const before = countBy(original.members)
    const after = countBy(current.members)
    let added = 0
    let removed = 0
    const all = new Set([...before.keys(), ...after.keys()])
    all.forEach(k => {
        const b = before.get(k) ?? 0
        const a = after.get(k) ?? 0
        if (a > b) added += a - b
        if (b > a) removed += b - a
    })

    // 남은 멤버(양쪽에 다 있는 것)끼리만 순서를 비교한다
    const common = new Map<string, number>()
    all.forEach(k => common.set(k, Math.min(before.get(k) ?? 0, after.get(k) ?? 0)))
    const a = orderedKeys(original.members, common)
    const b = orderedKeys(current.members, common)
    const reordered = a.length !== b.length || a.some((v, i) => v !== b[i])

    const titleChanged = original.title !== current.title
    const descriptionChanged = original.description !== current.description
    const modeChanged = original.mode !== current.mode
    const layersChanged = added > 0 || removed > 0
    return {
        added, removed, reordered, titleChanged, descriptionChanged, modeChanged, layersChanged,
        hasChange: layersChanged || reordered || titleChanged || descriptionChanged || modeChanged,
    }
}

/** "추가 2 · 빼기 1 · 순서 바뀜 · 제목 바뀜" — 바뀐 것이 없으면 '바뀐 것 없음' */
export function summaryParts(d: DiffSummary): string[] {
    const parts: string[] = []
    if (d.added > 0) parts.push(`추가 ${d.added}`)
    if (d.removed > 0) parts.push(`빼기 ${d.removed}`)
    if (d.reordered) parts.push('순서 바뀜')
    if (d.titleChanged) parts.push('제목 바뀜')
    if (d.descriptionChanged) parts.push('설명 바뀜')
    if (d.modeChanged) parts.push('방식 바뀜')
    return parts.length > 0 ? parts : ['바뀐 것 없음']
}
