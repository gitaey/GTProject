'use client'

// 지도 전체 레이아웃 컴포넌트
// MapHeader + (NavLeft + PanelLeft + 지도) + MapStatusBar 조합
import { useRef, useEffect, useState } from 'react'
import { fromLonLat } from 'ol/proj'
import { useMap } from '@/hooks/map/useMap'
import { useMapStore, MapTool } from '@/stores/map/mapStore'
import { useDrawing } from '@/hooks/map/useDrawing'
import { useDistanceMeasure } from '@/hooks/map/useDistanceMeasure'
import { useAreaMeasure } from '@/hooks/map/useAreaMeasure'
import { useLayerManager } from '@/hooks/map/useLayerManager'
import { useRadiusSearch } from '@/hooks/map/useRadiusSearch'
import { useParcelHighlight } from '@/hooks/map/useParcelHighlight'
import MapHeader from '@/components/map/header/MapHeader'
import MapStatusBar from '@/components/map/statusbar/MapStatusBar'
import NavLeft from '@/components/map/nav/NavLeft'
import PanelLeft from '@/components/map/panel/PanelLeft'
import MapToolbar from '@/components/map/toolbar/MapToolbar'
import MobileLayerButton from '@/components/map/mobile/MobileLayerButton'
import RegionOverlay from '@/components/map/overlay/RegionOverlay'
import TextInputOverlay from '@/components/map/overlay/TextInputOverlay'

interface MapViewProps {
    center?: [number, number]
    zoom?: number
    className?: string
}

const TOOL_HINT: Partial<Record<MapTool, string>> = {
    'draw-point':   '우클릭으로 그리기 종료',
    'draw-line':    '우클릭으로 그리기 종료',
    'draw-polygon': '우클릭으로 그리기 종료',
    'draw-circle':  '우클릭으로 그리기 종료',
    'draw-box':     '우클릭으로 그리기 종료',
    'draw-text':    '우클릭으로 그리기 종료',
    'select':       '클릭해서 선택 · 꼭지점 드래그로 수정',
}

export default function MapView({ center, zoom, className }: MapViewProps) {
    const containerRef = useRef<HTMLDivElement>(null)
    const mapRef = useMap(containerRef, { center, zoom })
    const { activeTool, flyToRequest, clearFlyTo } = useMapStore()
    const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null)

    useEffect(() => {
        if (!flyToRequest || !mapRef) return
        mapRef.getView().animate({
            center: fromLonLat([flyToRequest.lon, flyToRequest.lat]),
            zoom: flyToRequest.zoom ?? 16,
            duration: 600,
        })
        clearFlyTo()
    }, [flyToRequest, mapRef])

    useDrawing(mapRef, activeTool)
    useDistanceMeasure(mapRef, activeTool)
    useAreaMeasure(mapRef, activeTool)
    useLayerManager(mapRef)
    useRadiusSearch(mapRef, activeTool)
    useParcelHighlight(mapRef)

    const hint = TOOL_HINT[activeTool]

    return (
        <div className={`flex flex-col w-full h-full ${className ?? ''}`}>
            <MapHeader />

            <div className="relative flex flex-1 overflow-hidden">
                <NavLeft />
                <PanelLeft map={mapRef} />

                <div className="relative flex-1 h-full"
                    onMouseMove={hint ? (e) => {
                        const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect()
                        setCursor({ x: e.clientX - rect.left, y: e.clientY - rect.top })
                    } : undefined}
                    onMouseLeave={hint ? () => setCursor(null) : undefined}
                >
                    <div ref={containerRef} className="w-full h-full" />
                    <RegionOverlay map={mapRef} />
                    <TextInputOverlay />

                    {/* 커서 툴팁 */}
                    {hint && cursor && (
                        <div
                            className="absolute z-40 pointer-events-none"
                            style={{ left: cursor.x + 14, top: cursor.y + 14 }}
                        >
                            <div className="bg-gray-800/90 text-white text-[11px] px-2.5 py-1.5 rounded-md whitespace-nowrap backdrop-blur-sm"
                                style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.25)' }}>
                                {hint}
                            </div>
                        </div>
                    )}

                    <MapToolbar map={mapRef} />
                    <MobileLayerButton />
                </div>
            </div>

            <MapStatusBar map={mapRef} />
        </div>
    )
}
