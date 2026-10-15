// 풍속 색 막대의 CSS 그라데이션 — 화면 모서리 WindLegend와 바람지도 패널의 범례가 같은 색 스케일(WIND_COLOR_STOPS)을 쓴다.
import { WIND_COLOR_STOPS, WIND_LEGEND_MAX_SPEED, wxScaleGradientStops, wxScalePosition, wxTickLabel } from '../../core'
import type { WxColorScale } from '../../core'

/** 범례 막대의 눈금(m/s) — 패널과 모서리 범례가 같은 눈금(0 ~ WIND_LEGEND_MAX_SPEED)을 쓴다 */
export const WIND_LEGEND_TICKS: readonly number[] = Object.freeze([0, 5, 10, 15, 20, WIND_LEGEND_MAX_SPEED])

/**
 * maxSpeed를 안 주면 색 정지점만 고르게 나눈 옛 WindLegend의 식 그대로(0~16 m/s 구간 전체가 막대).
 * maxSpeed를 주면 막대 전체가 0~maxSpeed m/s이고, 색 정지점은 그 속도 위치에 놓이며 마지막 색이 끝까지 이어진다
 */
export function windGradientCss(maxSpeed?: number): string {
    if (maxSpeed === undefined) {
        return `linear-gradient(to right, ${WIND_COLOR_STOPS.map(([, c]) => c).join(', ')})`
    }
    const parts = WIND_COLOR_STOPS.map(([speed, color]) => `${color} ${Math.round((speed / maxSpeed) * 10000) / 100}%`)
    const [lastSpeed, lastColor] = WIND_COLOR_STOPS[WIND_COLOR_STOPS.length - 1]
    if (lastSpeed < maxSpeed) parts.push(`${lastColor} 100%`)
    return `linear-gradient(to right, ${parts.join(', ')})`
}

/** 스칼라 변수(기온·습도·강수량) 범례 막대의 CSS 그라데이션 — 색·위치는 core/lib/wxColorScales의 정지점(로그 막대는 로그 위치)을 그대로 쓴다 */
export function wxGradientCss(scale: WxColorScale): string {
    const parts = wxScaleGradientStops(scale).map(s => `${s.color} ${s.percent}%`)
    return `linear-gradient(to right, ${parts.join(', ')})`
}

/** 범례 눈금: 막대 위 위치(0~100%)와 글. 로그 막대는 눈금도 로그 위치에 놓는다 */
export function wxLegendTicks(scale: WxColorScale): Array<{ key: string; percent: number; label: string }> {
    return scale.ticks.map(v => ({ key: String(v), percent: Math.round(wxScalePosition(scale, v) * 10000) / 100, label: wxTickLabel(v) }))
}
