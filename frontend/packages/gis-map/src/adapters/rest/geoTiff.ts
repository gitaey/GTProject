// GeoTIFF 소스 — 짝 백엔드 api/geotiff 계약. 옛 components/map/panel/ImagePanel.tsx의 fetch 호출과
// hooks/map/useGeoTiffLayer.ts의 타일 URL 조립(`${apiBase}${item.tileUrl}`)을 여기로 모았다.
// 헤더는 HttpClient가 호스트에서 매번 붙인다. 업로드는 FormData라 Content-Type을 직접 넣지 않는다(브라우저가 boundary를 붙임).
import type { GeoTiffItem, GeoTiffSource, GeoTiffStatus, SourceContext } from '../../core'
import { apiUrl, readEnvelope } from './envelope'

export function restGeoTiff(ctx: SourceContext): GeoTiffSource {
    return {
        async list(): Promise<GeoTiffItem[]> {
            const data = await readEnvelope<GeoTiffItem[] | null>(await ctx.http.fetch(apiUrl(ctx.host(), '/api/geotiff')))
            return data ?? []
        },

        async status(id: number): Promise<GeoTiffStatus> {
            return readEnvelope<GeoTiffStatus>(await ctx.http.fetch(apiUrl(ctx.host(), `/api/geotiff/${id}/status`)))
        },

        /** 백엔드가 주는 상대 경로(/api/geotiff/tiles/{id}/{z}/{x}/{y}.png) 앞에 호출 시점의 apiBaseUrl */
        tileUrl(item: GeoTiffItem): string {
            return `${ctx.host().endpoints.apiBaseUrl}${item.tileUrl}`
        },

        /** file + (로그인했으면) uploadedBy. 응답에 tileUrl이 없으면 규약 경로로 채운다(옛 코드) */
        async upload(file: File): Promise<GeoTiffItem> {
            const host = ctx.host()
            const formData = new FormData()
            formData.append('file', file)
            const user = host.getCurrentUser()
            if (user?.userId) formData.append('uploadedBy', user.userId)
            const data = await readEnvelope<GeoTiffItem>(await ctx.http.fetch(apiUrl(host, '/api/geotiff/upload'), {
                method: 'POST',
                body: formData,
            }))
            return {
                ...data,
                tileUrl: data.tileUrl ?? `/api/geotiff/tiles/${data.id}/{z}/{x}/{y}.png`,
            }
        },

        async remove(id: number): Promise<void> {
            await readEnvelope<unknown>(await ctx.http.fetch(apiUrl(ctx.host(), `/api/geotiff/${id}`), { method: 'DELETE' }))
        },

        async reprocessBounds(id: number): Promise<void> {
            await readEnvelope<unknown>(await ctx.http.fetch(apiUrl(ctx.host(), `/api/geotiff/${id}/reprocess-bounds`), { method: 'POST' }))
        },
    }
}
