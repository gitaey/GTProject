'use client'

import { useCallback } from 'react'
import OlMap from 'ol/Map'
import TileLayer from 'ol/layer/Tile'
import XYZ from 'ol/source/XYZ'
import { transformExtent } from 'ol/proj'

export interface GeoTiffItem {
  id: number
  originalName: string
  tileUrl: string
  uploadedAt: string
  fileSize: number
  status: string
  minLon?: number
  minLat?: number
  maxLon?: number
  maxLat?: number
}

// 패널 언마운트 시에도 레이어 상태 유지
const layerMap = new Map<number, TileLayer<XYZ>>()

export function useGeoTiffLayer(map: OlMap | null) {
  const addLayer = useCallback(async (item: GeoTiffItem) => {
    if (!map) return
    if (layerMap.has(item.id)) return

    const layerExtent = (item.minLon != null && item.minLat != null && item.maxLon != null && item.maxLat != null)
      ? transformExtent([item.minLon, item.minLat, item.maxLon, item.maxLat], 'EPSG:4326', 'EPSG:3857')
      : undefined

    const apiBase = process.env.NEXT_PUBLIC_API_URL || ''
    const layer = new TileLayer({
      source: new XYZ({ url: `${apiBase}${item.tileUrl}`, crossOrigin: 'anonymous' }),
      zIndex: 5,
      extent: layerExtent,
    })
    map.addLayer(layer)
    layerMap.set(item.id, layer)

    // 백엔드에서 받은 WGS84 bounds로 지도 이동
    if (item.minLon != null && item.minLat != null && item.maxLon != null && item.maxLat != null) {
      const extent = transformExtent(
        [item.minLon, item.minLat, item.maxLon, item.maxLat],
        'EPSG:4326',
        'EPSG:3857'
      )
      map.getView().fit(extent, { padding: [60, 60, 60, 60], duration: 800, maxZoom: 18 })
    }
  }, [map])

  const removeLayer = useCallback((id: number) => {
    if (!map) return
    const layer = layerMap.get(id)
    if (!layer) return
    map.removeLayer(layer)
    layerMap.delete(id)
  }, [map])

  const isVisible = useCallback((id: number): boolean => {
    return layerMap.has(id)
  }, [])

  return { addLayer, removeLayer, isVisible }
}
