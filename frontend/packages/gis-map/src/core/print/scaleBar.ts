// 축척 계산(순수 함수). 지상 해상도(m/px)는 호출한 쪽이 ol.proj.getPointResolution(뷰 좌표계, …)으로 구해서 넘긴다.
// 용어: 틀(frame) = 화면에서 출력 범위를 정하는 사각형(CSS px), 지도 칸 = 용지 위 지도 그림 자리(mm).

/** 용지 위 축척 분모 = (틀 너비 px × 지상 해상도 m/px) ÷ (지도 칸 너비 m) */
export function scaleDenominator(framePxWidth: number, groundMetersPerPx: number, mapBoxWidthMm: number): number {
    if (!(framePxWidth > 0) || !(groundMetersPerPx > 0) || !(mapBoxWidthMm > 0)) return 0
    return (framePxWidth * groundMetersPerPx) / (mapBoxWidthMm / 1000)
}

/** scaleDenominator의 역: 용지에서 1:denominator가 되려면 틀 너비는 몇 px인가 */
export function framePxWidthForScale(denominator: number, groundMetersPerPx: number, mapBoxWidthMm: number): number {
    if (!(denominator > 0) || !(groundMetersPerPx > 0) || !(mapBoxWidthMm > 0)) return 0
    return (denominator * (mapBoxWidthMm / 1000)) / groundMetersPerPx
}

/** 지도 그림의 용지 위 해상도(dpi): 틀 안의 기기 픽셀 수 ÷ 지도 칸 너비(inch) */
export function mapDpiOf(framePxWidth: number, devicePixelRatio: number, mapBoxWidthMm: number): number {
    if (!(framePxWidth > 0) || !(mapBoxWidthMm > 0)) return 0
    return (framePxWidth * devicePixelRatio) / (mapBoxWidthMm / 25.4)
}

/** 1·2·5 × 10^n 중 maxMeters 이하인 가장 큰 값. maxMeters가 0 이하면 0 */
export function niceBarMeters(maxMeters: number): number {
    if (!(maxMeters > 0) || !Number.isFinite(maxMeters)) return 0
    const exp = Math.floor(Math.log10(maxMeters))
    const base = Math.pow(10, exp)
    // 부동소수 오차(예: log10(1000) = 2.9999…)로 한 단계 낮게 잡힐 수 있어 위 단계도 확인한다
    for (const mult of [5, 2, 1]) {
        const v = mult * base
        if (v <= maxMeters * (1 + 1e-9)) return roundNice(v)
    }
    return roundNice(base)
}

function roundNice(v: number): number {
    return Number(v.toPrecision(6))
}

/** 막대 길이 글자: 1000 m 이상은 km. 소수는 최대 3자리까지 */
export function formatBarLabel(meters: number): string {
    if (meters >= 1000) return trimNumber(meters / 1000) + ' km'
    return trimNumber(meters) + ' m'
}

function trimNumber(n: number): string {
    return String(Number(n.toFixed(3)))
}

export interface ScaleBarPlan {
    /** 막대가 나타내는 실제 거리(m) */
    meters: number
    /** 용지 위 막대 길이(mm) */
    lengthMm: number
    /** 막대 구간 수(검정·흰색 번갈아) */
    segments: number
    /** 왼쪽부터 눈금 글자(0, 가운데, 끝) */
    labels: [string, string, string]
}

/**
 * 용지 1mm가 지상 몇 m인지(groundMetersPerMm)와 막대가 들어갈 최대 길이(maxBarMm)로 막대를 정한다.
 * 막대 구간은 4개 고정(가운데 눈금 = 절반). 계산이 안 되면 null
 */
export function planScaleBar(groundMetersPerMm: number, maxBarMm: number): ScaleBarPlan | null {
    if (!(groundMetersPerMm > 0) || !(maxBarMm > 0)) return null
    const meters = niceBarMeters(groundMetersPerMm * maxBarMm)
    if (meters <= 0) return null
    return {
        meters,
        lengthMm: meters / groundMetersPerMm,
        segments: 4,
        labels: ['0', formatBarLabel(meters / 2), formatBarLabel(meters)],
    }
}

/** '1:5,000' — 정수로 반올림 */
export function formatScaleRatio(denominator: number): string {
    return '1:' + Math.round(denominator).toLocaleString('en-US')
}
