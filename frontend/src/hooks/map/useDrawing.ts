// 포인트/선/폴리곤 그리기 기능을 담당하는 Hook
// 선택된 도구(activeTool)에 따라 OL Draw 인터랙션을 교체함
import { useEffect, useRef } from 'react'
import Map from 'ol/Map'
import VectorLayer from 'ol/layer/Vector'
import VectorSource from 'ol/source/Vector'
import Draw from 'ol/interaction/Draw'
import { Type as GeomType } from 'ol/geom/Geometry'
import { MapTool, onClear } from '@/stores/mapStore'

// Partial<Record<MapTool, GeomType>>:
// Record → MapTool의 모든 값에 GeomType이 있어야 함
// Partial → 그 중 일부만 있어도 됨
// 'none', 'measure-distance' 등 그리기 도구가 아닌 것은 매핑 없음
const TOOL_GEOM_MAP: Partial<Record<MapTool, GeomType>> = {
    'draw-point': 'Point',
    'draw-line': 'LineString',
    'draw-polygon': 'Polygon',
}

export function useDrawing(mapRef: React.RefObject<Map | null>, activeTool: MapTool) {
    // useRef: 렌더링이 일어나도 인스턴스가 유지되어야 하므로 useRef 사용
    const sourceRef = useRef(new VectorSource())                          // 피처(그린 도형) 저장소
    const layerRef  = useRef(new VectorLayer({ source: sourceRef.current })) // 화면에 표시하는 레이어
    const drawRef   = useRef<Draw | null>(null)                           // 현재 활성화된 Draw 인터랙션

    // 지도 생성 시 그리기 레이어 등록 + clearAll 이벤트 구독
    // [mapRef.current]: 지도 인스턴스가 생겼을 때 한 번 실행
    useEffect(() => {
        const map = mapRef.current
        if (!map) return

        map.addLayer(layerRef.current)  // 그리기 레이어를 지도에 추가

        // mapStore.clearAll() 호출 시 그린 피처 전부 삭제
        // onClear는 구독 해제 함수를 반환함 (mapStore.ts 참고)
        const unsubscribe = onClear(() => {
            sourceRef.current.clear()
        })

        // cleanup: 컴포넌트 사라질 때 구독 해제 + 레이어 제거 (메모리 누수 방지)
        return () => {
            unsubscribe()
            try {
                map.removeLayer(layerRef.current)
            } catch {
                // map이 이미 소멸된 경우 무시
            }
        }
    }, [mapRef.current])

    // 도구 변경 시 Draw 인터랙션 교체
    // [activeTool, mapRef.current]: 도구나 지도가 바뀔 때마다 실행
    useEffect(() => {
        const map = mapRef.current
        if (!map) return

        // 기존 Draw 인터랙션 제거
        if (drawRef.current) {
            map.removeInteraction(drawRef.current)
            drawRef.current = null
        }

        // 그리기 도구가 아니면 (none, measure 등) 인터랙션 추가 없이 종료
        const geomType = TOOL_GEOM_MAP[activeTool]
        if (!geomType) return

        // 선택된 도구에 맞는 Draw 인터랙션 생성 후 지도에 추가
        const draw = new Draw({
            source: sourceRef.current,
            type: geomType,
        })
        map.addInteraction(draw)
        drawRef.current = draw

        // cleanup: 도구가 바뀔 때 이전 Draw 인터랙션 정리
        return () => {
            map.removeInteraction(draw)
            drawRef.current = null
        }
    }, [activeTool, mapRef.current])
}
