'use client'

import { useState } from 'react'
import { useLayerStore, getLayerVisible } from '@/stores/map/layerStore'

export default function MobileLayerButton() {
    const [open, setOpen] = useState(false)
    const { tree, toggleLayer } = useLayerStore()
    const visibleMap = useLayerStore(s => s.visibleMap)

    return (
        <div className="md:hidden">
            <button onClick={() => setOpen(v => !v)}
                className="absolute bottom-4 right-4 z-30 w-12 h-12 rounded-full text-white shadow-lg flex items-center justify-center text-xl transition-all"
                style={{ background: '#F26722' }}>
                ☰
            </button>

            {open && (
                <div className="absolute bottom-20 right-4 z-30 w-56 bg-white rounded-xl shadow-2xl overflow-hidden border border-gray-100">
                    <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
                        <span className="text-sm font-bold text-gray-800">레이어</span>
                        <button onClick={() => setOpen(false)} className="text-gray-400 text-base">✕</button>
                    </div>
                    <div className="max-h-72 overflow-y-auto divide-y divide-gray-50">
                        {tree?.groups.map(group => (
                            <div key={group.id}>
                                <div className="px-4 py-2 text-xs font-bold text-gray-400 uppercase tracking-wider bg-gray-50">
                                    {group.name}
                                </div>
                                {group.layers.map(layer => {
                                    const visible = getLayerVisible(visibleMap, layer)
                                    return (
                                        <div key={layer.id} className="flex items-center justify-between px-4 py-2.5">
                                            <span className="text-sm text-gray-700">{layer.name}</span>
                                            <button onClick={() => toggleLayer(layer.id)}
                                                className="w-10 h-5 rounded-full relative transition-all flex-shrink-0"
                                                style={{ background: visible ? '#F26722' : '#D1D5DB' }}>
                                                <span className="absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all"
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
