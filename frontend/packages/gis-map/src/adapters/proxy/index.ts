// 호스트 프록시(VWorld·WFS·범례) 소스 어댑터. 호스트가 {proxyBaseUrl} 아래
// /vworld/search, /vworld/data, /vworld/legend-style, /wfs, /region 을 제공해야 한다.
// legend·wfs(FE-4a) + addressSearch·parcel·regionName(FE-4b)
import type { GisMapSourcesFactory } from '../../core'
import { proxyLegend } from './legend'
import { proxyWfs } from './wfs'
import { proxyAddressSearch, proxyParcel, proxyRegionName } from './vworld'

export function proxySources(): GisMapSourcesFactory {
    return ctx => ({
        addressSearch: proxyAddressSearch(ctx),
        parcel: proxyParcel(ctx),
        regionName: proxyRegionName(ctx),
        legend: proxyLegend(ctx),
        wfs: proxyWfs(ctx),
    })
}

export { proxyLegend, parseVWorldLegendStyle, geoserverLegendUrl } from './legend'
export { proxyWfs } from './wfs'
export { proxyAddressSearch, proxyParcel, proxyRegionName, stripLotNumber } from './vworld'
