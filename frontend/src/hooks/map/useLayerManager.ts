// layerStore의 상태(visible/opacity)와 OpenLayers 레이어를 동기화하는 Hook
// Store 상태가 바뀌면 실제 OL 레이어에 자동으로 반영됨
import { useEffect, useRef } from 'react'
import OLMap from 'ol/Map'
import TileLayer from 'ol/layer/Tile'
import ImageLayer from 'ol/layer/Image'
import XYZ from 'ol/source/XYZ'
import ImageWMS from 'ol/source/ImageWMS'
import { useLayerStore } from '@/stores/layerStore'
import { LayerItem, LayerGroup, isLayerGroup, flattenItems } from '@/types/layer'
import BaseLayer from 'ol/layer/Base'

// 환경변수에서 VWorld API 키 가져옴 (! = null이 아님을 TypeScript에 보장)
const API_KEY = process.env.NEXT_PUBLIC_VWORLD_API_KEY!

// Record<키타입, 값타입>: "key는 string, value도 string인 객체" 타입
// 레이어 id → VWorld WMTS 레이어명 매핑
const VWORLD_LAYER_NAME: Record<string, string> = {
    'base-normal': 'Base',
    'base-satellite': 'Satellite',
    'base-hybrid': 'Hybrid',
}

// WMTS(XYZ) 소스 생성: VWorld 기본지도 타일 URL 생성
function createXYZSource(layerId: string) {
    return new XYZ({
        url: `https://api.vworld.kr/req/wmts/1.0.0/${API_KEY}/${VWORLD_LAYER_NAME[layerId]}/{z}/{y}/{x}.png`,
        projection: 'EPSG:3857',
    })
}

// LayerItem 데이터로 실제 OL 레이어 인스턴스 생성
// wmts-base → TileLayer(XYZ), wms → ImageLayer(WMS)
function createOLLayer(item: LayerItem): BaseLayer {
    if (item.type === 'wmts-base') {
        return new TileLayer({
            source: createXYZSource(item.id),
            visible: item.visible,
            opacity: item.opacity,
        })
    }
    return new ImageLayer({
        source: new ImageWMS({
            url: `https://api.vworld.kr/req/wms`,
            params: {
                SERVICE: 'WMS',
                VERSION: '1.3.0',
                REQUEST: 'GetMap',
                FORMAT: 'image/png',
                TRANSPARENT: 'TRUE',
                // ?? = Nullish 병합 연산자(ES6): null/undefined면 오른쪽 값 사용
                // || 와 달리 0이나 ''는 걸러내지 않음
                LAYERS: item.wmsLayers ?? item.id,
                STYLES: item.wmsStyles ?? item.id,
                CRS: 'EPSG:3857',
                KEY: API_KEY,
                DOMAIN: typeof window !== 'undefined' ? window.location.hostname : '',
            },
            ratio: 1,
            serverType: 'geoserver',
        }),
        visible: item.visible,
        opacity: item.opacity,
    })
}

// 레이어 트리에서 모든 LeafItem(LayerItem)을 평탄화해서 반환
function flattenAll(tree: LayerGroup[]): LayerItem[] {
    return flattenItems(tree.flatMap((g) => g.children))
}

export function useLayerManager(mapRef: React.RefObject<OLMap | null>) {
    const { tree } = useLayerStore()  // layerStore에서 트리 상태 구독
    const layers = flattenAll(tree)   // 트리를 평탄화해서 LayerItem[] 추출

    // key: 레이어 id, value: OL 레이어 인스턴스 → id로 빠르게 찾기 위해 사용
    const olLayersRef = useRef<Map<string, BaseLayer>>(new Map())

    // 지도 인스턴스가 생겼을 때 레이어를 지도에 등록
    // [mapRef.current]: mapRef.current가 바뀔 때(지도 생성 시)만 실행
    useEffect(() => {
        const map = mapRef.current
        if (!map) return

        olLayersRef.current.clear()

        layers.forEach((item) => {
            const olLayer = createOLLayer(item)       // OL 레이어 생성
            map.addLayer(olLayer)                     // 지도에 추가
            olLayersRef.current.set(item.id, olLayer) // id로 매핑 보관
        })

        // cleanup: 컴포넌트 사라질 때 지도에서 레이어 전부 제거
        return () => {
            olLayersRef.current.forEach((olLayer: BaseLayer) => {
                try {
                    map.removeLayer(olLayer)
                } catch {}
            })
            olLayersRef.current.clear()
        }
    }, [mapRef.current])

    // Store 상태가 바뀔 때마다 OL 레이어에 visible/opacity 동기화
    // [layers]: layerStore의 tree가 바뀌면 layers도 바뀌고 이 useEffect가 실행됨
    useEffect(() => {
        layers.forEach((item) => {
            const olLayer = olLayersRef.current.get(item.id)  // id로 OL 레이어 꺼냄
            if (!olLayer) return
            olLayer.setVisible(item.visible)   // Store의 visible 반영
            olLayer.setOpacity(item.opacity)   // Store의 opacity 반영
        })
    }, [layers])
}
