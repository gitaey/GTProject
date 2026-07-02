'use client'

// 모바일 전용 레이어 온/오프 플로팅 버튼
// md:hidden → 태블릿 이상에서는 숨김
import { useState } from 'react'
import { useLayerStore } from '@/stores/map/layerStore'
import { isLayerGroup } from '@/types/layer'

export default function MobileLayerButton() {
    const [open, setOpen] = useState(false)
    const { tree, toggleLayer } = useLayerStore()

    return (
        // md:hidden → 모바일(768px 미만)에서만 표시
        <div className="md:hidden">

            {/* 플로팅 버튼 */}
            <button
                onClick={() => setOpen((v) => !v)}
                className="absolute bottom-4 right-4 z-30 w-12 h-12 rounded-full text-white shadow-lg flex items-center justify-center text-xl transition-all"
                style={{ background: '#F26722' }}
            >
                ☰
            </button>

            {/* 레이어 시트 (버튼 클릭 시 표시) */}
            {open && (
                <div className="absolute bottom-20 right-4 z-30 w-56 bg-white rounded-xl shadow-2xl overflow-hidden border border-gray-100">
                    <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
                        <span className="text-sm font-bold text-gray-800">레이어</span>
                        <button onClick={() => setOpen(false)} className="text-gray-400 text-base">✕</button>
                    </div>

                    <div className="max-h-72 overflow-y-auto divide-y divide-gray-50">
                        {tree.map((group) => (
                            <div key={group.id}>
                                {/* 그룹 이름 */}
                                <div className="px-4 py-2 text-xs font-bold text-gray-400 uppercase tracking-wider bg-gray-50">
                                    {group.name}
                                </div>
                                {/* 그룹 하위 레이어 */}
                                {group.children.map((node) => {
                                    if (isLayerGroup(node)) return null  // 중첩 그룹은 생략
                                    return (
                                        <div key={node.id} className="flex items-center justify-between px-4 py-2.5">
                                            <span className="text-sm text-gray-700">{node.name}</span>
                                            {/* 토글 버튼 */}
                                            <button
                                                onClick={() => toggleLayer(node.id)}
                                                className="w-10 h-5 rounded-full relative transition-all flex-shrink-0"
                                                style={{ background: node.visible ? '#F26722' : '#D1D5DB' }}
                                            >
                                                <span
                                                    className="absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all"
                                                    style={{ left: node.visible ? '22px' : '2px' }}
                                                />
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
