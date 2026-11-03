// 필지 정보 카드의 표기 순수 함수(React 없음 — 시험 대상). 숫자·날짜·요약 줄·동 목록 줄임·상태 문구.
import type { ParcelAddressGroup, ParcelBuildingsResult, ParcelBuildingsStatus, ParcelInfo, ParcelInfoState } from '../../core'
import { jimokName } from '../../core'

export const PARCEL_TITLE = '필지 정보'
/** 카드(좁은 자리)에 펼쳐 보이는 주소 묶음 수 — 넘으면 "외 N개 주소 — 전체 보기" */
export const CARD_GROUP_LIMIT = 3
/** 한 묶음의 동 이름을 몇 개까지 적나 */
export const DONG_NAME_LIMIT = 3

function group3(n: number): string {
    return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}

/** 1,055,000 원/㎡ — 값이 없으면 null */
export function formatPrice(price: number | null): string | null {
    if (price === null || !Number.isFinite(price) || price <= 0) return null
    return group3(Math.round(price)) + ' 원/㎡'
}

/** 21,384.6 ㎡(소수 1자리) — 값이 없으면 null */
export function formatParcelArea(m2: number | null): string | null {
    if (m2 === null || !Number.isFinite(m2) || m2 < 0) return null
    const fixed = m2.toFixed(1)
    const dot = fixed.indexOf('.')
    return group3(Number(fixed.slice(0, dot))) + fixed.slice(dot) + ' ㎡'
}

/** "2026년 1월 고시" / 월이 없으면 "2026년 고시" / 둘 다 없으면 null */
export function formatPriceDate(year: string | null, month: string | null): string | null {
    const y = year ? year.trim() : ''
    if (!/^\d{4}$/.test(y)) return null
    const m = month ? Number.parseInt(month, 10) : NaN
    return Number.isFinite(m) && m >= 1 && m <= 12 ? `${y}년 ${m}월 고시` : `${y}년 고시`
}

/** "지번 + 지목 칩" 의 지번: 주소가 없을 때의 머리줄 */
export function lotLabel(info: ParcelInfo): string {
    return info.lotNumber ?? ''
}

/** "반곡동 708", "금산리 산 12-3" — 주소 끝의 지번 앞 한 덩어리(동·리)와 지번. 못 가리면 주소·지번·PNU 순 */
export function shortAddress(info: ParcelInfo): string {
    const address = info.address ? info.address.trim() : ''
    const lot = info.lotNumber ? info.lotNumber.trim() : ''
    if (address && lot && address.endsWith(lot)) {
        const head = address.slice(0, address.length - lot.length).trim()
        const name = head ? head.slice(head.lastIndexOf(' ') + 1) : ''
        return name ? `${name} ${lot}` : lot
    }
    return address || lot || info.pnu
}

/** 지목 칩 글자: "대" 약어 · 정식 명칭이 다르면 "도 · 도로" — 지목이 없으면 null */
export function jimokText(jimok: string | null): { abbr: string; name: string } | null {
    const abbr = jimok ? jimok.trim() : ''
    if (!abbr) return null
    return { abbr, name: jimokName(abbr) ?? abbr }
}

/** 한 묶음의 동 이름 줄: "101동, 102동, 103동 외 22개 동". 이름이 하나도 없으면 null */
export function dongLine(group: ParcelAddressGroup): string | null {
    const names = group.buildings.map(b => (b.detailName ? b.detailName.trim() : '')).filter(n => n !== '')
    if (names.length === 0) return null
    if (names.length <= DONG_NAME_LIMIT) return names.join(', ')
    return `${names.slice(0, DONG_NAME_LIMIT).join(', ')} 외 ${group.buildings.length - DONG_NAME_LIMIT}개 동`
}

/** 묶음 메타 줄: "기초구역 30145 · 25동" (돌려받은 건물 수 기준) */
export function groupMeta(group: ParcelAddressGroup): string {
    const parts: string[] = []
    if (group.zipCode) parts.push(`기초구역 ${group.zipCode}`)
    parts.push(`${group.buildings.length}동`)
    return parts.join(' · ')
}

/** 건물 칸 머리: "건물 27" */
export function buildingCountText(result: ParcelBuildingsResult | null): string {
    return result ? `건물 ${group3(result.buildingCount)}` : '건물'
}

/** 카드에 펼칠 묶음과 숨은 묶음 수 */
export function splitGroups(groups: readonly ParcelAddressGroup[]): { shown: ParcelAddressGroup[]; hidden: number } {
    return { shown: groups.slice(0, CARD_GROUP_LIMIT), hidden: Math.max(0, groups.length - CARD_GROUP_LIMIT) }
}

/** 바닥 안내: "대표지번 기준 · 건물DB 2026-09" (관련지번까지 찾았으면 "대표·관련지번 기준") */
export function footText(result: ParcelBuildingsResult | null): string {
    const basis = result?.relatedIncluded ? '대표·관련지번 기준' : '대표지번 기준'
    return result?.referenceVersion ? `${basis} · 건물DB ${result.referenceVersion}` : basis
}

/** 접힌 한 줄: "반곡동 708 · 대 · 21,384.6㎡ · 건물 27" — 값이 없는 조각은 뺀다 */
export function summaryLine(state: ParcelInfoState): string {
    const { parcel, buildings } = state
    if (parcel.status === 'loading') return '필지를 불러오는 중…'
    if (parcel.status === 'none') return '필지 없음'
    if (parcel.status === 'error' || !parcel.info) return '불러오지 못했습니다'
    const parts: string[] = [shortAddress(parcel.info)]
    const jimok = jimokText(parcel.info.jimok)
    if (jimok) parts.push(jimok.abbr)
    const area = formatParcelArea(parcel.areaM2)
    if (area) parts.push(area.replace(' ㎡', '㎡'))
    if (buildings.status === 'ready' && buildings.result) parts.push(buildingCountText(buildings.result))
    return parts.join(' · ')
}

export const BUILDINGS_STATE_TEXT: Readonly<Record<Exclude<ParcelBuildingsStatus, 'off' | 'loading' | 'ready' | 'unsupported'>, string>> = Object.freeze({
    unavailable: '건물 자료가 아직 준비되지 않았습니다(서버 점검 중일 수 있습니다).',
    unauthorized: '로그인이 필요합니다. 다시 로그인한 뒤 눌러 보세요.',
    error: '건물 정보를 불러오지 못했습니다.',
})

export const NO_PARCEL_TEXT = '이 지점에는 필지가 없습니다.'
export const NO_BUILDING_TEXT = '이 필지에 등록된 건물이 없습니다.'
export const AREA_NOTE = '지도 도형 기준 · 토지대장과 다를 수 있음'

/** 전체 보기 대화상자 검색: 주소·이름·동·건물관리번호에 질의어(공백 무시·대소문자 무시)가 들어 있는 묶음만, 묶음 안에서도 맞는 건물만 */
export function filterGroups(groups: readonly ParcelAddressGroup[], query: string): ParcelAddressGroup[] {
    const q = query.replace(/\s+/g, '').toLowerCase()
    if (!q) return groups.slice()
    const has = (t: string | null): boolean => !!t && t.replace(/\s+/g, '').toLowerCase().includes(q)
    const out: ParcelAddressGroup[] = []
    for (const g of groups) {
        if (has(g.roadAddress) || has(g.name) || has(g.zipCode)) {
            out.push(g)
            continue
        }
        const hit = g.buildings.filter(b => has(b.detailName) || has(b.name) || has(b.sggName) || has(b.id))
        if (hit.length > 0) out.push({ ...g, buildings: hit })
    }
    return out
}

/** 대화상자 머리의 건수 문구: "27동" 또는 잘렸으면 "1,000동 표시 (전체 1,234동)" */
export function dialogCountText(result: ParcelBuildingsResult, shown: number): string {
    return result.truncated ? `${group3(shown)}동 표시 (전체 ${group3(result.buildingCount)}동)` : `${group3(result.buildingCount)}동`
}
