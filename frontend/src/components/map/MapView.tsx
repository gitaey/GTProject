'use client'

import { useRef } from 'react'
import { useMap } from '@/hooks/map/useMap'
import { useMapStore } from '@/stores/mapStore'
import { useDrawing } from '@/hooks/map/useDrawing'
import { useDistanceMeasure } from '@/hooks/map/useDistanceMeasure'
import MapToolbar from '@/components/map/toolbar/MapToolbar'
import { useAreaMeasure } from '@/hooks/map/useAreaMeasure'
import { useLayerManager } from '@/hooks/map/useLayerManager'
import LayerToggleButton from '@/components/map/layer/LayerToggleButton'

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

    return (
        <div className={`relative w-full h-full ${className ?? ''}`}>
            <div ref={containerRef} className="w-full h-full" />
            <LayerToggleButton />
            <MapToolbar />
        </div>
    )
}
