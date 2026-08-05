'use client'

import { useEffect, useRef } from 'react'
import Map from 'ol/Map'
import VectorLayer from 'ol/layer/Vector'
import VectorSource from 'ol/source/Vector'
import type { Geometry } from 'ol/geom'
import GeoJSON from 'ol/format/GeoJSON'
import Feature from 'ol/Feature'
import Point from 'ol/geom/Point'
import { getCenter } from 'ol/extent'
import { Style, Fill, Stroke, Icon, Text } from 'ol/style'
import { fromLonLat } from 'ol/proj'
import { registerParcelHighlighter, onClear } from '@/stores/map/mapStore'

const PIN_SVG = encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="36" viewBox="0 0 28 36">
  <path d="M14 0C6.268 0 0 6.268 0 14c0 9.333 14 22 14 22S28 23.333 28 14C28 6.268 21.732 0 14 0z" fill="#F26722"/>
  <circle cx="14" cy="14" r="6" fill="white"/>
  <circle cx="14" cy="14" r="3.5" fill="#F26722"/>
</svg>`
)

const PARCEL_STYLE = new Style({
    fill: new Fill({ color: 'rgba(59,130,246,0.15)' }),
    stroke: new Stroke({ color: '#2563eb', width: 2 }),
})

function makePinStyle(title?: string): Style[] {
    const styles: Style[] = [
        new Style({
            image: new Icon({
                src: `data:image/svg+xml;utf8,${PIN_SVG}`,
                anchor: [0.5, 1],
                anchorXUnits: 'fraction',
                anchorYUnits: 'fraction',
            }),
        }),
    ]

    if (title) {
        const text = title
        styles.push(new Style({
            text: new Text({
                text,
                font: 'bold 13px -apple-system, sans-serif',
                offsetY: -52,
                textAlign: 'center',
                fill: new Fill({ color: '#1a1a1a' }),
                stroke: new Stroke({ color: 'rgba(255,255,255,0.9)', width: 4 }),
            }),
        }))
    }

    return styles
}

export function useParcelHighlight(map: Map | null) {
    const layerRef = useRef<VectorLayer<Feature<Geometry>> | null>(null)
    const mapRef = useRef(map)
    mapRef.current = map

    useEffect(() => {
        if (!map) return

        const highlight = (lon: number, lat: number, title?: string) => {
            const currentMap = mapRef.current
            if (!currentMap) return

            // 기존 레이어 제거
            if (layerRef.current) {
                currentMap.removeLayer(layerRef.current)
                layerRef.current = null
            }

            // 핀 즉시 표시 (searched 좌표)
            const pinFeature = new Feature({ geometry: new Point(fromLonLat([lon, lat])) })
            pinFeature.setStyle(makePinStyle(title))

            const source = new VectorSource<Feature<Geometry>>({ features: [pinFeature as Feature<Geometry>] })
            const layer = new VectorLayer<Feature<Geometry>>({ source, zIndex: 200 })
            currentMap.addLayer(layer)
            layerRef.current = layer

            // 필지 폴리곤 비동기 로드 → 핀을 폴리곤 중심으로 이동
            const url =
                `/proxy/vworld/data?service=data&version=2.0&request=GetFeature` +
                `&format=json&size=1&page=1&crs=EPSG:4326` +
                `&data=LP_PA_CBND_BUBUN&geomFilter=POINT(${lon}%20${lat})`

            fetch(url)
                .then(r => r.json())
                .then((json: any) => {
                    if (json?.response?.status !== 'OK') return
                    const features = json?.response?.result?.featureCollection?.features
                    if (!Array.isArray(features) || !features.length) return
                    if (!mapRef.current) return

                    const olFeatures = new GeoJSON().readFeatures(
                        { type: 'FeatureCollection', features },
                        { featureProjection: 'EPSG:3857' },
                    )
                    if (!olFeatures.length) return

                    olFeatures.forEach(f => f.setStyle(PARCEL_STYLE))

                    // 핀을 폴리곤 중심으로 이동
                    const extent = olFeatures[0].getGeometry()?.getExtent()
                    if (extent) {
                        pinFeature.setGeometry(new Point(getCenter(extent)))
                    }

                    source.addFeatures(olFeatures)
                })
                .catch(() => {})
        }

        registerParcelHighlighter(highlight)

        const unsubscribe = onClear(() => {
            if (layerRef.current) {
                map.removeLayer(layerRef.current)
                layerRef.current = null
            }
        })

        return () => {
            registerParcelHighlighter(null)
            unsubscribe()
        }
    }, [map])

    useEffect(() => {
        return () => {
            if (layerRef.current && mapRef.current) {
                mapRef.current.removeLayer(layerRef.current)
            }
        }
    }, [])
}
