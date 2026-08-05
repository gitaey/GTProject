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
import { useLayerStore, flattenGroupLayers, getLayerVisible, getLayerOpacity, getBasemapVisibility } from '@/stores/map/layerStore'
import { DbLayer } from '@/types/layer'
import BaseLayer from 'ol/layer/Base'

const VWORLD_KEY = process.env.NEXT_PUBLIC_VWORLD_API_KEY ?? ''

function resolveUrl(url: string): string {
    return url.replace('{VWORLD_KEY}', VWORLD_KEY)
}


function createOLLayer(layer: DbLayer, visible: boolean, opacity: number): BaseLayer {
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
    const basemapMode = useLayerStore(s => s.basemapMode)
    const olLayersRef = useRef<Map<number, BaseLayer>>(new Map())

    function resolveVisible(layer: DbLayer): boolean {
        const basemapOverride = getBasemapVisibility(layer, basemapMode)
        if (basemapOverride !== null) return basemapOverride
        return getLayerVisible(visibleMap, layer)
    }

    useEffect(() => { loadTree() }, [loadTree])

    useEffect(() => {
        if (!map || !tree) return

        const allLayers = [...flattenGroupLayers(tree.groups), ...tree.ungroupedLayers]

        function buildLayers() {
            const m = map!
            olLayersRef.current.forEach(olLayer => { try { m.removeLayer(olLayer) } catch {} })
            olLayersRef.current.clear()
            allLayers.forEach(layer => {
                const olLayer = createOLLayer(layer, resolveVisible(layer), getLayerOpacity(opacityMap, layer))
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
            olLayer.setVisible(resolveVisible(layer))
            olLayer.setOpacity(getLayerOpacity(opacityMap, layer))
        })
    }, [visibleMap, opacityMap, basemapMode])
}
