// 바람길 소스 — 짝 백엔드 api/wind/latest(grib2json 형태). 옛 hooks/map/useWindLayer.ts의 fetch 그대로:
// HTTP 상태는 보지 않고 봉투의 success가 false면 "데이터 없음"(null).
import type { SourceContext, WindField, WindSource } from '../../core'
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
    }
}
