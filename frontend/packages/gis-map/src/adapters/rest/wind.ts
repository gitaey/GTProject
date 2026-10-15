// 바람길 소스 — 짝 백엔드 api/wind(grib2json 형태). 옛 hooks/map/useWindLayer.ts의 fetch 그대로:
// HTTP 상태는 보지 않고 봉투의 success가 false면 "데이터 없음"(latest·frame은 null, frames는 빈 목록).
//   latest()    GET /api/wind/latest        지금 시각의 프레임 하나
//   frames()    GET /api/wind/frames        최신 발표의 프레임 목록(메타만, 가벼움)
//   frame(id)   GET /api/wind/frames/{id}   프레임 하나(수 MB, 서버가 Cache-Control을 준다)
//   field(id)   GET /api/wind/fields/{id}   스칼라 변수(기온·습도·강수량) 한 장(정수 양자화, 서버가 immutable 캐시를 준다)
import type { SourceContext, WindField, WindFrameMeta, WindScalarField, WindSource } from '../../core'
import { apiUrl } from './envelope'
import type { ApiEnvelope } from './envelope'

export function restWind(ctx: SourceContext): WindSource {
    return {
        async latest(): Promise<WindField | null> {
            const res = await ctx.http.fetch(apiUrl(ctx.host(), '/api/wind/latest'))
            const json = (await res.json()) as ApiEnvelope<WindField | null>
            if (!json.success) return null
            return json.data ?? null
        },
        async frames(): Promise<WindFrameMeta[]> {
            const res = await ctx.http.fetch(apiUrl(ctx.host(), '/api/wind/frames'))
            const json = (await res.json()) as ApiEnvelope<WindFrameMeta[] | null>
            if (!json.success) return []
            return json.data ?? []
        },
        async frame(id: number): Promise<WindField | null> {
            const res = await ctx.http.fetch(apiUrl(ctx.host(), '/api/wind/frames/' + encodeURIComponent(String(id))))
            const json = (await res.json()) as ApiEnvelope<WindField | null>
            if (!json.success) return null
            return json.data ?? null
        },
        async field(id: number): Promise<WindScalarField | null> {
            const res = await ctx.http.fetch(apiUrl(ctx.host(), '/api/wind/fields/' + encodeURIComponent(String(id))))
            const json = (await res.json()) as ApiEnvelope<WindScalarField | null>
            if (!json.success) return null
            return json.data ?? null
        },
    }
}
