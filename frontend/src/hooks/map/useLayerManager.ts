import { useEffect, useRef } from 'react'
import OLMap from 'ol/Map'
import TileLayer from 'ol/layer/Tile'
import ImageLayer from 'ol/layer/Image'
import XYZ from 'ol/source/XYZ'
import ImageWMS from 'ol/source/ImageWMS'
import { useLayerStore } from '@/stores/layerStore'
import { LayerItem, LayerGroup, isLayerGroup, flattenItems } from '@/types/layer'
import BaseLayer from 'ol/layer/Base'

const API_KEY = process.env.NEXT_PUBLIC_VWORLD_API_KEY!

const VWORLD_LAYER_NAME: Record<string, string> = {
    'base-normal': 'Base',
    'base-satellite': 'Satellite',
    'base-hybrid': 'Hybrid',
}

function createXYZSource(layerId: string) {
    return new XYZ({
        url: `https://api.vworld.kr/req/wmts/1.0.0/${API_KEY}/${VWORLD_LAYER_NAME[layerId]}/{z}/{y}/{x}.png`,
        projection: 'EPSG:3857',
    })
}

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

function flattenAll(tree: LayerGroup[]): LayerItem[] {
    return flattenItems(tree.flatMap((g) => g.children))
}

export function useLayerManager(mapRef: React.RefObject<OLMap | null>) {
    const { tree } = useLayerStore()
    const layers = flattenAll(tree)
    const olLayersRef = useRef<globalThis.Map<string, BaseLayer>>(new globalThis.Map())

    // map 초기화 시 레이어 등록
    useEffect(() => {
        const map = mapRef.current
        if (!map) return

        olLayersRef.current.clear()

        layers.forEach((item) => {
            const olLayer = createOLLayer(item)
            map.addLayer(olLayer)
            olLayersRef.current.set(item.id, olLayer)
        })

        return () => {
            olLayersRef.current.forEach((olLayer: BaseLayer) => {
                try {
                    map.removeLayer(olLayer)
                } catch {}
            })
            olLayersRef.current.clear()
        }
    }, [mapRef.current])

    // visible, opacity 동기화
    useEffect(() => {
        layers.forEach((item) => {
            const olLayer = olLayersRef.current.get(item.id)
            if (!olLayer) return
            olLayer.setVisible(item.visible)
            olLayer.setOpacity(item.opacity)
        })
    }, [layers])
}
