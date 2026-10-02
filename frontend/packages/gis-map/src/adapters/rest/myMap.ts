// 나만의지도 소스 — 짝 백엔드 api/mymap 계약. 옛 hooks/map/useMyMapLayers.ts(geojson)와
// components/map/panel/MyMapPanel.tsx(목록·상태·삭제), mymap/MyMapUploadModal.tsx(shp·엑셀 업로드), mymap/MyMapShareDialog.tsx(공유)의
// fetch 호출을 여기로 모았다. 업로드는 FormData라 Content-Type을 직접 넣지 않는다(브라우저가 boundary를 붙임).
import type {
    ExcelConfirmInput, ExcelPreviewResponse, GeoJsonObject, MyMapSource, ShpUploadInput, SourceContext,
    UserMapListItem, UserMapShare, UserMapStatus,
} from '../../core'
import { apiUrl, readEnvelope } from './envelope'

const JSON_HEADERS = { 'Content-Type': 'application/json' }

export function restMyMap(ctx: SourceContext): MyMapSource {
    const url = (path: string) => apiUrl(ctx.host(), '/api/mymap' + path)

    return {
        async list(): Promise<UserMapListItem[]> {
            const data = await readEnvelope<UserMapListItem[] | null>(await ctx.http.fetch(url('')))
            return data ?? []
        },

        async status(id: number): Promise<UserMapStatus> {
            return readEnvelope<UserMapStatus>(await ctx.http.fetch(url(`/${id}/status`)))
        },

        /** 봉투 없는 원본 FeatureCollection(EPSG:4326). HTTP 오류면 GisHttpError */
        async geojson(id: number): Promise<GeoJsonObject> {
            return ctx.http.json<GeoJsonObject>(url(`/${id}/geojson`))
        },

        async remove(id: number): Promise<void> {
            await readEnvelope<unknown>(await ctx.http.fetch(url(`/${id}`), { method: 'DELETE' }))
        },

        /** files(여러 개) + name + sourceSrid */
        async uploadShp(input: ShpUploadInput): Promise<void> {
            const formData = new FormData()
            input.files.forEach(f => formData.append('files', f))
            formData.append('name', input.name)
            formData.append('sourceSrid', input.sourceSrid)
            await readEnvelope<unknown>(await ctx.http.fetch(url('/upload/shp'), { method: 'POST', body: formData }), '업로드 실패')
        },

        async previewExcel(file: File): Promise<ExcelPreviewResponse> {
            const formData = new FormData()
            formData.append('file', file)
            return readEnvelope<ExcelPreviewResponse>(
                await ctx.http.fetch(url('/upload/excel/preview'), { method: 'POST', body: formData }),
                '미리보기 실패',
            )
        },

        async confirmExcel(input: ExcelConfirmInput): Promise<void> {
            // 본문 키 순서도 옛 코드와 같게
            const body = JSON.stringify({
                uploadId: input.uploadId,
                name: input.name,
                latColumn: input.latColumn,
                lonColumn: input.lonColumn,
                sourceSrid: input.sourceSrid,
            })
            await readEnvelope<unknown>(
                await ctx.http.fetch(url('/upload/excel/confirm'), { method: 'POST', headers: JSON_HEADERS, body }),
                '업로드 실패',
            )
        },

        async getShare(id: number): Promise<UserMapShare> {
            return readEnvelope<UserMapShare>(await ctx.http.fetch(url(`/${id}/share`)))
        },

        async setShare(id: number, share: UserMapShare): Promise<void> {
            const body = JSON.stringify({ userIds: share.userIds, roleCodes: share.roleCodes })
            await readEnvelope<unknown>(await ctx.http.fetch(url(`/${id}/share`), { method: 'PUT', headers: JSON_HEADERS, body }))
        },
    }
}
