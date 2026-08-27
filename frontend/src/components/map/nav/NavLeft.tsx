'use client'

// 좌측 아이콘 네비게이션 컴포넌트
// 각 아이콘 클릭 시 오른쪽 패널 내용이 전환됨
// hidden md:flex → 모바일에서는 숨김, 태블릿부터 표시
import { LucideIcon, Layers, Aperture, MoreHorizontal, Settings } from 'lucide-react'
import { usePanelStore, PanelType } from '@/stores/map/panelStore'
import { useMenuStore } from '@/stores/menuStore'

const NAV_ITEMS: { type: PanelType; label: string; icon: LucideIcon; menuId: string }[] = [
    { type: 'layer', label: '레이어', icon: Layers,         menuId: 'map.panel.layer' },
    { type: 'image', label: 'TIFF',   icon: Aperture,       menuId: 'map.panel.image' },
    { type: 'etc',   label: '기타',   icon: MoreHorizontal, menuId: 'map.panel.etc'   },
]

export default function NavLeft() {
    const { activePanel, togglePanel } = usePanelStore()
    const { isAllowed, loaded } = useMenuStore()

    const visibleItems = loaded
        ? NAV_ITEMS.filter(item => isAllowed(item.menuId))
        : NAV_ITEMS

    return (
        // hidden md:flex → 모바일(768px 미만)에서 숨김
        <div className="hidden md:flex flex-col items-center w-14 bg-white border-r border-gray-200 py-2 gap-1 flex-shrink-0">
            {visibleItems.map((item) => {
                const Icon = item.icon
                return (
                    <button
                        key={item.type}
                        onClick={() => togglePanel(item.type)}
                        className={`flex flex-col items-center gap-1 w-11 py-2 rounded-lg text-xs font-semibold transition-all
                            ${activePanel === item.type
                                ? 'bg-orange-50 text-orange-500'
                                : 'text-gray-400 hover:text-gray-700 hover:bg-gray-100'
                            }`}
                    >
                        <Icon size={20} />
                        <span>{item.label}</span>
                    </button>
                )
            })}

            <div className="mt-auto flex flex-col items-center gap-1 pb-1">
                <div className="w-7 h-px bg-gray-200 mb-1" />
                <button className="flex flex-col items-center gap-1 w-11 py-2 rounded-lg text-xs font-semibold text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-all">
                    <Settings size={20} />
                    <span>설정</span>
                </button>
            </div>
        </div>
    )
}
