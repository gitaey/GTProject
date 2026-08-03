import { useEffect, useRef } from 'react'
import OLMap from 'ol/Map'
import TileLayer from 'ol/layer/Tile'
import ImageLayer from 'ol/layer/Image'
import VectorLayer from 'ol/layer/Vector'
import VectorSource from 'ol/source/Vector'
import XYZ from 'ol/source/XYZ'
import ImageWMS from 'ol/source/ImageWMS'
import GeoJSON from 'ol/format/GeoJSON'
import { bbox as bboxStrategy } from 'ol/loadingstrategy'
import { useLayerStore, flattenGroupLayers, getLayerVisible, getLayerOpacity } from '@/stores/map/layerStore'
import { DbLayer } from '@/types/layer'
import BaseLayer from 'ol/layer/Base'

const VWORLD_KEY = process.env.NEXT_PUBLIC_VWORLD_API_KEY ?? ''
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'https://api.gitaey-dev.com'

function resolveUrl(url: string): string {
    return url.replace('{VWORLD_KEY}', VWORLD_KEY)
}


function createOLLayer(layer: DbLayer, visible: boolean, opacity: number, sldBody?: string): BaseLayer {
    const url = resolveUrl(layer.url)

    if (layer.type === 'WMS') {
        const isVWorld = url.includes('vworld.kr')
        const wmsParams: Record<string, string> = {
            LAYERS: layer.layerName ?? '',
            STYLES: '',
            FORMAT: layer.format ?? 'image/png',
            TRANSPARENT: 'TRUE',
        }
        if (isVWorld) {
            wmsParams['key'] = VWORLD_KEY
            if (sldBody) wmsParams['SLD_BODY'] = sldBody
        } else {
            wmsParams['STYLES'] = layer.styleName ?? ''
        }

        return new ImageLayer({
            source: new ImageWMS({
                url,
                params: wmsParams,
                ratio: 1,
                ...(isVWorld ? {} : { serverType: 'geoserver' }),
            }),
            visible,
            opacity,
            minZoom: layer.minZoom ?? undefined,
            maxZoom: layer.maxZoom ?? undefined,
        })
    }

    if (layer.type === 'WFS') {
        const layerName = layer.layerName ?? ''
        const format = new GeoJSON()
        const source = new VectorSource({ strategy: bboxStrategy })

        source.setLoader((extent, _resolution, projection) => {
            const url = `/proxy/wfs?TYPENAMES=${layerName}&BBOX=${extent.join(',')},EPSG:3857&SRSNAME=EPSG:3857`
            fetch(url)
                .then(r => r.json())
                .then(data => {
                    const features = format.readFeatures(data, { featureProjection: projection })
                    source.addFeatures(features)
                })
                .catch(() => source.removeLoadedExtent(extent))
        })

        return new VectorLayer({
            source,
            visible,
            opacity,
            minZoom: layer.minZoom ?? undefined,
            maxZoom: layer.maxZoom ?? undefined,
        })
    }

    // XYZ, WMTS, TMS
    return new TileLayer({
        source: new XYZ({
            url,
            projection: layer.projection ?? 'EPSG:3857',
            maxZoom: layer.maxZoom ?? 19,
        }),
        visible,
        opacity,
        minZoom: layer.minZoom ?? undefined,
    })
}

export function useLayerManager(map: OLMap | null) {
    const { tree, loadTree } = useLayerStore()
    const visibleMap = useLayerStore(s => s.visibleMap)
    const opacityMap = useLayerStore(s => s.opacityMap)
    const olLayersRef = useRef<Map<number, BaseLayer>>(new Map())

    useEffect(() => { loadTree() }, [loadTree])

    useEffect(() => {
        if (!map || !tree) return

        const allLayers = [...flattenGroupLayers(tree.groups), ...tree.ungroupedLayers]

        async function buildLayers() {
            const m = map!
            // VWorld WMS + style_name 레이어는 SLD_BODY로 스타일 적용
            const sldMap = new Map<string, string>()
            await Promise.all(
                allLayers
                    .filter(l => l.type === 'WMS' && l.url.includes('vworld.kr') && l.styleName && l.layerName)
                    .map(async l => {
                        try {
                            const res = await fetch(
                                `${API_URL}/api/geoserver/sld/${encodeURIComponent(l.styleName!)}/${encodeURIComponent(l.layerName!)}`,
                            )
                            if (res.ok) sldMap.set(l.id.toString(), await res.text())
                        } catch {}
                    })
            )

            olLayersRef.current.forEach(olLayer => { try { m.removeLayer(olLayer) } catch {} })
            olLayersRef.current.clear()

            allLayers.forEach(layer => {
                const sldBody = sldMap.get(layer.id.toString())
                const olLayer = createOLLayer(
                    layer,
                    getLayerVisible(visibleMap, layer),
                    getLayerOpacity(opacityMap, layer),
                    sldBody,
                )
                m.addLayer(olLayer)
                olLayersRef.current.set(layer.id, olLayer)
            })
        }

        buildLayers()
        return () => {
            olLayersRef.current.forEach(olLayer => {
                try { map.removeLayer(olLayer) } catch {}
            })
            olLayersRef.current.clear()
        }
    }, [map, tree])

    useEffect(() => {
        if (!tree) return
        const allLayers = [...flattenGroupLayers(tree.groups), ...tree.ungroupedLayers]
        allLayers.forEach(layer => {
            const olLayer = olLayersRef.current.get(layer.id)
            if (!olLayer) return
            olLayer.setVisible(getLayerVisible(visibleMap, layer))
            olLayer.setOpacity(getLayerOpacity(opacityMap, layer))
        })
    }, [visibleMap, opacityMap])
}
