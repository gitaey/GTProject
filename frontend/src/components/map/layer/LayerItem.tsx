'use client'

import { useState } from 'react'
import { ChevronRight } from 'lucide-react'
import { LayerItem as LayerItemType, LayerGroup, isLayerGroup, flattenItems } from '@/types/layer'
import { useLayerStore } from '@/stores/layerStore'

interface Props {
    node: LayerItemType | LayerGroup
    depth?: number
}

export default function LayerItem({ node, depth = 0 }: Props) {
    const { toggleLayer, toggleGroup, setOpacity } = useLayerStore()
    const [expanded, setExpanded] = useState(true)
    const [showOpacity, setShowOpacity] = useState(false)
    const indent = depth * 12

    if (isLayerGroup(node)) {
        const items = flattenItems(node.children)
        const allVisible = items.length > 0 && items.every((i) => i.visible)
        const someVisible = items.some((i) => i.visible)

        return (
            <div>
                <div
                    className="w-full flex items-center gap-1 py-1.5 hover:bg-gray-50 transition-colors"
                    style={{ paddingLeft: `${12 + indent}px` }}
                >
                    <input
                        type="checkbox"
                        checked={allVisible}
                        ref={(el) => {
                            if (el) el.indeterminate = !allVisible && someVisible
                        }}
                        onChange={() => toggleGroup(node.id)}
                        className="w-3 h-3 accent-blue-500 cursor-pointer"
                    />
                    <button onClick={() => setExpanded((p) => !p)} className="flex items-center gap-1 flex-1">
                        <ChevronRight
                            size={12}
                            className={`text-gray-400 transition-transform ${expanded ? 'rotate-90' : ''}`}
                        />
                        <span className="text-xs font-medium text-gray-600">{node.name}</span>
                    </button>
                </div>
                {expanded && (
                    <div>
                        {node.children.map((child) => (
                            <LayerItem key={child.id} node={child} depth={depth + 1} />
                        ))}
                    </div>
                )}
            </div>
        )
    }

    return (
        <div className="hover:bg-gray-50 transition-colors" style={{ paddingLeft: `${12 + indent}px` }}>
            <div className="flex items-center gap-2 pr-3 py-1.5">
                <input
                    type="checkbox"
                    checked={node.visible}
                    onChange={() => toggleLayer(node.id)}
                    className="w-3 h-3 accent-blue-500 cursor-pointer"
                />
                <span
                    className="text-xs text-gray-700 flex-1 cursor-pointer select-none"
                    onClick={() => setShowOpacity((p) => !p)}
                >
                    {node.name}
                </span>
                <span className="text-xs text-gray-300">{Math.round(node.opacity * 100)}</span>
            </div>
            {showOpacity && (
                <div className="flex items-center gap-2 pr-3 pb-1.5" style={{ paddingLeft: '20px' }}>
                    <input
                        type="range"
                        min={0}
                        max={1}
                        step={0.01}
                        value={node.opacity}
                        onChange={(e) => setOpacity(node.id, parseFloat(e.target.value))}
                        className="w-full h-1 accent-blue-500"
                    />
                </div>
            )}
            {node.legend && (
                <div className="pb-1.5" style={{ paddingLeft: '20px' }}>
                    <img src={node.legend} alt="범례" className="max-w-full rounded" />
                </div>
            )}
        </div>
    )
}
