// 지목 28종(공간정보의 구축 및 관리 등에 관한 법률 시행령 제58조). 지적도의 지목 부호(같은 법 시행규칙 제64조)는 이름의 첫 글자지만
// 장(공장용지)·차(주차장)·천(하천)·원(유원지)은 예외라서 부호 → 정식 명칭 표를 따로 둔다. 표에 없는 글자는 그대로 돌려준다.

export const JIMOK_NAMES: Readonly<Record<string, string>> = Object.freeze({
    '전': '전',
    '답': '답',
    '과': '과수원',
    '목': '목장용지',
    '임': '임야',
    '광': '광천지',
    '염': '염전',
    '대': '대',
    '장': '공장용지',
    '학': '학교용지',
    '차': '주차장',
    '주': '주유소용지',
    '창': '창고용지',
    '도': '도로',
    '철': '철도용지',
    '제': '제방',
    '천': '하천',
    '구': '구거',
    '유': '유지',
    '양': '양어장',
    '수': '수도용지',
    '공': '공원',
    '체': '체육용지',
    '원': '유원지',
    '종': '종교용지',
    '사': '사적지',
    '묘': '묘지',
    '잡': '잡종지',
})

/** 지목 부호(한 글자) → 정식 명칭. 없거나 비면 null, 모르는 글자는 그대로 */
export function jimokName(abbr: string | null | undefined): string | null {
    if (abbr == null) return null
    const key = abbr.trim()
    if (key === '') return null
    return Object.prototype.hasOwnProperty.call(JIMOK_NAMES, key) ? JIMOK_NAMES[key] : key
}
