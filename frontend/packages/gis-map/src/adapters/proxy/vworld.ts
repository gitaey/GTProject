// VWorld 계열 소스 — 호스트 프록시 {proxyBaseUrl}/vworld/search, /vworld/data, /region(API 키는 호스트 서버가 붙인다).
// 주소·파싱은 옛 components/map/header/MapHeader.tsx(검색), hooks/map/useParcelHighlight.ts(필지),
// hooks/map/useRegionName.ts(지역명) 그대로. 옛 코드처럼 HTTP 상태는 보지 않고 본문만 본다.
import type { AddressSearchItem, AddressSearchSource, GeoJsonObject, ParcelSource, RegionNameSource, SourceContext } from '../../core'

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
    response?: { status?: string; result?: { featureCollection?: { features?: unknown } } }
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
