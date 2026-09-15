'use client'

// 나만의지도 레이어 — /api/mymap/{id}/geojson 을 받아 OL VectorLayer로 표시한다.
// GeoTiffLayer(useGeoTiffLayer.ts)와 동일한 패턴: 패널이 언마운트돼도 레이어 상태를 유지.
import { useCallback } from 'react'
import OlMap from 'ol/Map'
import Feature from 'ol/Feature'
import Geometry from 'ol/geom/Geometry'
import VectorLayer from 'ol/layer/Vector'
import VectorSource from 'ol/source/Vector'
import GeoJSON from 'ol/format/GeoJSON'
import { Style, Fill, Stroke, Circle as CircleStyle } from 'ol/style'
import { getToken } from '@/stores/authStore'

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8080'

function authHeaders(): Record<string, string> {
    const token = getToken()
    return token ? { Authorization: `Bearer ${token}` } : {}
}

function styleFor(color: string): Style {
    return new Style({
        fill: new Fill({ color: `${color}33` }),
        stroke: new Stroke({ color, width: 2 }),
        image: new CircleStyle({ radius: 5, fill: new Fill({ color }), stroke: new Stroke({ color: '#fff', width: 1 }) }),
    })
}

const DEFAULT_COLOR = '#F26722'

const layerMap = new Map<number, VectorLayer<Feature<Geometry>>>()

export function useMyMapLayers(map: OlMap | null) {
    const addLayer = useCallback(async (id: number, color?: string) => {
        if (!map) return
        if (layerMap.has(id)) return

        const res = await fetch(`${API}/api/mymap/${id}/geojson`, { headers: authHeaders() })
        if (!res.ok) return
        const geojson = await res.json()

        const source = new VectorSource({
            features: new GeoJSON().readFeatures(geojson, {
                dataProjection: 'EPSG:4326',
                featureProjection: 'EPSG:3857',
            }),
        })
        const layer = new VectorLayer<Feature<Geometry>>({
            source,
            zIndex: 6,
            style: styleFor(color ?? DEFAULT_COLOR),
        })
        map.addLayer(layer)
        layerMap.set(id, layer)
    }, [map])

    const removeLayer = useCallback((id: number) => {
        if (!map) return
        const layer = layerMap.get(id)
        if (!layer) return
        map.removeLayer(layer)
        layerMap.delete(id)
    }, [map])

    const isVisible = useCallback((id: number): boolean => layerMap.has(id), [])

    // 레이어가 아직 지도에 없으면(체크 안 된 상태) 먼저 불러온 뒤, 피처 범위로 지도를 이동한다.
    const zoomTo = useCallback(async (id: number, color?: string) => {
        if (!map) return
        if (!layerMap.has(id)) {
            await addLayer(id, color)
        }
        const layer = layerMap.get(id)
        const extent = layer?.getSource()?.getExtent()
        if (!extent || extent.some(v => !Number.isFinite(v))) return
        map.getView().fit(extent, { padding: [60, 60, 60, 60], duration: 500, maxZoom: 18 })
    }, [map, addLayer])

    return { addLayer, removeLayer, isVisible, zoomTo }
}
