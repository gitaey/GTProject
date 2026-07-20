'use client'

// 지도 전체 레이아웃 컴포넌트
// MapHeader + (NavLeft + PanelLeft + 지도) + MapStatusBar 조합
import { useRef } from 'react'
import { useMap } from '@/hooks/map/useMap'
import { useMapStore } from '@/stores/map/mapStore'
import { useDrawing } from '@/hooks/map/useDrawing'
import { useDistanceMeasure } from '@/hooks/map/useDistanceMeasure'
import { useAreaMeasure } from '@/hooks/map/useAreaMeasure'
import { useLayerManager } from '@/hooks/map/useLayerManager'
import { useRadiusSearch } from '@/hooks/map/useRadiusSearch'
import MapHeader from '@/components/map/header/MapHeader'
import MapStatusBar from '@/components/map/statusbar/MapStatusBar'
import NavLeft from '@/components/map/nav/NavLeft'
import PanelLeft from '@/components/map/panel/PanelLeft'
import MapToolbar from '@/components/map/toolbar/MapToolbar'
import MobileLayerButton from '@/components/map/mobile/MobileLayerButton'
import RegionOverlay from '@/components/map/overlay/RegionOverlay'

interface MapViewProps {
    center?: [number, number]
    zoom?: number
    className?: string
}

export default function MapView({ center, zoom, className }: MapViewProps) {
    const containerRef = useRef<HTMLDivElement>(null)
    const mapRef = useMap(containerRef, { center, zoom })
    const { activeTool } = useMapStore()

    useDrawing(mapRef, activeTool)
    useDistanceMeasure(mapRef, activeTool)
    useAreaMeasure(mapRef, activeTool)
    useLayerManager(mapRef)
    useRadiusSearch(mapRef, activeTool)

    return (
        <div className={`flex flex-col w-full h-full ${className ?? ''}`}>
            {/* 상단 헤더 */}
            <MapHeader />

            {/* 중간 영역: 네비 + 패널 + 지도 */}
            {/* relative 필수 → 태블릿에서 PanelLeft가 absolute로 지도 위에 뜰 때 기준점 */}
            <div className="relative flex flex-1 overflow-hidden">
                {/* 좌측 아이콘 네비게이션 */}
                <NavLeft />

                {/* 좌측 컨텐츠 패널 */}
                <PanelLeft />

                {/* 지도 영역 */}
                <div className="relative flex-1 h-full">
                    <div ref={containerRef} className="w-full h-full" />
                    <RegionOverlay map={mapRef} />
                    <MapToolbar map={mapRef} />
                    {/* 모바일 전용 레이어 온/오프 버튼 */}
                    <MobileLayerButton />
                </div>
            </div>

            {/* 하단 상태바 */}
            <MapStatusBar map={mapRef} />
        </div>
    )
}
