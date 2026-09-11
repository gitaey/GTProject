// 바람길 레이어의 풍속(m/s) 색상 스케일. useWindLayer 훅과 범례 컴포넌트가
// 같은 색을 쓰도록 여기 한 곳에서만 정의한다.
export const WIND_COLOR_STOPS: [number, string][] = [
    [0, '#3b6fd1'],   // 약함
    [4, '#38bdf8'],
    [8, '#7de3a0'],
    [12, '#f4d35e'],
    [16, '#f45b45'],  // 강함
]

const MIN_SPEED = WIND_COLOR_STOPS[0][0]
const MAX_SPEED = WIND_COLOR_STOPS[WIND_COLOR_STOPS.length - 1][0]

function hexToRgb(hex: string): [number, number, number] {
    const r = parseInt(hex.slice(1, 3), 16)
    const g = parseInt(hex.slice(3, 5), 16)
    const b = parseInt(hex.slice(5, 7), 16)
    return [r, g, b]
}

export function windSpeedColor(speedMs: number): string {
    const s = Math.max(MIN_SPEED, Math.min(MAX_SPEED, speedMs))
    for (let i = 0; i < WIND_COLOR_STOPS.length - 1; i++) {
        const [v0, c0] = WIND_COLOR_STOPS[i]
        const [v1, c1] = WIND_COLOR_STOPS[i + 1]
        if (s >= v0 && s <= v1) {
            const f = (s - v0) / (v1 - v0)
            const [r0, g0, b0] = hexToRgb(c0)
            const [r1, g1, b1] = hexToRgb(c1)
            const r = Math.round(r0 + (r1 - r0) * f)
            const g = Math.round(g0 + (g1 - g0) * f)
            const b = Math.round(b0 + (b1 - b0) * f)
            return `rgb(${r},${g},${b})`
        }
    }
    return WIND_COLOR_STOPS[WIND_COLOR_STOPS.length - 1][1]
}
