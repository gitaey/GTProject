'use client'

// 바람길 레이어가 켜져 있을 때 풍속(m/s) 색상 범례를 지도 우측 하단에 표시한다.
// 표시 여부는 엔진의 바람길 플러그인(map.use(createWindPlugin())) 상태를 본다. 색은 플러그인과 같은 WIND_COLOR_STOPS
import { WIND_COLOR_STOPS } from '../../core'
import type { WindState } from '../../core'
import { useWindState } from '../../react'

const selectVisible = (s: WindState) => s.visible

export default function WindLegend() {
    const windLayerVisible = useWindState(selectVisible)
    if (!windLayerVisible) return null

    const gradient = `linear-gradient(to right, ${WIND_COLOR_STOPS.map(([, c]) => c).join(', ')})`

    return (
        <div
            className="gm-wind-legend"
            style={{
                background: 'rgba(17, 24, 39, 0.72)',
                backdropFilter: 'blur(4px)',
                boxShadow: '0 2px 8px rgba(0,0,0,0.15), 0 0 0 0.5px rgba(0,0,0,0.08)',
            }}
        >
            <div className="gm-wind-legend__title">풍속 (m/s)</div>
            <div className="gm-wind-legend__bar" style={{ background: gradient }} />
            <div className="gm-wind-legend__ticks">
                {WIND_COLOR_STOPS.map(([speed]) => (
                    <span key={speed} className="gm-wind-legend__tick">
                        {speed}
                    </span>
                ))}
            </div>
        </div>
    )
}
