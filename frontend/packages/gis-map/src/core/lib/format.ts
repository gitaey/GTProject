// 측정값 표기(순수 함수). 옛 useDistanceMeasure/useAreaMeasure/useRadiusSearch의 formatXxx와 글자까지 같다.
//   1,000 m 이상이면 km(소수 둘째 자리), 1,000,000 m² 이상이면 km²(소수 둘째 자리), 그 아래는 반올림한 정수 + 천 단위 쉼표

const KM_DIGITS: Readonly<Intl.NumberFormatOptions> = Object.freeze({ minimumFractionDigits: 2, maximumFractionDigits: 2 })

/** 거리(m) → '799 m' / '1.23 km' */
export function formatLength(meters: number): string {
    if (meters >= 1000) {
        return `${(meters / 1000).toLocaleString('ko-KR', KM_DIGITS)} km`
    }
    return `${Math.round(meters).toLocaleString('ko-KR')} m`
}

/** 면적(m²) → '399,106 m²' / '1.23 km²' */
export function formatArea(sqMeters: number): string {
    if (sqMeters >= 1_000_000) {
        return `${(sqMeters / 1_000_000).toLocaleString('ko-KR', KM_DIGITS)} km²`
    }
    return `${Math.round(sqMeters).toLocaleString('ko-KR')} m²`
}

/** 반경(m) → '반경: 500 m' / '반경: 1.20 km' */
export function formatRadius(meters: number): string {
    return `반경: ${formatLength(meters)}`
}
