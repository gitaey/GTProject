// 호스트 프록시(VWorld·WFS·범례) 소스 어댑터. 호스트가 {proxyBaseUrl} 아래
// /vworld/search, /vworld/data, /vworld/legend-style, /wfs, /region 을 제공해야 한다.
// legend·wfs(FE-4a) + addressSearch·parcel·regionName(FE-4b) + areaQuery(영역 분석: VWorld는 위 프록시, GeoServer는 브라우저 직접 — 그 서버의 CORS 필요)
import type { GisMapSourcesFactory } from '../../core'
import { proxyAreaQuery } from './areaQuery'
import type { ProxyAreaQueryOptions } from './areaQuery'
import { proxyLegend } from './legend'
import { proxyWfs } from './wfs'
import { proxyAddressSearch, proxyParcel, proxyRegionName } from './vworld'

export interface ProxySourcesOptions {
    /** 영역 분석 질의 옵션(VWorld 이름표·GeoServer WFS 주소·보내는 꼭짓점 상한) */
    areaQuery?: ProxyAreaQueryOptions
}

export function proxySources(options: ProxySourcesOptions = {}): GisMapSourcesFactory {
    return ctx => ({
        addressSearch: proxyAddressSearch(ctx),
        parcel: proxyParcel(ctx),
        regionName: proxyRegionName(ctx),
        legend: proxyLegend(ctx),
        wfs: proxyWfs(ctx),
        areaQuery: proxyAreaQuery(ctx, options.areaQuery),
    })
}

export { proxyLegend, parseVWorldLegendStyle, geoserverLegendUrl } from './legend'
export { proxyWfs } from './wfs'
export { proxyAddressSearch, proxyParcel, proxyRegionName, stripLotNumber } from './vworld'
export { proxyAreaQuery } from './areaQuery'
export type { ProxyAreaQueryOptions } from './areaQuery'
export { jimokOf } from './areaQueryVWorld'
export { reduceRing, ringToWkt, mercatorToLonLat, MAX_FILTER_VERTICES } from './areaQueryShared'
