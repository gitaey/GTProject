// 짝 Spring 백엔드 REST 소스 어댑터({ success, message, data } 봉투). 주소·헤더는 호출 시점의 host에서 읽는다.
// layerTree(FE-4a) + myMap·geoTiff·wind(FE-4b) + parcelBuildings(필지 정보 카드의 건물 칸) + startView(계정 저장 시작 화면)·dataInfo(데이터 기준 정보)
// startView·dataInfo는 짝 백엔드가 그 API를 모르면(404) 설정 패널의 카드가 조용히 빠진다
import type { GisMapSourcesFactory } from '../../core'
import { restLayerTree } from './layerTree'
import type { RestLayerTreeOptions } from './layerTree'
import { restGeoTiff } from './geoTiff'
import { restMyMap } from './myMap'
import { restWind } from './wind'
import { restParcelBuildings } from './parcelBuildings'
import { restShareDirectory } from './shareDirectory'
import { restStartView } from './startView'
import { restDataInfo } from './dataInfo'

export type RestSourcesOptions = RestLayerTreeOptions

export function restSources(opts: RestSourcesOptions = {}): GisMapSourcesFactory {
    return ctx => ({
        layerTree: restLayerTree(ctx, opts),
        myMap: restMyMap(ctx),
        geoTiff: restGeoTiff(ctx),
        wind: restWind(ctx),
        parcelBuildings: restParcelBuildings(ctx),
        shareDirectory: restShareDirectory(ctx),
        startView: restStartView(ctx),
        dataInfo: restDataInfo(ctx),
    })
}

export { restLayerTree } from './layerTree'
export type { RestLayerTreeOptions } from './layerTree'
export { restGeoTiff } from './geoTiff'
export { restMyMap } from './myMap'
export { restWind } from './wind'
export { restParcelBuildings } from './parcelBuildings'
export { restShareDirectory } from './shareDirectory'
export type { RestStartViewOptions } from './startView'
export { restStartView, START_VIEW_LOAD_TIMEOUT_MS, START_VIEW_WRITE_TIMEOUT_MS } from './startView'
export { restDataInfo, mapRefStatus, mapWindFrames } from './dataInfo'
export type { RestDataInfoOptions } from './dataInfo'
export { readEnvelope, apiUrl } from './envelope'
export type { ApiEnvelope } from './envelope'
