// 나만의지도 소스 — 짝 백엔드 api/mymap 계약. 옛 hooks/map/useMyMapLayers.ts(geojson)와
// components/map/panel/MyMapPanel.tsx(목록·상태·삭제), mymap/MyMapUploadModal.tsx(shp·엑셀 업로드), mymap/MyMapShareDialog.tsx(공유)의
// fetch 호출을 여기로 모았다. 업로드는 FormData라 Content-Type을 직접 넣지 않는다(브라우저가 boundary를 붙임).
// 1단계: quota·samples·import-report(.xlsx), 엑셀 확인의 mode·pnuColumn·addressColumn.
import { GisHttpError } from '../../core'
import type {
    BulkShareMode, BulkShareResult, ExcelConfirmInput, ExcelPreviewResponse, GeoJsonObject, MyMapConfirmResult, MyMapConvertInput,
    MyMapConvertPreview, MyMapConvertResult, MyMapExportOptions, MyMapExportResult, MyMapImportReport, MyMapImportReportQuery, MyMapQuota,
    MyMapSampleKind, MyMapSource, MyMapUpdateInput, ShareChange, ShareEntryState, ShareSnapshot, ShareTargetSource, ShpUploadInput, SourceContext,
    UserMapListItem, UserMapShare, UserMapStatus,
} from '../../core'
import { apiUrl, base64ToBlob, dispositionFileName, readBlob, readEnvelope } from './envelope'

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

/** POST upload/excel/convert 응답(data). 파일은 base64로 온다 */
interface ConvertWire {
    total?: number
    matched?: number
    failed?: number
    fileName?: string
    fileBase64?: string
    preview?: Partial<MyMapConvertPreview> | null
}

/** 공유 응답 한 건(A3·A5). 옛 서버는 userIds·roleCodes만 준다 → 이름·상태 없이 ACTIVE로 채운다 */
interface ShareWire {
    userIds?: string[]
    roleCodes?: string[]
    users?: Array<{ userId: string; name?: string | null; state?: string }>
    roles?: Array<{ code: string; label?: string | null; state?: string }>
}

/** 한 번에 물을 수 있는 레이어 수(서버 한도) */
const SHARES_CHUNK = 50

function entryState(s: string | undefined): ShareEntryState {
    return s === 'INACTIVE' || s === 'MISSING' ? s : 'ACTIVE'
}

function toSnapshot(wire: ShareWire | null | undefined): ShareSnapshot {
    const w = wire ?? {}
    const users = Array.isArray(w.users)
        ? w.users.map(u => ({ userId: u.userId, name: u.name ?? null, state: entryState(u.state) }))
        : (w.userIds ?? []).map(userId => ({ userId, name: null, state: 'ACTIVE' as const }))
    const roles = Array.isArray(w.roles)
        ? w.roles.map(r => ({ code: r.code, label: r.label ?? null, state: entryState(r.state) }))
        : (w.roleCodes ?? []).map(code => ({ code, label: null, state: 'ACTIVE' as const }))
    return { users, roles }
}

export function restMyMap(ctx: SourceContext): MyMapSource {
    const url = (path: string) => apiUrl(ctx.host(), '/api/mymap' + path)

    const shareTarget: ShareTargetSource = {
        async get(id: number): Promise<ShareSnapshot> {
            return toSnapshot(await readEnvelope<ShareWire | null>(await ctx.http.fetch(url(`/${id}/share`))))
        },

        async set(id: number, change: ShareChange): Promise<void> {
            const body = JSON.stringify({ userIds: change.userIds, roleCodes: change.roleCodes })
            await readEnvelope<unknown>(await ctx.http.fetch(url(`/${id}/share`), { method: 'PUT', headers: JSON_HEADERS, body }))
        },

        /** 소유하지 않았거나 없는 id는 서버가 결과에서 뺀다 */
        async getMany(ids: number[]): Promise<Array<ShareSnapshot & { id: number }>> {
            const out: Array<ShareSnapshot & { id: number }> = []
            for (let i = 0; i < ids.length; i += SHARES_CHUNK) {
                const part = ids.slice(i, i + SHARES_CHUNK)
                const data = await readEnvelope<Array<ShareWire & { id: number }> | null>(
                    await ctx.http.fetch(url(`/shares?ids=${part.join(',')}`)),
                )
                for (const row of data ?? []) out.push({ id: row.id, ...toSnapshot(row) })
            }
            return out
        },

        async bulk(ids: number[], mode: BulkShareMode, change: ShareChange): Promise<BulkShareResult> {
            const body = JSON.stringify({ ids, mode, userIds: change.userIds, roleCodes: change.roleCodes })
            const data = await readEnvelope<Partial<BulkShareResult> | null>(
                await ctx.http.fetch(url('/shares/bulk'), { method: 'POST', headers: JSON_HEADERS, body }),
            )
            return { succeededIds: data?.succeededIds ?? [], failed: data?.failed ?? [] }
        },
    }

    return {
        shareTarget,

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

        /** POST upload/excel/convert — 레이어를 만들지 않고 결과 엑셀(base64)을 돌려받아 Blob으로. 오류는 봉투의 message */
        async convertExcel(input: MyMapConvertInput): Promise<MyMapConvertResult> {
            const body = JSON.stringify({ uploadId: input.uploadId, addressColumn: input.addressColumn, include: input.include, srid: input.srid })
            const res = await ctx.http.fetch(url('/upload/excel/convert'), { method: 'POST', headers: JSON_HEADERS, body })
            // 404 = 올린 파일(uploadId)이 없거나 만료 — 상태가 보이는 GisHttpError로 던져 화면이 파일 고르기로 돌려보낸다. 그 밖의 오류는 봉투의 message
            if (res.status === 404) {
                let message = '올린 파일을 찾을 수 없습니다'
                try {
                    const json = (await res.json()) as { message?: unknown }
                    if (typeof json.message === 'string' && json.message) message = json.message
                } catch {
                    // 본문이 JSON이 아님 — 기본 문구
                }
                throw new GisHttpError(404, message)
            }
            const data = await readEnvelope<ConvertWire | null>(res, '주소 변환에 실패했습니다')
            if (!data || !data.fileBase64) throw new Error('주소 변환에 실패했습니다')
            return {
                total: data.total ?? 0,
                matched: data.matched ?? 0,
                failed: data.failed ?? 0,
                fileName: data.fileName || '주소변환결과.xlsx',
                file: base64ToBlob(data.fileBase64),
                preview: { columns: data.preview?.columns ?? [], rows: data.preview?.rows ?? [] },
            }
        },

        /** GET /{id}/export — 봉투 없는 바이너리. 파일 이름은 Content-Disposition(filename* 우선), 헤더 X-Export-Failed-Skipped: true면 실패 행 못 담음 */
        async exportLayer(id: number, opts: MyMapExportOptions, signal?: AbortSignal): Promise<MyMapExportResult> {
            const qs = `format=${opts.format}&srid=${opts.srid}&includeFailed=${opts.includeFailed ? 'true' : 'false'}`
            const res = await ctx.http.fetch(url(`/${id}/export?${qs}`), signal ? { signal } : undefined)
            const blob = await readBlob(res, '내보내기에 실패했습니다')
            return {
                blob,
                fileName: dispositionFileName(res.headers.get('Content-Disposition'), `나만의지도_${id}.${opts.format}`),
                failedSkipped: res.headers.get('X-Export-Failed-Skipped') === 'true',
            }
        },
    }
}
