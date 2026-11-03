// 영역 분석 원격 질의 — GeoServer WFS 2.0(브라우저가 직접 호출 — GeoServer가 CORS를 허용해야 한다. 우리 로그인 토큰은 보내지 않는다: http.fetchExternal).
// 실측(2026-11-02, _workspace/area-stats/02b_probe.md):
//   · 영역 필터: `cql_filter=INTERSECTS(<지오메트리 열>, SRID=4326;POLYGON((경도 위도,…)))` — EPSG 표기 없는 POLYGON은 레이어 원본 좌표계(이 서버는 5179)로 읽혀 0건이 된다
//   · 응답: `outputFormat=application/json&srsName=EPSG:3857` — 4326으로 받으면 소수 4자리(≈11 m)로 잘려 오므로 3857(미터, 4자리 = 0.1 mm)로 받아 여기서 역변환한다
//   · 건수: `resultType=hits`(XML numberMatched). 쪽 넘김: `startIndex`+`count`+`sortBy`(없으면 순서가 보장되지 않는다)
//   · 열·지오메트리 열: DescribeFeatureType(json) — 타입이 `gml:`로 시작하는 속성이 지오메트리
import { AreaQueryUnsupportedError } from '../../core'
import type { AreaAnalysisColumn, AreaQueryLayerInfo, AreaQueryPage, GeoJsonObject, LayerDef, SourceContext } from '../../core'
import { reduceRing, reprojectCoordinates, ringToWkt } from './areaQueryShared'

/** 쪽당 피처 수(경계 레이어는 피처 하나가 수 KB~수십 KB라 VWorld보다 작게) */
const PAGE_SIZE = 500

/** 쪽 넘김 정렬 열 후보(앞에 있는 것이 우선, 소문자) */
const SORT_PREFERENCE: readonly string[] = Object.freeze(['objectid', 'gid', 'fid', 'id', 'pnu', 'code'])
const NUMERIC_TYPES: readonly string[] = Object.freeze(['int', 'integer', 'long', 'short', 'byte', 'double', 'float', 'decimal'])

interface LayerMeta {
    wfs: string
    typeName: string
    geom: string
    sortBy: string | null
    info: AreaQueryLayerInfo
}

interface DescribeResponse {
    featureTypes?: Array<{ properties?: Array<{ name?: string; type?: string; localType?: string }> }>
}

interface GetFeatureResponse {
    features?: unknown
    numberMatched?: unknown
    crs?: { properties?: { name?: unknown } }
}

export interface GeoServerAreaQueryOptions {
    /** 이 레이어의 WFS 주소를 직접 정한다(없으면 레이어 주소의 /wms·/ows를 /wfs로 바꾸고, 안 되면 호스트 geoserverUrl + '/wfs'). null = 이 레이어는 질의 안 함 */
    wfsUrl?(layer: LayerDef, geoserverUrl: string): string | null
    maxVertices?: number
}

/** WFS 주소: 사용자 지정 → 레이어 WMS 주소의 같은 서버 → 호스트 geoserverUrl */
export function wfsEndpoint(layer: LayerDef, geoserverUrl: string, custom?: GeoServerAreaQueryOptions['wfsUrl']): string | null {
    const c = custom?.(layer, geoserverUrl)
    if (c) return c
    try {
        const u = new URL(layer.url)
        if (u.protocol === 'http:' || u.protocol === 'https:') {
            const path = u.pathname.replace(/\/(wms|ows|wmts|gwc(\/.*)?)\/?$/i, '/wfs')
            if (path !== u.pathname) return u.origin + path
        }
    } catch {
        // 상대 주소 등 — 호스트 주소로
    }
    return geoserverUrl ? geoserverUrl.replace(/\/+$/, '') + '/wfs' : null
}

const BOUNDARY_PREFIX: Readonly<Record<string, string>> = Object.freeze({ ctp: '시도', sig: '시군구', emd: '읍면동', li: '리' })

/**
 * 열 이름표(화면용). DescribeFeatureType 은 열 이름만 주므로 알려진 법정경계 열(code·ctp/sig/emd/li_kor_nm·_eng_nm)에만
 * 한글을 붙이고 나머지는 이름 그대로 둔다(내보내기 머리글도 이 이름표를 쓴다)
 */
export function geoServerColumnLabel(name: string): string {
    const n = name.toLowerCase()
    if (n === 'code') return '코드'
    const m = /^(ctp|sig|emd|li)_(kor|eng)_nm$/.exec(n)
    if (m) return BOUNDARY_PREFIX[m[1]] + (m[2] === 'kor' ? '명' : '명(영문)')
    return name
}

/** 경계 레이어 이름 열(기본 범주 열): 한글 이름 > _nm/name */
export function defaultCategoryOf(columns: readonly AreaAnalysisColumn[]): string | null {
    const text = columns.filter(c => c.kind === 'text')
    return (text.find(c => /kor.*nm$/i.test(c.name)) ?? text.find(c => /(_nm|name|nm)$/i.test(c.name)))?.name ?? null
}

export function pickSortColumn(names: readonly string[]): string | null {
    const lower = names.map(n => n.toLowerCase())
    for (const pref of SORT_PREFERENCE) {
        const i = lower.indexOf(pref)
        if (i >= 0) return names[i]
    }
    return names.length > 0 ? names[0] : null
}

export function createGeoServerAreaQuery(ctx: SourceContext, opts: GeoServerAreaQueryOptions = {}) {
    const metas = new Map<string, LayerMeta>()

    function endpointOf(layer: LayerDef): string | null {
        return wfsEndpoint(layer, ctx.host().endpoints.geoserverUrl, opts.wfsUrl)
    }

    async function load(layer: LayerDef, signal?: AbortSignal): Promise<LayerMeta | AreaQueryLayerInfo> {
        const typeName = layer.layerName ?? ''
        const wfs = endpointOf(layer)
        if (!typeName || !wfs) return { queryable: false, reason: 'GeoServer 주소를 알 수 없습니다' }
        const key = wfs + '|' + typeName
        const cached = metas.get(key)
        if (cached) return cached
        const url = `${wfs}?service=WFS&version=2.0.0&request=DescribeFeatureType&typeNames=${encodeURIComponent(typeName)}&outputFormat=${encodeURIComponent('application/json')}`
        const res = await ctx.http.fetchExternal(url, { signal })
        if (!res.ok) return { queryable: false, reason: 'WFS로 발행되지 않은 레이어' }
        let json: DescribeResponse | null = null
        try {
            json = (await res.json()) as DescribeResponse | null
        } catch {
            json = null
        }
        const props = json?.featureTypes?.[0]?.properties
        if (!Array.isArray(props) || props.length === 0) return { queryable: false, reason: 'WFS로 발행되지 않은 레이어' }
        const geomProp = props.find(p => typeof p.type === 'string' && p.type.startsWith('gml:'))
        if (!geomProp || !geomProp.name) return { queryable: false, reason: '지오메트리 열이 없는 레이어' }
        const columns: AreaAnalysisColumn[] = props
            .filter(p => p !== geomProp && typeof p.name === 'string')
            .map(p => {
                const local = (p.localType ?? p.type ?? '').replace(/^xsd:/, '').toLowerCase()
                return { name: p.name as string, label: geoServerColumnLabel(p.name as string), kind: NUMERIC_TYPES.includes(local) ? ('number' as const) : ('text' as const) }
            })
        const meta: LayerMeta = {
            wfs, typeName, geom: geomProp.name, sortBy: pickSortColumn(columns.map(c => c.name)),
            info: { queryable: true, columns, defaultCategory: defaultCategoryOf(columns), supportsCount: true },
        }
        metas.set(key, meta)
        return meta
    }

    function isMeta(x: LayerMeta | AreaQueryLayerInfo): x is LayerMeta {
        return 'geom' in x
    }

    async function need(layer: LayerDef, signal?: AbortSignal): Promise<LayerMeta> {
        const m = await load(layer, signal)
        if (isMeta(m)) return m
        throw new AreaQueryUnsupportedError(m.reason ?? '질의할 수 없는 레이어')
    }

    function params(meta: LayerMeta, ring4326: number[][]): URLSearchParams {
        const p = new URLSearchParams()
        p.set('service', 'WFS')
        p.set('version', '2.0.0')
        p.set('request', 'GetFeature')
        p.set('typeNames', meta.typeName)
        p.set('cql_filter', `INTERSECTS(${meta.geom}, SRID=4326;${ringToWkt(reduceRing(ring4326, opts.maxVertices))})`)
        return p
    }

    return {
        matches(layer: LayerDef): boolean {
            return layer.sourceType === 'GEOSERVER' && !!layer.layerName
        },

        async describe(layer: LayerDef, signal?: AbortSignal): Promise<AreaQueryLayerInfo> {
            const m = await load(layer, signal)
            return isMeta(m) ? { ...m.info, columns: m.info.columns?.map(c => ({ ...c })) } : m
        },

        async count(layer: LayerDef, ring4326: number[][], signal?: AbortSignal): Promise<number | null> {
            const meta = await need(layer, signal)
            const p = params(meta, ring4326)
            p.set('resultType', 'hits')
            const res = await ctx.http.fetchExternal(`${meta.wfs}?${p}`, { signal })
            if (!res.ok) return null
            const text = await res.text()
            const m = /numberMatched="(\d+)"/.exec(text)
            if (m) return Number(m[1])
            try {
                const n = (JSON.parse(text) as { numberMatched?: unknown }).numberMatched
                return typeof n === 'number' && Number.isFinite(n) ? n : null
            } catch {
                return null
            }
        },

        async query(layer: LayerDef, ring4326: number[][], page: number, signal?: AbortSignal): Promise<AreaQueryPage> {
            const meta = await need(layer, signal)
            const p = params(meta, ring4326)
            p.set('outputFormat', 'application/json')
            p.set('srsName', 'EPSG:3857')
            p.set('count', String(PAGE_SIZE))
            const start = (page - 1) * PAGE_SIZE
            p.set('startIndex', String(start))
            if (meta.sortBy) p.set('sortBy', meta.sortBy)
            const res = await ctx.http.fetchExternal(`${meta.wfs}?${p}`, { signal })
            if (!res.ok) throw new Error('GeoServer 질의 오류(HTTP ' + res.status + ')')
            let json: GetFeatureResponse | null = null
            try {
                json = (await res.json()) as GetFeatureResponse | null
            } catch {
                json = null
            }
            if (!json || !Array.isArray(json.features)) throw new Error('GeoServer 응답을 읽지 못했습니다(필터 오류일 수 있습니다)')
            const crsName = typeof json.crs?.properties?.name === 'string' ? json.crs.properties.name : ''
            if (crsName !== '' && !crsName.includes('3857')) throw new Error('GeoServer가 요청한 좌표계(EPSG:3857)로 응답하지 않았습니다(' + crsName + ')')
            const features = (json.features as GeoJsonObject[]).map(f => {
                const g = f.geometry as { type?: string; coordinates?: unknown } | null | undefined
                return g && g.coordinates ? { ...f, geometry: { ...g, coordinates: reprojectCoordinates(g.coordinates) } } : f
            })
            const total = typeof json.numberMatched === 'number' && Number.isFinite(json.numberMatched) ? json.numberMatched : null
            const hasMore = features.length >= PAGE_SIZE && (total === null || start + features.length < total)
            return { features, total, hasMore }
        },
    }
}
