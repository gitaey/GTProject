'use client'

// 레이어 목록 패널 (기존 layer/LayerPanel.tsx에서 이동)
import { useLayerStore } from '@/stores/map/layerStore'
import LayerItem from '@/components/map/layer/LayerItem'

export default function LayerPanel() {
    const { tree } = useLayerStore()

    return (
        <>
            <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
                <span className="text-sm font-bold text-gray-800">레이어</span>
                <button className="text-xs font-semibold text-orange-500">+ 추가</button>
            </div>
            <div className="flex-1 overflow-y-auto">
                {tree.map((group) => (
                    <LayerItem key={group.id} node={group} />
                ))}
            </div>
        </>
    )
}
