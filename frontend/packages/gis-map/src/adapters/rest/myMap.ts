// 나만의지도 소스 — 짝 백엔드 api/mymap 계약. 옛 hooks/map/useMyMapLayers.ts(geojson)와
// components/map/panel/MyMapPanel.tsx(목록·상태·삭제), mymap/MyMapUploadModal.tsx(shp·엑셀 업로드), mymap/MyMapShareDialog.tsx(공유)의
// fetch 호출을 여기로 모았다. 업로드는 FormData라 Content-Type을 직접 넣지 않는다(브라우저가 boundary를 붙임).
// 1단계: quota·samples·import-report(.xlsx), 엑셀 확인의 mode·pnuColumn·addressColumn.
import type {
    ExcelConfirmInput, ExcelPreviewResponse, GeoJsonObject, MyMapConfirmResult, MyMapImportReport, MyMapImportReportQuery, MyMapQuota,
    MyMapSampleKind, MyMapSource, MyMapUpdateInput, ShpUploadInput, SourceContext, UserMapListItem, UserMapShare, UserMapStatus,
} from '../../core'
import { apiUrl, readBlob, readEnvelope } from './envelope'

const JSON_HEADERS = { 'Content-Type': 'application/json' }

/** 엑셀 확인 본문. 옛 호출(mode 없음)은 옛 본문과 키·순서가 같다. 값이 없는 키는 보내지 않는다 */
function confirmBody(input: ExcelConfirmInput): string {
    const body: Record<string, string> = { uploadId: input.uploadId, name: input.name }
    const add = (key: string, value: string | undefined) => {
        if (value !== undefined && value !== '') body[key] = value
    }
    add('latColumn', input.latColumn)
    add('lonColumn', input.lonColumn)
    add('sourceSrid', input.sourceSrid)
    add('mode', input.mode)
    add('pnuColumn', input.pnuColumn)
    add('addressColumn', input.addressColumn)
    add('description', input.description)
    return JSON.stringify(body)
}

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

        async confirmExcel(input: ExcelConfirmInput): Promise<void | MyMapConfirmResult> {
            const data = await readEnvelope<{ id: number; parcelVersion?: string | null } | null>(
                await ctx.http.fetch(url('/upload/excel/confirm'), { method: 'POST', headers: JSON_HEADERS, body: confirmBody(input) }),
                '업로드 실패',
            )
            // 옛 서버는 data가 null
            if (!data || typeof data.id !== 'number') return undefined
            // PNU 모드의 "예정" 기준월(좌표 모드는 null). 옛 서버는 필드 없음
            return data.parcelVersion !== undefined ? { id: data.id, parcelVersion: data.parcelVersion } : { id: data.id }
        },

        async getShare(id: number): Promise<UserMapShare> {
            return readEnvelope<UserMapShare>(await ctx.http.fetch(url(`/${id}/share`)))
        },

        async setShare(id: number, share: UserMapShare): Promise<void> {
            const body = JSON.stringify({ userIds: share.userIds, roleCodes: share.roleCodes })
            await readEnvelope<unknown>(await ctx.http.fetch(url(`/${id}/share`), { method: 'PUT', headers: JSON_HEADERS, body }))
        },

        async quota(): Promise<MyMapQuota> {
            return readEnvelope<MyMapQuota>(await ctx.http.fetch(url('/quota')), '한도 조회 실패')
        },

        /** 봉투 없는 xlsx 바이트 */
        async downloadSample(kind: MyMapSampleKind): Promise<Blob> {
            return readBlob(await ctx.http.fetch(url(`/samples/${kind}`)), '샘플을 받지 못했습니다')
        },

        async importReport(id: number, query?: MyMapImportReportQuery): Promise<MyMapImportReport> {
            const params: string[] = []
            if (query?.page !== undefined) params.push(`page=${query.page}`)
            if (query?.size !== undefined) params.push(`size=${query.size}`)
            if (query?.reason) params.push(`reason=${encodeURIComponent(query.reason)}`)
            const qs = params.length > 0 ? `?${params.join('&')}` : ''
            return readEnvelope<MyMapImportReport>(await ctx.http.fetch(url(`/${id}/import-report${qs}`)), '보고서를 불러오지 못했습니다')
        },

        /** 봉투 없는 xlsx 바이트 */
        async downloadImportFailures(id: number): Promise<Blob> {
            return readBlob(await ctx.http.fetch(url(`/${id}/import-report.xlsx`)), '실패 행 엑셀을 받지 못했습니다')
        },

        /** PATCH /api/mymap/{id} — 등록자만(아니면 403 + message). 값이 있는 키만 보낸다: 서버는 null을 "그대로"로 본다. styleConfig ''는 지움 */
        async update(id: number, patch: MyMapUpdateInput): Promise<void> {
            const body: Record<string, string> = {}
            if (patch.name !== undefined) body.name = patch.name
            if (patch.description !== undefined) body.description = patch.description
            if (patch.styleConfig !== undefined) body.styleConfig = patch.styleConfig
            await readEnvelope<unknown>(
                await ctx.http.fetch(url(`/${id}`), { method: 'PATCH', headers: JSON_HEADERS, body: JSON.stringify(body) }),
                '저장하지 못했습니다',
            )
        },
    }
}
