// DB 레이어 정의(LayerDef) → OL 레이어. 옛 hooks/map/useLayerManager.ts의 createOLLayer를 그대로 옮겼다.
// 달라진 점은 "주입" 방식뿐이다: VWorld 키·URL 가공은 resolveUrl, WFS 요청 주소는 WfsSource, 요청은 HttpClient,
// WMS/WFS zIndex는 설정값(기본 10). XYZ(배경지도)는 옛날처럼 zIndex를 주지 않는다.
import ImageLayer from 'ol/layer/Image'
import TileLayer from 'ol/layer/Tile'
import VectorLayer from 'ol/layer/Vector'
import ImageWMS from 'ol/source/ImageWMS'
import VectorSource from 'ol/source/Vector'
import XYZ from 'ol/source/XYZ'
import GeoJSON from 'ol/format/GeoJSON'
import { bbox as bboxStrategy } from 'ol/loadingstrategy'
import type BaseLayer from 'ol/layer/Base'
import type { GisMapHost } from '../host'
import type { HttpClient } from '../http'
import type { WfsSource } from '../sources'
import type { LayerDef } from '../types/layer'
import { isVWorldUrl } from './resolveLayerUrl'
import type { LayerUrlResolver } from './resolveLayerUrl'

export interface CreateOlLayerOptions {
    visible: boolean
    opacity: number
    /** WMS/WFS 레이어 zIndex(엔진 기본 10) */
    zIndex: number
    host: GisMapHost
    resolveUrl: LayerUrlResolver
    http: HttpClient
    /** 없으면 WFS 레이어는 비어 있는 채로 만든다(요청 안 함) */
    wfs?: WfsSource
}

export function createOlLayer(layer: LayerDef, opts: CreateOlLayerOptions): BaseLayer {
    const resolved = opts.resolveUrl(layer, opts.host)
    const url = resolved.url

    if (layer.type === 'WMS') {
        const isVWorld = isVWorldUrl(url)
        const wmsParams: Record<string, string> = {
            LAYERS: layer.layerName ?? '',
            STYLES: '',
            FORMAT: layer.format ?? 'image/png',
            TRANSPARENT: 'TRUE',
        }
        if (!isVWorld) wmsParams['STYLES'] = layer.styleName ?? ''
        Object.assign(wmsParams, resolved.params)

        return new ImageLayer({
            source: new ImageWMS({
                url,
                params: wmsParams,
                ratio: 1,
                ...(isVWorld ? {} : { serverType: 'geoserver' as const }),
            }),
            visible: opts.visible,
            opacity: opts.opacity,
            zIndex: opts.zIndex,
            minZoom: layer.minZoom ?? undefined,
            maxZoom: layer.maxZoom ?? undefined,
        })
    }

    if (layer.type === 'WFS') {
        const layerName = layer.layerName ?? ''
        const format = new GeoJSON()
        const source = new VectorSource({ strategy: bboxStrategy })
        const wfs = opts.wfs
        const http = opts.http

        if (wfs) {
            source.setLoader((extent, _resolution, projection) => {
                const requestUrl = wfs.getFeatureUrl(layerName, extent, projection.getCode())
                http.fetch(requestUrl)
                    .then(r => r.json())
                    .then(data => {
                        const features = format.readFeatures(data, { featureProjection: projection })
                        source.addFeatures(features)
                    })
                    .catch(() => source.removeLoadedExtent(extent))
            })
        }

        return new VectorLayer({
            source,
            visible: opts.visible,
            opacity: opts.opacity,
            zIndex: opts.zIndex,
            minZoom: layer.minZoom ?? undefined,
            maxZoom: layer.maxZoom ?? undefined,
        })
    }

    // XYZ, WMTS, TMS (그 밖의 종류도 옛날처럼 여기로). projection이 없으면 OL XYZ 기본값(웹 메르카토르 타일)
    return new TileLayer({
        source: new XYZ({
            url,
            projection: layer.projection ?? undefined,
            maxZoom: layer.maxZoom ?? 19,
        }),
        visible: opts.visible,
        opacity: opts.opacity,
        minZoom: layer.minZoom ?? undefined,
    })
}
