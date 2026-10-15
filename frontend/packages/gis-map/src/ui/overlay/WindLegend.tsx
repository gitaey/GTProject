'use client'

// 바람길 레이어가 켜져 있을 때 풍속(m/s) 색상 범례를 지도 좌측 하단에 표시한다(0~25 m/s, 바람지도 패널의 범례와 같은 눈금).
// 표시 여부는 엔진의 바람길 플러그인(map.use(createWindPlugin())) 상태를 본다. 색은 플러그인과 같은 WIND_COLOR_STOPS.
// 이 범례는 "풍속 색"이다: 입자에 풍속 색이 있으면 제목은 '입자 풍속 (m/s)'(기온 등 다른 값의 색상 오버레이와 구분), 풍속 오버레이만 있으면 '풍속 (m/s)'.
// 화면에 풍속 색이 하나도 없으면(입자는 단색이거나 숨김, 풍속 오버레이도 아님) 색 막대가 화면과 안 맞으므로 숨긴다 — 기온·습도 범례는 바람지도 패널에 있다
import type { WindState } from '../../core'
import { useWindState } from '../../react'
import { WIND_LEGEND_MAX_SPEED } from '../../core'
import { WIND_LEGEND_TICKS, windGradientCss } from './windGradient'

// 풍속 색이 화면에 있을 때만(켜짐 + 풍속 색 입자 또는 풍속 오버레이)
const selectShowLegend = (s: WindState) => s.visible && ((s.particlesVisible && s.colorBySpeed) || s.overlayVar === 'speed')
const selectColoredParticles = (s: WindState) => s.particlesVisible && s.colorBySpeed

export default function WindLegend() {
    const windLayerVisible = useWindState(selectShowLegend)
    const coloredParticles = useWindState(selectColoredParticles)
    if (!windLayerVisible) return null

    const gradient = windGradientCss(WIND_LEGEND_MAX_SPEED)

    return (
        <div
            className="gm-wind-legend"
            style={{
                background: 'rgba(17, 24, 39, 0.72)',
                backdropFilter: 'blur(4px)',
                boxShadow: '0 2px 8px rgba(0,0,0,0.15), 0 0 0 0.5px rgba(0,0,0,0.08)',
            }}
        >
            <div className="gm-wind-legend__title">{coloredParticles ? '입자 풍속 (m/s)' : '풍속 (m/s)'}</div>
            <div className="gm-wind-legend__bar" style={{ background: gradient }} />
            <div className="gm-wind-legend__ticks">
                {WIND_LEGEND_TICKS.map(speed => (
                    <span key={speed} className="gm-wind-legend__tick">
                        {speed}
                    </span>
                ))}
            </div>
        </div>
    )
}
