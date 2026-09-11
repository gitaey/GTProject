'use client'

// 바람길 레이어가 켜져 있을 때 풍속(m/s) 색상 범례를 지도 우측 하단에 표시한다.
import { useMapStore } from '@/stores/map/mapStore'
import { WIND_COLOR_STOPS } from '@/lib/windColorScale'

export default function WindLegend() {
    const windLayerVisible = useMapStore(s => s.windLayerVisible)
    if (!windLayerVisible) return null

    const gradient = `linear-gradient(to right, ${WIND_COLOR_STOPS.map(([, c]) => c).join(', ')})`

    return (
        <div
            className="absolute bottom-4 left-3 z-10 select-none rounded-md px-3 py-2"
            style={{
                background: 'rgba(17, 24, 39, 0.72)',
                backdropFilter: 'blur(4px)',
                boxShadow: '0 2px 8px rgba(0,0,0,0.15), 0 0 0 0.5px rgba(0,0,0,0.08)',
            }}
        >
            <div className="text-[10px] font-medium text-white/70 mb-1">풍속 (m/s)</div>
            <div className="w-40 h-2 rounded-full" style={{ background: gradient }} />
            <div className="flex justify-between mt-1">
                {WIND_COLOR_STOPS.map(([speed]) => (
                    <span key={speed} className="text-[10px] text-white/70 tabular-nums">
                        {speed}
                    </span>
                ))}
            </div>
        </div>
    )
}
