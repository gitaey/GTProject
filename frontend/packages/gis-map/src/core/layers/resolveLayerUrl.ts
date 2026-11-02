// 레이어 URL/요청 파라미터 가공. 기본 동작은 옛 useLayerManager.createOLLayer 그대로:
//   '{VWORLD_KEY}' 치환(첫 번째 한 곳만 — 옛 String.replace), VWorld WMS면 key 파라미터 추가.
// 호스트가 다른 규칙(프록시 경유, 다른 키 치환자)을 쓰려면 config.layers.resolveUrl로 바꾼다.
import type { GisMapHost } from '../host'
import type { LayerDef } from '../types/layer'

export interface ResolvedLayerUrl {
    url: string
    /** WMS 요청 파라미터에 덧붙일 값(기본 파라미터 뒤에 붙는다) */
    params?: Record<string, string>
}

export type LayerUrlResolver = (layer: LayerDef, host: GisMapHost) => ResolvedLayerUrl

/** VWorld 주소인가(옛 판정: 주소에 'vworld.kr' 포함) */
export function isVWorldUrl(url: string): boolean {
    return url.includes('vworld.kr')
}

/** 레이어 이미지 요청의 crossOrigin 값(null = 안 붙임). url = 가공이 끝난(resolveUrl 적용 후) 요청 주소 */
export type LayerCrossOriginResolver = (layer: LayerDef, url: string) => 'anonymous' | 'use-credentials' | null

/** VWorld 타일(XYZ/WMTS) 주소인가 — api.vworld.kr/req/wmts · xdworld.vworld.kr */
export function isVWorldTileUrl(url: string): boolean {
    return url.includes('api.vworld.kr/req/wmts') || url.includes('xdworld.vworld.kr')
}

/**
 * 기본 규칙: VWorld 타일(XYZ)만 'anonymous'(서버가 Access-Control-Allow-Origin: *를 준다) — 출력(PNG·PDF) 저장이 되게 한다.
 * WMS(VWorld·GeoServer)는 서버 CORS를 모르므로 안 붙인다(붙였는데 서버가 안 주면 레이어가 사라진다). 바꾸려면 config.layers.crossOrigin
 */
export const defaultLayerCrossOrigin: LayerCrossOriginResolver = (layer, url) =>
    layer.type !== 'WMS' && layer.type !== 'WFS' && isVWorldTileUrl(url) ? 'anonymous' : null

export const defaultResolveLayerUrl: LayerUrlResolver = (layer, host) => {
    const url = layer.url.replace('{VWORLD_KEY}', host.keys.vworld)
    if (layer.type === 'WMS' && isVWorldUrl(url)) return { url, params: { key: host.keys.vworld } }
    return { url }
}
