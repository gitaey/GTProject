'use client'

import { useState } from 'react'
import { Menu, X } from 'lucide-react'
import { getLayerVisible } from '../../core'
import type { LayerTreeState } from '../../core'
import { useGisMap, useLayerTreeState } from '../../react'

// 엔진 레이어 트리 상태 선택자(모듈 상수)
const selectTree = (s: LayerTreeState) => s.tree
const selectVisible = (s: LayerTreeState) => s.visible

export default function MobileLayerButton() {
    const [open, setOpen] = useState(false)
    const layerTree = useGisMap()?.layers
    const tree = useLayerTreeState(selectTree)
    const visibleMap = useLayerTreeState(selectVisible)
    const toggleLayer = (layerId: number) => layerTree?.toggleLayer(layerId)

    return (
        <div className="gm-mobile-layers">
            <button onClick={() => setOpen(v => !v)}
                className="gm-mobile-layers__fab">
                <Menu size={20} />
            </button>

            {open && (
                <div className="gm-mobile-layers__sheet">
                    <div className="gm-mobile-layers__head">
                        <span className="gm-mobile-layers__title">레이어</span>
                        <button onClick={() => setOpen(false)} className="gm-mobile-layers__close"><X size={16} /></button>
                    </div>
                    <div className="gm-mobile-layers__list">
                        {tree?.groups.map(group => (
                            <div key={group.id}>
                                <div className="gm-mobile-layers__group">
                                    {group.name}
                                </div>
                                {group.layers.map(layer => {
                                    const visible = getLayerVisible(visibleMap, layer)
                                    return (
                                        <div key={layer.id} className="gm-mobile-layers__row">
                                            <span className="gm-mobile-layers__name">{layer.name}</span>
                                            <button onClick={() => toggleLayer(layer.id)}
                                                className="gm-mobile-layers__toggle"
                                                style={{ background: visible ? 'var(--gm-primary)' : '#D1D5DB' }}>
                                                <span className="gm-mobile-layers__knob"
                                                    style={{ left: visible ? '22px' : '2px' }} />
                                            </button>
                                        </div>
                                    )
                                })}
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    )
}
