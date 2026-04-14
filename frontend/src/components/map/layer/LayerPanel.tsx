'use client'

import { useLayerStore } from '@/stores/layerStore'
import LayerItem from './LayerItem'

interface LayerPanelProps {
    open: boolean
}

export default function LayerPanel({ open }: LayerPanelProps) {
    const { tree } = useLayerStore()

    return (
        <div
            className={`absolute top-0 right-10 z-10 w-52 bg-white rounded shadow overflow-hidden transition-all duration-200
        ${open ? 'translate-x-0 opacity-100 pointer-events-auto' : 'translate-x-2 opacity-0 pointer-events-none'}`}
        >
            <div className="px-3 py-2 border-b border-gray-100">
                <span className="text-xs font-semibold text-gray-500">레이어 목록</span>
            </div>
            <div className="divide-y divide-gray-100 max-h-96 overflow-y-auto">
                {tree.map((group) => (
                    <LayerItem key={group.id} node={group} />
                ))}
            </div>
        </div>
    )
}
