// 필지 정보 카드의 건물 칸 — 짝 백엔드 GET {apiBaseUrl}/api/mymap/ref/parcels/{pnu}/buildings?limit= (로그인 필요, query-spec U25).
// 응답 { success, message, data: { pnu, referenceVersion, buildingCount, truncated, relatedIncluded, addresses:[…] } } 봉투.
// 오류는 상태가 보이는 GisHttpError로 던진다: 403(비로그인은 빈 본문) 로그인 필요, 404 서버가 이 기능을 모름, 503 자료 준비 중, 400 요청 값, 그 밖.
import { GisHttpError } from '../../core'
import type { ParcelAddressGroup, ParcelBuildingSource, ParcelBuildingsResult, SourceContext } from '../../core'
import { apiUrl } from './envelope'
import type { ApiEnvelope } from './envelope'

const FALLBACK: Readonly<Record<number, string>> = Object.freeze({
    400: '요청 값이 올바르지 않습니다.',
    401: '로그인이 필요합니다.',
    403: '로그인이 필요합니다.',
    404: '이 서버는 건물 정보를 제공하지 않습니다.',
    503: '건물 자료가 아직 준비되지 않았습니다.',
})

export function restParcelBuildings(ctx: SourceContext): ParcelBuildingSource {
    return {
        async byPnu(pnu: string, opts?: { limit?: number; signal?: AbortSignal }): Promise<ParcelBuildingsResult> {
            const qs = opts?.limit !== undefined ? `?limit=${encodeURIComponent(String(opts.limit))}` : ''
            const url = apiUrl(ctx.host(), `/api/mymap/ref/parcels/${encodeURIComponent(pnu)}/buildings${qs}`)
            const res = await ctx.http.fetch(url, opts?.signal ? { signal: opts.signal } : undefined)
            let json: Partial<ApiEnvelope<ParcelBuildingsResult>> | null = null
            try {
                json = (await res.json()) as Partial<ApiEnvelope<ParcelBuildingsResult>>
            } catch {
                json = null   // 빈 본문(403)·HTML 오류 페이지
            }
            if (!res.ok || !json || json.success === false || !json.data) {
                const message = (json && typeof json.message === 'string' && json.message) || FALLBACK[res.status] || `건물 정보를 불러오지 못했습니다(HTTP ${res.status}).`
                throw new GisHttpError(res.ok ? 502 : res.status, message)
            }
            const d = json.data
            const addresses: ParcelAddressGroup[] = Array.isArray(d.addresses) ? d.addresses : []
            return {
                pnu: d.pnu,
                referenceVersion: d.referenceVersion ?? null,
                buildingCount: typeof d.buildingCount === 'number' ? d.buildingCount : 0,
                truncated: d.truncated === true,
                relatedIncluded: d.relatedIncluded === true,
                addresses,
            }
        },
    }
}
