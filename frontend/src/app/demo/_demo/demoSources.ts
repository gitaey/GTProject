// 공개 데모(/demo/map) 데이터 공급원 조립 — 패키지 adapters/memory(합성 샘플 한 벌) + 자체 GeoServer 직접 호출(영역 분석·범례).
// 저장소는 만들 때마다 새 객체(모듈 최상위 가변 상태 없음): 페이지가 useState로 한 번 만들고, "데모 초기화"는 다시 만들어 Provider key를 바꾼다.
// 서버(/api·/proxy) 호출은 없다 — 밖으로 나가는 것은 배경 타일과 GeoServer(WMS 그림·범례 그림·영역 질의 WFS)뿐이다.
import { demoSources, demoLayerCrossOrigin } from '@gtp/gis-map/adapters/memory'
import type { DemoBasemap, DemoSources } from '@gtp/gis-map/adapters/memory'
import { geoserverLegendUrl, proxyAreaQuery } from '@gtp/gis-map/adapters/proxy'
import type {
    AreaQueryLayerInfo, AreaQueryPage, AreaQuerySource, GeoJsonObject, GisMapSourcesFactory, LayerCrossOriginResolver, LayerDef, LayerGroupDef,
    LegendSource, MyMapSource, SourceContext,
} from '@gtp/gis-map/core'
import { DEMO_GEOSERVER_URL } from './demoHost'

/** 모바일 판정(투어·큰 데이터 개수). 서버·matchMedia 없는 환경은 false */
export const MOBILE_QUERY = '(max-width: 767px)'

export function isMobileViewport(): boolean {
    return typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(MOBILE_QUERY).matches
}

/** 큰 합성 점 개수: 데스크톱 2만·10만, 모바일 2만(10만은 메모리 약 280MB) */
export const DEMO_BIG_COUNTS_DESKTOP: readonly number[] = Object.freeze([20000, 100000])
export const DEMO_BIG_COUNTS_MOBILE: readonly number[] = Object.freeze([20000])

/** 트리의 GeoServer 경계 레이어 이름(투어가 이름으로 켠다) */
export const DEMO_BOUNDARY_LAYER = '시군구 경계'

/** GeoServer에 실제로 있는 경계 레이어(워크스페이스 gtp, WFS 발행 확인된 것) */
const BOUNDARY_LAYERS: ReadonlyArray<{ id: number; name: string; layerName: string }> = Object.freeze([
    { id: 31, name: DEMO_BOUNDARY_LAYER, layerName: 'gtp:tl_scco_sgg' },
    { id: 32, name: '읍면동 경계', layerName: 'gtp:tl_scco_emd' },
    { id: 33, name: '리 경계', layerName: 'gtp:tl_scco_li' },
])

function boundaryGroup(): LayerGroupDef {
    const layers: LayerDef[] = BOUNDARY_LAYERS.map((b, i) => ({
        id: b.id, name: b.name, type: 'WMS', sourceType: 'GEOSERVER', url: DEMO_GEOSERVER_URL + '/gtp/wms', layerName: b.layerName,
        styleName: null, styleConfig: null, format: 'image/png', projection: null, minZoom: null, maxZoom: null, opacity: 0.8, visible: false,
        sortOrder: i, groupId: 3, groupName: null, description: '실제 GeoServer가 그리는 행정경계(영역 분석 대상)', createdAt: '', updatedAt: '',
    }))
    return { id: 3, name: '행정경계(GeoServer)', parentId: null, sortOrder: 2, children: [], layers }
}

/** 'demo://' 자리 레이어(합성 필지·용도지역) 인가 */
function isDemoLayer(layer: LayerDef): boolean {
    return layer.url.indexOf('demo://') === 0
}

function isDemoGeoServerLayer(layer: LayerDef): boolean {
    return layer.sourceType === 'GEOSERVER' && layer.url.indexOf(DEMO_GEOSERVER_URL + '/') === 0
}

/**
 * 영역 분석 질의 라우터 — 합성 레이어는 메모리, 우리 GeoServer 레이어는 GeoServer 직접(proxy 어댑터의 GeoServer 질의 = fetchExternal, 토큰·쿠키 없음).
 * 그 밖의 레이어(VWorld 등)는 질의하지 않는다: VWorld Data API는 /proxy(로그인 필요)가 필요해 웹 데모에서는 쓰지 않는다.
 */
export function routeAreaQuery(local: AreaQuerySource | undefined, remote: AreaQuerySource): AreaQuerySource {
    const pick = (layer: LayerDef): AreaQuerySource | null => (isDemoLayer(layer) ? local ?? null : isDemoGeoServerLayer(layer) ? remote : null)
    return {
        describe(layer: LayerDef, part: string | undefined, signal?: AbortSignal): Promise<AreaQueryLayerInfo> {
            const src = pick(layer)
            if (!src) return Promise.resolve({ queryable: false, reason: '데모에서는 샘플 레이어와 GeoServer 행정경계만 분석합니다' })
            return src.describe(layer, part, signal)
        },
        count(layer: LayerDef, part: string | undefined, ring4326: number[][], signal?: AbortSignal): Promise<number | null> {
            const src = pick(layer)
            return src && src.count ? src.count(layer, part, ring4326, signal) : Promise.resolve(null)
        },
        query(layer: LayerDef, part: string | undefined, ring4326: number[][], page: number, signal?: AbortSignal): Promise<AreaQueryPage> {
            const src = pick(layer)
            if (!src) return Promise.resolve({ features: [], total: 0, hasMore: false })
            return src.query(layer, part, ring4326, page, signal)
        },
    }
}

/** 범례: GeoServer 그림(GetLegendGraphic URL — 브라우저가 이미지로 직접 읽음). VWorld 범례는 프록시가 필요해 비운다 */
function demoLegend(ctx: SourceContext): LegendSource {
    return {
        vworldLegend: () => Promise.resolve([]),
        imageUrl: (layer: LayerDef) => geoserverLegendUrl(ctx.host().endpoints.geoserverUrl, layer),
    }
}

/** 레이어 이미지 crossOrigin: 패키지 규칙(VWorld·OSM 타일) + CORS를 확인한 우리 GeoServer WMS(출력 PNG·PDF 저장이 되게) */
export const demoCrossOrigin: LayerCrossOriginResolver = (layer, url) => {
    const base = demoLayerCrossOrigin(layer, url)
    if (base) return base
    return layer.type === 'WMS' && url.indexOf(DEMO_GEOSERVER_URL + '/') === 0 ? 'anonymous' : null
}

export interface DemoBundleOptions {
    /** 비어 있으면 OSM 배경만(VWorld 레이어 없음) */
    vworldKey: string
    mobile: boolean
    /** 시험용 — 시드 고정·바람 기준 시각 */
    seed?: number
    now?: number
}

export interface DemoBundle {
    demo: DemoSources
    /** GisMapConfig.sources에 넣는 팩토리(엔진 생성 때 1번 불린다) */
    sources: GisMapSourcesFactory
    basemap: DemoBasemap
    /** 가장 큰 합성 점 레이어(나만의지도 id)와 사람이 읽는 개수 */
    bigLayerId: number
    bigLabel: string
}

function bigLabelOf(count: number): string {
    return count >= 10000 ? count / 10000 + '만' : String(count)
}

/**
 * 나만의지도 소스의 `geojson(id)` 결과를 id별로 한 번만 만들어 여러 지도(화면 분할 1~4번)가 같은 객체를 나눠 쓰게 한다.
 * 메모리 소스는 `geojson()`을 부를 때마다 10만 점을 새로 만든다 → 칸 수만큼 생성 시간이 든다. 엔진은 입력을 읽기만 해서(피처마다 readFeature) 공유해도 안전하다.
 * 캐시는 이 함수를 부를 때마다 만들어지는 클로저의 Map이다(모듈 전역 아님 — 데모 한 벌마다 하나, "데모 초기화"하면 새로).
 * 실패한 요청은 캐시에 남기지 않고, 삭제(`remove`)하면 그 id의 캐시도 버린다. 합성 데이터는 바뀌지 않으므로 그 밖의 무효화는 없다.
 */
export function cacheMyMapGeojson(src: MyMapSource): MyMapSource {
    const cache = new Map<number, Promise<GeoJsonObject>>()
    return {
        ...src,
        geojson(id: number): Promise<GeoJsonObject> {
            const hit = cache.get(id)
            if (hit) return hit
            const made = src.geojson(id)
            cache.set(id, made)
            made.catch(() => { if (cache.get(id) === made) cache.delete(id) })
            return made
        },
        remove(id: number): Promise<void> {
            cache.delete(id)
            return src.remove(id)
        },
    }
}

export function createDemoBundle(opts: DemoBundleOptions): DemoBundle {
    const hasKey = opts.vworldKey.trim() !== ''
    const basemap: DemoBasemap = hasKey ? 'both' : 'osm'
    const counts = opts.mobile ? DEMO_BIG_COUNTS_MOBILE : DEMO_BIG_COUNTS_DESKTOP
    const demo = demoSources({
        basemap, vworldKey: opts.vworldKey, bigCounts: Array.from(counts), extraGroups: [boundaryGroup()], seed: opts.seed, now: opts.now,
    })
    // 번들 한 벌에 하나(팩토리 밖) — 팩토리는 엔진마다 불리지만 이 캐시는 모든 지도가 함께 쓴다
    const myMap = demo.sources.myMap ? cacheMyMapGeojson(demo.sources.myMap) : undefined
    const sources: GisMapSourcesFactory = ctx => ({
        ...demo.sources,
        ...(myMap ? { myMap } : {}),
        areaQuery: routeAreaQuery(demo.sources.areaQuery, proxyAreaQuery(ctx)),
        legend: demoLegend(ctx),
    })
    return { demo, sources, basemap: demo.basemap, bigLayerId: 11 + counts.length - 1, bigLabel: bigLabelOf(counts[counts.length - 1]) }
}
