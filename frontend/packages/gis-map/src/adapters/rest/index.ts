// 짝 Spring 백엔드 REST 소스 어댑터({ success, message, data } 봉투). 주소·헤더는 호출 시점의 host에서 읽는다.
// layerTree(FE-4a) + myMap·geoTiff·wind(FE-4b)
import type { GisMapSourcesFactory } from '../../core'
import { restLayerTree } from './layerTree'
import type { RestLayerTreeOptions } from './layerTree'
import { restGeoTiff } from './geoTiff'
import { restMyMap } from './myMap'
import { restWind } from './wind'

export type RestSourcesOptions = RestLayerTreeOptions

export function restSources(opts: RestSourcesOptions = {}): GisMapSourcesFactory {
    return ctx => ({
        layerTree: restLayerTree(ctx, opts),
        myMap: restMyMap(ctx),
        geoTiff: restGeoTiff(ctx),
        wind: restWind(ctx),
    })
}

export { restLayerTree } from './layerTree'
export type { RestLayerTreeOptions } from './layerTree'
export { restGeoTiff } from './geoTiff'
export { restMyMap } from './myMap'
export { restWind } from './wind'
export { readEnvelope, apiUrl } from './envelope'
export type { ApiEnvelope } from './envelope'
