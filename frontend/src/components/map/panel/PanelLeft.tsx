'use client'

// 좌측 컨텐츠 패널 컨테이너
// 브레이크포인트별 동작:
//   모바일 (<768px):  hidden → 표시 안 함 (MobileLayerButton 사용)
//   태블릿 (768px~):  absolute → 지도 위에 떠서 겹침 (지도 크기 유지)
//   데스크탑 (1024px+): lg:relative lg:flex-shrink-0 → 지도 옆에 고정 (지도가 줄어듦)
import { usePanelStore } from '@/stores/map/panelStore'
import LayerPanel from './LayerPanel'
import SearchPanel from './SearchPanel'
import DrawPanel from './DrawPanel'
import MeasurePanel from './MeasurePanel'

export default function PanelLeft() {
    const { activePanel } = usePanelStore()

    if (!activePanel) return null

    return (
        <div className={`
            hidden md:flex flex-col overflow-hidden
            w-64 bg-white border-r border-gray-200
            md:absolute md:z-20 md:h-full md:shadow-xl
            lg:relative lg:flex-shrink-0 lg:shadow-none
        `}>
            {activePanel === 'layer'   && <LayerPanel />}
            {activePanel === 'search'  && <SearchPanel />}
            {activePanel === 'draw'    && <DrawPanel />}
            {activePanel === 'measure' && <MeasurePanel />}
        </div>
    )
}
