// 데이터 기준 정보 소스 — 짝 백엔드 두 곳을 합친다(Promise.allSettled).
//   GET /api/mymap/ref/status   건물DB·도로명코드·관련지번·연속지적도 적재 기록(읽기 전용, 로그인 필요)
//   GET /api/wind/frames        바람 예보 최신 발표(프레임 목록 — /latest는 부르지 않는다. 무거워서 서버가 멈출 수 있다)
// 한 묶음이 404면 그 항목만 뺀다(짝 백엔드가 그 API를 모름). 401·403이면 전체가 로그인 만료. 그 밖의 실패는 그 묶음 항목을 '읽지 못함'으로 보이고,
// 두 묶음이 다 실패하면 첫 오류를 그대로 던진다.
import { GisHttpError } from '../../core'
import type { DataInfoSource, GisDataInfoItem, SourceContext, WindFrameMeta } from '../../core'
import { apiUrl } from './envelope'
import type { ApiEnvelope } from './envelope'

export interface RestDataInfoOptions {
    /** 바람 예보 항목(/api/wind/frames)을 넣을지. 기본 true */
    wind?: boolean
}

/** 바람 예보를 "오래됨"으로 보는 기준: 발표 시각에서 12시간 */
export const WIND_STALE_HOURS = 12
export const WIND_SOURCE_TEXT = '기상청 국지예보모델(LDAPS) — 하루 4회 발표'
export const WIND_UPDATE_CYCLE = '하루 4회(03·09·15·21시 발표)'

interface RefDatasetDto {
    id: string
    label: string
    source: string
    updateCycle: string
    status: string
    version: string | null
    latestVersion: string | null
    baseDate: string | null
    loadedAt: string | null
    rowCount: number | null
    stale: boolean
    staleAfterDays: number
    coverage: { loadedSidoCount: number; expectedSidoCount: number; nationwide: boolean } | null
}

interface RefStatusDto {
    checkedAt: string
    datasets: RefDatasetDto[]
}

const REF_LABELS: ReadonlyArray<{ id: string; label: string }> = Object.freeze([
    { id: 'building', label: '도로명주소 건물DB' },
    { id: 'road-code', label: '도로명코드' },
    { id: 'related-jibun', label: '관련지번' },
    { id: 'parcel', label: '연속지적도' },
])

const STATUS_MAP: Readonly<Record<string, GisDataInfoItem['status']>> = Object.freeze({
    READY: 'ready',
    SWAPPING: 'updating',
    PARTIAL: 'partial',
    MISSING: 'missing',
    UNAVAILABLE: 'unavailable',
})

function staleText(d: RefDatasetDto): string {
    const days = d.staleAfterDays
    if (d.baseDate) return '기준일(' + d.baseDate + ')에서 ' + days + '일이 넘게 지났습니다. 최신 자료로 다시 적재가 필요합니다.'
    if (d.version) return '기준월(' + d.version + ')에서 ' + days + '일이 넘게 지났습니다. 최신 자료로 다시 적재가 필요합니다.'
    return days + '일이 넘게 지났습니다. 최신 자료로 다시 적재가 필요합니다.'
}

/** U27 응답 → 항목들(순수 함수). 모르는 status는 '읽지 못함' */
export function mapRefStatus(dto: RefStatusDto): GisDataInfoItem[] {
    return dto.datasets.map(d => ({
        id: d.id,
        label: d.label,
        source: d.source ?? null,
        version: d.version ?? null,
        latestVersion: d.latestVersion ?? null,
        baseDate: d.baseDate ?? null,
        loadedAt: d.loadedAt ?? null,
        updateCycle: d.updateCycle ?? null,
        status: STATUS_MAP[d.status] ?? 'unavailable',
        stale: d.stale === true,
        staleNote: d.stale === true ? staleText(d) : null,
        coverage: d.coverage ? { loaded: d.coverage.loadedSidoCount, expected: d.coverage.expectedSidoCount, nationwide: d.coverage.nationwide } : null,
        note: null,
    }))
}

/** 실패한 묶음의 자리표시(항목 이름만 알고 값은 모름) */
export function unavailableRefItems(): GisDataInfoItem[] {
    return REF_LABELS.map(r => ({
        id: r.id, label: r.label, source: null, version: null, baseDate: null, loadedAt: null, updateCycle: null,
        status: 'unavailable' as const, stale: false, note: '서버에서 자료를 읽지 못했습니다',
    }))
}

function pad2(n: number): string {
    return n < 10 ? '0' + n : String(n)
}

/** 바람 프레임 목록 → 항목 하나(순수 함수). 빈 목록 = 자료 없음 */
export function mapWindFrames(frames: readonly WindFrameMeta[], nowMs: number): GisDataInfoItem {
    const base: GisDataInfoItem = {
        id: 'wind', label: '바람 예보', source: WIND_SOURCE_TEXT, version: null, baseDate: null, loadedAt: null,
        updateCycle: WIND_UPDATE_CYCLE, status: 'missing', stale: false, note: '적재 기록이 없습니다',
    }
    const first = frames.find(f => typeof f.cycleDate === 'string' && typeof f.cycleHour === 'number')
    if (!first || !first.cycleDate || first.cycleHour === undefined) {
        return frames.length === 0 ? base : { ...base, note: '발표 시각을 알 수 없습니다' }
    }
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(first.cycleDate)
    if (!m) return { ...base, note: '발표 시각을 알 수 없습니다' }
    const issuedMs = Date.parse(m[1] + '-' + m[2] + '-' + m[3] + 'T' + pad2(first.cycleHour) + ':00:00+09:00')
    const stale = Number.isFinite(issuedMs) && nowMs - issuedMs > WIND_STALE_HOURS * 3600 * 1000
    return {
        ...base,
        version: m[2] + '-' + m[3] + ' ' + pad2(first.cycleHour) + '시',
        baseDate: first.cycleDate,
        status: 'ready',
        stale,
        staleNote: stale ? '발표 시각에서 ' + WIND_STALE_HOURS + '시간이 넘게 지났습니다. 새 예보가 아직 올라오지 않았습니다.' : null,
        note: null,
    }
}

function statusOf(reason: unknown): number | null {
    return reason instanceof GisHttpError ? reason.status : null
}

export function restDataInfo(ctx: SourceContext, opts: RestDataInfoOptions = {}): DataInfoSource {
    /** lenient: 봉투가 success:false면 오류 대신 null(바람 프레임은 "데이터 없음"으로 본다 — restWind와 같은 규칙) */
    async function getJson<T>(path: string, signal?: AbortSignal, lenient = false): Promise<T> {
        const res = await ctx.http.fetch(apiUrl(ctx.host(), path), { signal })
        if (!res.ok) throw new GisHttpError(res.status, 'HTTP ' + res.status + ' ' + path)
        let json: ApiEnvelope<T>
        try {
            json = (await res.json()) as ApiEnvelope<T>
        } catch {
            throw new GisHttpError(res.status, '서버 응답을 읽을 수 없습니다(HTTP ' + res.status + ')')
        }
        if (!json.success) {
            if (lenient) return null as T
            throw new GisHttpError(res.status, json.message)
        }
        return json.data
    }

    return {
        async list(signal?: AbortSignal): Promise<GisDataInfoItem[]> {
            const withWind = opts.wind !== false
            const [ref, wind] = await Promise.allSettled([
                getJson<RefStatusDto>('/api/mymap/ref/status', signal),
                withWind ? getJson<WindFrameMeta[] | null>('/api/wind/frames', signal, true) : Promise.resolve(null),
            ])
            // 로그인 만료는 전체 오류(바람은 누구나 읽어 오므로 ref가 401·403이면 로그인 문제다)
            for (const r of [ref, wind]) {
                if (r.status === 'rejected' && (statusOf(r.reason) === 401 || statusOf(r.reason) === 403)) throw r.reason
            }
            if (signal?.aborted) throw new DOMException('aborted', 'AbortError')
            if (ref.status === 'rejected' && withWind && wind.status === 'rejected') throw ref.reason

            const items: GisDataInfoItem[] = []
            if (ref.status === 'fulfilled') items.push(...mapRefStatus(ref.value))
            else if (statusOf(ref.reason) !== 404) items.push(...unavailableRefItems())
            if (withWind) {
                if (wind.status === 'fulfilled') items.push(mapWindFrames(wind.value ?? [], Date.now()))
                else if (statusOf(wind.reason) !== 404) {
                    items.push({
                        id: 'wind', label: '바람 예보', source: WIND_SOURCE_TEXT, version: null, baseDate: null, loadedAt: null,
                        updateCycle: WIND_UPDATE_CYCLE, status: 'unavailable', stale: false, note: '서버에서 자료를 읽지 못했습니다',
                    })
                }
            }
            return items
        },
    }
}
