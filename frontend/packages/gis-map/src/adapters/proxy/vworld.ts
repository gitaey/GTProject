// VWorld 계열 소스 — 호스트 프록시 {proxyBaseUrl}/vworld/search, /vworld/data, /region(API 키는 호스트 서버가 붙인다).
// 주소·파싱은 옛 components/map/header/MapHeader.tsx(검색), hooks/map/useParcelHighlight.ts(필지),
// hooks/map/useRegionName.ts(지역명) 그대로. 옛 코드처럼 HTTP 상태는 보지 않고 본문만 본다.
import type { AddressSearchItem, AddressSearchSource, GeoJsonObject, ParcelInfo, ParcelSource, RegionNameSource, SourceContext } from '../../core'
import { errorMessage } from './areaQueryVWorld'

/** 지역명 끝의 번지(예: ' 123', ' 산 12-3')를 뗀다 — 옛 useRegionName의 정규식 그대로 */
export function stripLotNumber(text: string): string {
    return text.replace(/\s+(산\s*)?\d+(-\d+)*$/, '').trim()
}

export function proxyAddressSearch(ctx: SourceContext): AddressSearchSource {
    return {
        async search(query: string, size: number): Promise<AddressSearchItem[]> {
            const proxy = ctx.host().endpoints.proxyBaseUrl
            const res = await ctx.http.fetch(`${proxy}/vworld/search?query=${encodeURIComponent(query)}&type=all&size=${size}`)
            const json = (await res.json()) as { items?: AddressSearchItem[] | null }
            return json.items ?? []
        },
    }
}

interface VWorldDataResponse {
    response?: { status?: string; error?: { code?: string; text?: string }; result?: { featureCollection?: { features?: unknown } } }
}

function textOrNull(v: unknown): string | null {
    if (typeof v === 'number' && Number.isFinite(v)) return String(v)
    if (typeof v !== 'string') return null
    const t = v.trim()
    return t === '' ? null : t
}

/**
 * VWorld 연속지적도(LP_PA_CBND_BUBUN) 피처 → 필지 정보. 열: pnu·jibun("746 도" — 끝의 한 글자가 지목)·addr·jiga(문자열 "1055000")·gosi_year·gosi_month.
 * pnu가 19자리 숫자가 아니면 null(호출부가 오류로 다룬다). 경계(geometry)가 없는 피처면 geometry null
 */
export function parseVWorldParcel(feature: GeoJsonObject): ParcelInfo | null {
    const props = (feature.properties ?? {}) as Record<string, unknown>
    const pnu = textOrNull(props.pnu)
    if (!pnu || !/^\d{19}$/.test(pnu)) return null
    const jibun = textOrNull(props.jibun)
    // 끝의 한 글자(숫자·- 아님)가 지목: "746 도" → 746 / 도, "산 12-3 임" → 산 12-3 / 임. 지목이 없으면 통째로 지번
    const m = jibun ? /^(.*?)\s+([^\s\d-])$/.exec(jibun) : null
    const price = Number(textOrNull(props.jiga))
    return {
        pnu,
        address: textOrNull(props.addr),
        lotNumber: m ? m[1].trim() || null : jibun,
        mountain: pnu.charAt(10) === '2',
        jimok: m ? m[2] : null,
        officialPrice: Number.isFinite(price) && price > 0 ? price : null,
        priceYear: textOrNull(props.gosi_year),
        priceMonth: textOrNull(props.gosi_month),
        geometry: feature.geometry && typeof feature.geometry === 'object' ? feature : null,
    }
}

export function proxyParcel(ctx: SourceContext): ParcelSource {
    return {
        /** 연속지적도(LP_PA_CBND_BUBUN)에서 그 지점의 필지 1건. 상태가 OK가 아니거나 없으면 [] */
        async featuresAt(lon: number, lat: number): Promise<GeoJsonObject[]> {
            const proxy = ctx.host().endpoints.proxyBaseUrl
            const url =
                `${proxy}/vworld/data?service=data&version=2.0&request=GetFeature` +
                `&format=json&size=1&page=1&crs=EPSG:4326` +
                `&data=LP_PA_CBND_BUBUN&geomFilter=POINT(${lon}%20${lat})`
            const res = await ctx.http.fetch(url)
            const json = (await res.json()) as VWorldDataResponse | null
            if (json?.response?.status !== 'OK') return []
            const features = json?.response?.result?.featureCollection?.features
            if (!Array.isArray(features) || !features.length) return []
            return features as GeoJsonObject[]
        },

        /** 같은 점 질의로 속성·경계를 받는다. 없으면 null(NOT_FOUND), 오류(키·한도·네트워크)는 throw — `featuresAt`처럼 삼키지 않는다 */
        async infoAt(lon: number, lat: number, signal?: AbortSignal): Promise<ParcelInfo | null> {
            const proxy = ctx.host().endpoints.proxyBaseUrl
            const url =
                `${proxy}/vworld/data?service=data&version=2.0&request=GetFeature` +
                `&format=json&size=1&page=1&crs=EPSG:4326` +
                `&data=LP_PA_CBND_BUBUN&geomFilter=POINT(${lon}%20${lat})`
            const res = await ctx.http.fetch(url, signal ? { signal } : undefined)
            let json: VWorldDataResponse | null
            try {
                json = (await res.json()) as VWorldDataResponse | null
            } catch {
                throw new Error(`필지 정보를 불러오지 못했습니다(HTTP ${res.status}).`)
            }
            const r = json?.response
            const status = r?.status
            if (status === 'NOT_FOUND') return null
            if (status !== 'OK') {
                if (status === 'ERROR') throw new Error(errorMessage(r?.error?.code ?? '', r?.error?.text ?? ''))
                throw new Error(`필지 정보를 불러오지 못했습니다(HTTP ${res.status}).`)
            }
            const features = r?.result?.featureCollection?.features
            if (!Array.isArray(features) || features.length === 0) return null
            const info = parseVWorldParcel(features[0] as GeoJsonObject)
            if (!info) throw new Error('필지 번호(PNU)를 읽을 수 없습니다.')
            return info
        },
    }
}

interface RegionResponse {
    response?: { result?: Array<{ text?: unknown }> }
}

export function proxyRegionName(ctx: SourceContext): RegionNameSource {
    return {
        /** 결과가 없으면 null. text가 문자열이 아니면 throw(옛 코드: 그때 '-') */
        async nameAt(lon: number, lat: number): Promise<string | null> {
            const proxy = ctx.host().endpoints.proxyBaseUrl
            const res = await ctx.http.fetch(`${proxy}/region?lon=${lon}&lat=${lat}`)
            const json = (await res.json()) as RegionResponse | null
            const result = json?.response?.result?.[0]
            if (!result) return null
            return stripLotNumber(result.text as string)
        },
    }
}
