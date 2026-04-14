import { useEffect, useRef } from 'react'
import Map from 'ol/Map'
import VectorLayer from 'ol/layer/Vector'
import VectorSource from 'ol/source/Vector'
import Draw from 'ol/interaction/Draw'
import { Type as GeomType } from 'ol/geom/Geometry'
import { MapTool, onClear } from '@/stores/mapStore'

const TOOL_GEOM_MAP: Partial<Record<MapTool, GeomType>> = {
    'draw-point': 'Point',
    'draw-line': 'LineString',
    'draw-polygon': 'Polygon',
}

export function useDrawing(mapRef: React.RefObject<Map | null>, activeTool: MapTool) {
    const sourceRef = useRef(new VectorSource())
    const layerRef = useRef(new VectorLayer({ source: sourceRef.current }))
    const drawRef = useRef<Draw | null>(null)

    // 레이어 등록
    useEffect(() => {
        const map = mapRef.current
        if (!map) return
        map.addLayer(layerRef.current)

        // 초기화 버튼 클릭 시 해당 레이어 피처 전체 삭제
        const unsubscribe = onClear(() => {
            sourceRef.current.clear()
        })

        return () => {
            unsubscribe()
            try {
                map.removeLayer(layerRef.current)
            } catch {
                // map이 이미 소멸된 경우 무시
            }
        }
    }, [mapRef.current])

    // 툴 변경 시 Draw 인터랙션 교체
    useEffect(() => {
        const map = mapRef.current
        if (!map) return

        // 기존 인터랙션 제거
        if (drawRef.current) {
            map.removeInteraction(drawRef.current)
            drawRef.current = null
        }

        const geomType = TOOL_GEOM_MAP[activeTool]
        if (!geomType) return

        const draw = new Draw({
            source: sourceRef.current,
            type: geomType,
        })
        map.addInteraction(draw)
        drawRef.current = draw

        return () => {
            map.removeInteraction(draw)
            drawRef.current = null
        }
    }, [activeTool, mapRef.current])
}
