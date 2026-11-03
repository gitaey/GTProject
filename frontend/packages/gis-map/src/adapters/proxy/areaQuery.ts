// 영역 분석 원격 질의 소스(sources.areaQuery) — 레이어 종류로 갈라 VWorld Data API(호스트 프록시)와 GeoServer WFS(브라우저 직접)에 보낸다.
// 호스트 조건: VWorld는 {proxyBaseUrl}/vworld/data 프록시가 필요하다(키를 숨긴다). GeoServer는 브라우저에서 직접 부르므로 그 서버가 CORS를 허용해야 한다
// (Access-Control-Allow-Origin — 같은 출처 프록시 뒤에 있으면 레이어 주소를 그 프록시로 두면 된다). 우리 로그인 토큰은 GeoServer로 보내지 않는다.
import { AreaQueryUnsupportedError } from '../../core'
import type { AreaQueryLayerInfo, AreaQueryPage, AreaQuerySource, LayerDef, SourceContext } from '../../core'
import { createGeoServerAreaQuery } from './areaQueryGeoServer'
import type { GeoServerAreaQueryOptions } from './areaQueryGeoServer'
import { createVWorldAreaQuery } from './areaQueryVWorld'

export interface ProxyAreaQueryOptions {
    /** VWorld WMS 레이어 이름 → Data API 이름 덮어쓰기(기본 = 대문자). null이면 기본 규칙 */
    vworldDataName?(wmsName: string): string | null
    /** GeoServer 레이어의 WFS 주소 정하기 */
    geoserverWfsUrl?: GeoServerAreaQueryOptions['wfsUrl']
    /** 서버에 보내는 영역의 꼭짓점 상한(기본 200). 넘으면 볼록 껍질·범위 사각형으로 줄여 보낸다(브라우저가 원래 영역으로 다시 판정) */
    maxFilterVertices?: number
}

export function proxyAreaQuery(ctx: SourceContext, options: ProxyAreaQueryOptions = {}): AreaQuerySource {
    const vworld = createVWorldAreaQuery(ctx, options.vworldDataName, options.maxFilterVertices)
    const geoserver = createGeoServerAreaQuery(ctx, { wfsUrl: options.geoserverWfsUrl, maxVertices: options.maxFilterVertices })
    const none = (): never => { throw new AreaQueryUnsupportedError('짝 질의 수단이 없는 레이어') }

    return {
        async describe(layer: LayerDef, part: string | undefined, signal?: AbortSignal): Promise<AreaQueryLayerInfo> {
            if (vworld.matches(layer)) return vworld.describe(layer, part)
            if (geoserver.matches(layer)) return geoserver.describe(layer, signal)
            return { queryable: false, reason: '짝 질의 수단이 없는 레이어' }
        },
        async count(layer: LayerDef, part: string | undefined, ring4326: number[][], signal?: AbortSignal): Promise<number | null> {
            if (geoserver.matches(layer) && !vworld.matches(layer)) return geoserver.count(layer, ring4326, signal)
            return null
        },
        async query(layer: LayerDef, part: string | undefined, ring4326: number[][], page: number, signal?: AbortSignal): Promise<AreaQueryPage> {
            if (vworld.matches(layer)) return vworld.query(layer, part, ring4326, page, signal)
            if (geoserver.matches(layer)) return geoserver.query(layer, ring4326, page, signal)
            return none()
        },
    }
}
