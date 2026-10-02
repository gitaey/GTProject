'use client'

// 배경지도 전환(일반/위성/없음). FE-5b-1: 옛 header/MapHeader.tsx 안의 함수를 파일로 뗐다(본문 동일)
import type { BasemapMode, LayerTreeState } from '../../core'
import { useGisMap, useLayerTreeState } from '../../react'

const BASEMAP_OPTIONS: { value: BasemapMode; label: string }[] = [
    { value: 'normal',   label: '일반' },
    { value: 'satellite', label: '위성' },
    { value: 'none',     label: '없음' },
]

const selectBasemapMode = (s: LayerTreeState) => s.basemapMode

export default function BasemapSwitcher() {
    // 배경지도 모드는 가장 가까운 엔진(map.layers)의 것 — 엔진 생성 전에는 'normal'(옛 초기값)
    const layerTree = useGisMap()?.layers
    const basemapMode = useLayerTreeState(selectBasemapMode)
    const setBasemapMode = (mode: BasemapMode) => layerTree?.setBasemapMode(mode)

    return (
        <div className="gm-basemap"
            style={{ background: '#f1f5f9', border: '1px solid #e2e8f0' }}>
            {BASEMAP_OPTIONS.map(opt => (
                <button key={opt.value} onClick={() => setBasemapMode(opt.value)}
                    className="gm-basemap__btn"
                    style={{
                        background: basemapMode === opt.value ? 'var(--gm-primary)' : 'transparent',
                        color: basemapMode === opt.value ? '#fff' : '#64748b',
                        fontWeight: basemapMode === opt.value ? 600 : 400,
                    }}>
                    {opt.label}
                </button>
            ))}
        </div>
    )
}
