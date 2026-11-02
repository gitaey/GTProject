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
import type { LayerCrossOriginResolver, LayerUrlResolver } from './resolveLayerUrl'

export interface CreateOlLayerOptions {
    visible: boolean
    opacity: number
    /** WMS/WFS 레이어 zIndex(엔진 기본 10) */
    zIndex: number
    host: GisMapHost
    resolveUrl: LayerUrlResolver
    /** 이미지 crossOrigin 규칙(없으면 안 붙임 — 옛 동작) */
    crossOrigin?: LayerCrossOriginResolver
    http: HttpClient
    /** 없으면 WFS 레이어는 비어 있는 채로 만든다(요청 안 함) */
    wfs?: WfsSource
}

/**
 * crossOrigin을 안 붙이는 이미지 레이어의 className. OL은 className이 같은 레이어를 한 캔버스에 겹쳐 그리는데,
 * CORS 없는 그림이 한 번 닿은 캔버스는 레이어를 꺼도 오염(저장 불가)된 채 남는다 → 따로 두면 레이어와 함께 캔버스도 사라진다.
 */
const NO_CORS_CLASS = 'ol-layer gm-nocors'

export function createOlLayer(layer: LayerDef, opts: CreateOlLayerOptions): BaseLayer {
    const resolved = opts.resolveUrl(layer, opts.host)
    const url = resolved.url
    const crossOrigin = opts.crossOrigin?.(layer, url) ?? null
    const layerClass = crossOrigin ? {} : { className: NO_CORS_CLASS }

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

        const wms = new ImageLayer({
            source: new ImageWMS({
                url,
                params: wmsParams,
                ratio: 1,
                ...(crossOrigin ? { crossOrigin } : {}),
                ...(isVWorld ? {} : { serverType: 'geoserver' as const }),
            }),
            visible: opts.visible,
            opacity: opts.opacity,
            zIndex: opts.zIndex,
            minZoom: layer.minZoom ?? undefined,
            maxZoom: layer.maxZoom ?? undefined,
            ...layerClass,
        })
        wms.set('gmLayerName', layer.name)
        return wms
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
    const tile = new TileLayer({
        source: new XYZ({
            url,
            projection: layer.projection ?? undefined,
            maxZoom: layer.maxZoom ?? 19,
            ...(crossOrigin ? { crossOrigin } : {}),
        }),
        visible: opts.visible,
        opacity: opts.opacity,
        minZoom: layer.minZoom ?? undefined,
        ...layerClass,
    })
    tile.set('gmLayerName', layer.name)
    return tile
}
