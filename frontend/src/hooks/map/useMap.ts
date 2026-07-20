// OpenLayers 지도 인스턴스를 생성하고 관리하는 커스텀 Hook
// Hook: use로 시작하는 함수. jQuery의 $(document).ready() 개념과 유사
import { useEffect, useState } from 'react'
import Map from 'ol/Map'
import View from 'ol/View'
import TileLayer from 'ol/layer/Tile'
import OSM from 'ol/source/OSM'
import { get as getProjection, fromLonLat } from 'ol/proj'
import { register } from 'ol/proj/proj4'
import proj4 from 'proj4'

// EPSG:5186 좌표계 등록 (한국 표준 좌표계)
proj4.defs('EPSG:5186', '+proj=tmerc +lat_0=38 +lon_0=127 +k=1 +x_0=200000 +y_0=600000 +ellps=GRS80 +units=m +no_defs')
register(proj4)

// 세종특별시 중심 좌표 (EPSG:5186)
const SEJONG_3857 = fromLonLat([127.289, 36.48])

// interface: 이 Hook이 받을 옵션 파라미터 구조 정의
// ? = 선택적 속성 (없으면 기본값 사용)
interface UseMapOptions {
    center?: [number, number]
    zoom?: number
}

export function useMap(targetRef: React.RefObject<HTMLDivElement | null>, options: UseMapOptions = {}) {
    // useRef: 컴포넌트가 다시 렌더링돼도 값이 유지되는 보관함
    // mapRef.current에 OL Map 인스턴스를 저장
    // 일반 변수(let map)로 하면 렌더링될 때마다 초기화돼버림
    const [map, setMap] = useState<Map | null>(null)

    // 구조분해 + 기본값 (ES6): options에 값이 없으면 기본값 사용
    const { center = SEJONG_3857, zoom = 10 } = options

    // useEffect: 컴포넌트가 화면에 그려진 후 실행
    // 마지막 [] (의존성 배열)이 빈 배열이면 처음 한 번만 실행
    useEffect(() => {
        if (!targetRef.current || map) return  // 이미 만들어졌으면 스킵

        const projection = getProjection('EPSG:3857')!

        // OL 지도 인스턴스 생성 후 mapRef.current에 저장
        const newMap = new Map({
            target: targetRef.current,
            layers: [],
            // 기본 컨트롤(줌·회전·속성) 제거 → 커스텀 MapControls 컴포넌트로 대체
            controls: [],
            view: new View({
                projection,
                center,
                zoom,
                minZoom: 7,
                maxZoom: 21,
                constrainResolution: true,  // 줌 1단계씩 스냅
            }),
        })

        setMap(newMap);
        // 개발자도구에서 window.__map 으로 접근 가능
        ;(window as unknown as Record<string, unknown>).__map = newMap

        // cleanup 함수: 컴포넌트가 사라질 때 실행 (지도 정리)
        // ?. = 옵셔널 체이닝 (ES6): null이면 에러 없이 그냥 넘어감
        return () => {
            newMap?.setTarget(undefined)
            setMap(null)
        }
    }, [])

    // mapRef를 반환해서 다른 Hook들이 같은 지도 인스턴스를 공유
    // MapView가 이 mapRef를 받아 useDrawing, useLayerManager 등에 전달
    return map
}
