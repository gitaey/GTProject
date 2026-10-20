// 나만의지도 화면 공용 글자 도우미(순수 함수·얼린 표). 전부 React·DOM과 무관하다.
import type { MyMapCoverage, MyMapSampleKind, UserMapListItem } from '../../core'

/** 천 단위 쉼표 정수('3,120'). 시스템 로캘에 따라 달라지지 않게 직접 만든다 */
export function formatCount(n: number): string {
    const r = Math.round(n)
    if (!Number.isFinite(r)) return '0'
    return String(r).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}

const KIND_LABELS: Readonly<Record<string, string>> = Object.freeze({
    SHP: 'SHP', EXCEL_PNU: 'PNU', EXCEL_ADDRESS: '주소', EXCEL_COORD: '좌표',
})

/** 종류 배지 글자. sourceKind가 없으면(옛 서버) 옛 화면처럼 sourceType 그대로('SHP'·'EXCEL') */
export function kindLabel(item: Pick<UserMapListItem, 'sourceKind' | 'sourceType'>): string {
    return (item.sourceKind ? KIND_LABELS[item.sourceKind] : undefined) ?? item.sourceType
}

/** 행 실패 사유 코드 → 화면 글자(설계 4.6). 모르는 코드는 코드 그대로 */
const REASON_LABELS: Readonly<Record<string, string>> = Object.freeze({
    EMPTY: '값이 비어 있습니다',
    PNU_NUMERIC_CELL: '숫자 서식이라 PNU가 바뀌었습니다(텍스트 서식으로)',
    PNU_EXP_NOTATION: '지수 표기로 바뀐 PNU입니다',
    PNU_FORMAT: 'PNU가 19자리가 아닙니다',
    PARSE_FAILED: '주소 형식을 알 수 없습니다',
    SIDO_UNKNOWN: '시도를 모릅니다',
    LEGAL_DONG_NOT_FOUND: '법정동을 찾지 못했습니다',
    JIBUN_MISSING: '번지가 없습니다',
    ROAD_NOT_FOUND: '도로명을 찾지 못했습니다',
    BUILDING_NO_NOT_FOUND: '건물번호를 찾지 못했습니다',
    AMBIGUOUS: '후보가 여러 개입니다(시도·시군구를 붙여 주세요)',
    OUT_OF_COVERAGE: '이 지역 지적도는 아직 제공하지 않습니다',
    PARCEL_NOT_FOUND: '지적도에 없는 필지입니다',
    COORD_INVALID: '좌표를 읽을 수 없습니다',
    COORD_OUT_OF_RANGE: '한국 범위를 벗어납니다',
    ROW_LIMIT: '한도를 넘는 행입니다',
})

export function reasonLabel(code: string): string {
    return REASON_LABELS[code] ?? code
}

/** 시도코드 → 이름(제공 지역 표시용, 현행 코드) */
const SIDO_NAMES: Readonly<Record<string, string>> = Object.freeze({
    '11': '서울', '26': '부산', '27': '대구', '28': '인천', '29': '광주', '30': '대전', '31': '울산', '36': '세종',
    '41': '경기', '43': '충북', '44': '충남', '46': '전남', '47': '경북', '48': '경남', '50': '제주', '51': '강원', '52': '전북',
    '12': '전남광주', '42': '강원(옛)', '45': '전북(옛)',
})

export function sidoName(code: string): string {
    return SIDO_NAMES[code] ?? code
}

/** "전국" 기준 시도 수(서버 `mymap.ref.expected-sido-codes` 기본 = 현행 16개: 11 12 26 27 28 30 31 36 41 43 44 47 48 50 51 52). "일부 시도(n/16)" 표시에만 쓴다 */
export const NATIONAL_SIDO_COUNT = 16

export interface CoverageNote {
    /** 업로드 창에 보여 줄 한 줄. 자료가 없으면 null */
    text: string | null
    /** 적재된 자료가 없다(또는 제한 지역에 하나도 없다) */
    missing: boolean
    /** 전국이 아니라 일부 시도만 적재돼 있다 — 범위 밖 PNU는 매칭되지 않는다 */
    partial: boolean
    /** 마우스를 올리면 보이는 전체 시도 이름(많을 때) */
    title: string | null
}

/**
 * 한도 응답의 coverage → 업로드 창 문구.
 *  · 새 서버(`nationwide` 있음): sidoCodes = 실제 적재된 시도(**빈 배열은 전국이 아니다** — 자료 준비 중). nationwide면 "지적도 기준월 v(전국)",
 *    아니면 "제공 지역: 세종 · 기준월 v"(시도 4개 이상은 "일부 시도(n/16)"), 하나도 없으면 자료 없음. 지역 제한 지역 중 적재 안 된 곳이 있으면 일부로 본다
 *  · 옛 서버(`nationwide` 없음): sidoCodes = 지역 제한 설정값 — 비면 "(전국)", 있으면 "(제공 지역: …)"
 */
export function describeCoverage(c: MyMapCoverage | null | undefined): CoverageNote {
    if (!c) return { text: null, missing: false, partial: false, title: null }
    const version = c.parcelVersion
    if (!version) return { text: null, missing: true, partial: false, title: null }
    const base = `지적도 기준월 ${version}`
    if (c.nationwide === undefined) {
        const allowed = c.sidoCodes ?? []
        return { text: `${base}(${allowed.length === 0 ? '전국' : `제공 지역: ${allowed.map(sidoName).join('·')}`})`, missing: false, partial: false, title: null }
    }
    const loaded = Array.from(new Set(c.sidoCodes ?? []))
    if (loaded.length === 0) return { text: null, missing: true, partial: false, title: null }
    const names = loaded.map(sidoName)
    // 시도마다 기준월이 다를 수 있다 — 마우스를 올리면 시도별로
    const detail = (c.loaded ?? []).filter(x => !!x.version).map(x => `${sidoName(x.sido)} ${x.version}`)
    const title = detail.length > 0 ? detail.join(', ') : names.join('·')
    const restricted = c.restrictedSidoCodes ?? []
    if (restricted.length > 0) {
        const all = restricted.every(x => loaded.includes(x))
        return { text: `제공 지역: ${names.join('·')} · 기준월 ${version}`, missing: false, partial: !all, title }
    }
    if (c.nationwide) return { text: `${base}(전국)`, missing: false, partial: false, title: null }
    const where = loaded.length <= 3 ? names.join('·') : `일부 시도(${loaded.length}/${NATIONAL_SIDO_COUNT})`
    return { text: `제공 지역: ${where} · 기준월 ${version}`, missing: false, partial: true, title }
}

/** 샘플 파일 저장 이름 */
const SAMPLE_FILE_NAMES: Readonly<Record<MyMapSampleKind, string>> = Object.freeze({
    pnu: '나만의지도_샘플_PNU.xlsx',
    address: '나만의지도_샘플_주소.xlsx',
    coord: '나만의지도_샘플_좌표.xlsx',
})

export function sampleFileName(kind: MyMapSampleKind): string {
    return SAMPLE_FILE_NAMES[kind]
}

/** 파일 이름에 못 쓰는 글자를 _로 */
export function safeFileName(name: string): string {
    return name.replace(/[\\/:*?"<>|\r\n]+/g, '_').trim() || 'mymap'
}
