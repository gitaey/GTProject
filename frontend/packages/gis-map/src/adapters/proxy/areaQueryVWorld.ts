// 영역 분석 원격 질의 — VWorld Data API(호스트 프록시 {proxyBaseUrl}/vworld/data, 키는 호스트 서버가 붙인다).
// 실측(2026-11-02, _workspace/area-stats/02b_probe.md): 필수 파라미터 service=data&version=2.0&request=GetFeature,
//   전체 건수 = response.record.total(문자열), 쪽 수 = response.page.total, 쪽당 최대 1000, 좌표는 경도·위도 순 4326,
//   data 이름은 대소문자 무관, 결과 없음 = status NOT_FOUND, 오류는 프록시가 HTTP 200으로 줘도 본문 status ERROR + error.code.
import { AreaQueryUnsupportedError, isVWorldUrl } from '../../core'
import type { AreaAnalysisColumn, AreaQueryLayerInfo, AreaQueryPage, GeoJsonObject, LayerDef, SourceContext } from '../../core'
import { reduceRing, ringToWkt } from './areaQueryShared'

const PAGE_SIZE = 1000

/** 알려진 Data API 레이어의 열 이름·기본 범주 열(알려지지 않은 레이어는 받은 속성 이름을 그대로 쓴다) */
interface KnownLayer {
    columns: ReadonlyArray<Readonly<AreaAnalysisColumn>>
    defaultCategory: string | null
}

const PARCEL_COLUMNS: KnownLayer['columns'] = Object.freeze([
    Object.freeze({ name: 'jimok', label: '지목', kind: 'text' as const, derived: true }),
    Object.freeze({ name: 'pnu', label: 'PNU', kind: 'text' as const }),
    Object.freeze({ name: 'jibun', label: '지번', kind: 'text' as const }),
    Object.freeze({ name: 'bonbun', label: '본번', kind: 'text' as const }),
    Object.freeze({ name: 'bubun', label: '부번', kind: 'text' as const }),
    Object.freeze({ name: 'addr', label: '주소', kind: 'text' as const }),
    // 단가(원/㎡) — 합계는 의미가 없어 숨긴다(평균·최소·최대만)
    Object.freeze({ name: 'jiga', label: '공시지가(원/㎡)', kind: 'number' as const, sum: false }),
    Object.freeze({ name: 'gosi_year', label: '고시년도', kind: 'text' as const }),
    Object.freeze({ name: 'gosi_month', label: '고시월', kind: 'text' as const }),
])

const KNOWN: Readonly<Record<string, KnownLayer>> = Object.freeze({
    LP_PA_CBND_BUBUN: Object.freeze({ columns: PARCEL_COLUMNS, defaultCategory: 'jimok' }),
    LP_PA_CBND_BONBUN: Object.freeze({ columns: PARCEL_COLUMNS, defaultCategory: 'jimok' }),
    LT_C_UQ111: Object.freeze({
        columns: Object.freeze([
            Object.freeze({ name: 'uname', label: '용도지역명', kind: 'text' as const }),
            Object.freeze({ name: 'dyear', label: '고시년도', kind: 'text' as const }),
            Object.freeze({ name: 'dnum', label: '고시번호', kind: 'text' as const }),
            Object.freeze({ name: 'sido_name', label: '시도명', kind: 'text' as const }),
            Object.freeze({ name: 'sigg_name', label: '시군구명', kind: 'text' as const }),
        ]),
        defaultCategory: 'uname',
    }),
})

/** 지번 끝의 지목 글자: "708 대" → "대", "산 12 임" → "임". 형식이 다르면 '알 수 없음' */
export function jimokOf(jibun: unknown): string {
    if (typeof jibun !== 'string') return '알 수 없음'
    const m = /\s(\S)\s*$/.exec(jibun)
    return m ? m[1] : '알 수 없음'
}

/** 이 레이어를 VWorld Data API 이름으로: 쉼표로 묶인 WMS 이름이면 part, 아니면 layerName. 규칙 = 대문자(호스트가 덮어쓸 수 있다) */
export function vworldDataName(layer: LayerDef, part: string | undefined, custom?: (wmsName: string) => string | null): string | null {
    const raw = (part ?? layer.layerName ?? '').trim()
    if (raw === '') return null
    const mapped = custom ? custom(raw) : null
    return (mapped ?? raw).toUpperCase()
}

interface VWorldResponse {
    response?: {
        status?: string
        error?: { code?: string; text?: string }
        record?: { total?: string | number }
        page?: { total?: string | number; current?: string | number }
        result?: { featureCollection?: { features?: unknown } }
    }
}

function toInt(v: unknown): number | null {
    const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN
    return Number.isFinite(n) ? n : null
}

/** 질의할 수 없는 레이어라는 뜻의 오류 코드(허용 목록 밖·잘못된 레이어 이름) */
const UNSUPPORTED_CODES: readonly string[] = Object.freeze(['PROXY_REJECTED', 'INVALID_RANGE', 'NOT_FOUND_LAYER'])

/**
 * VWorld Data API 영역 한도: geomFilter(polygon·box) 요청 면적 10 km² 이내(2026-11 실측 — 넘으면 status ERROR·code INVALID_RANGE·
 * "요청면적이 10km² 이내"). 이 오류는 레이어가 아니라 영역 때문이므로 질의 불가(레이어를 못 쓰는 것으로 굳힘)로 보면 안 된다.
 */
export const VWORLD_MAX_AREA_KM2 = 10

/** 경도·위도 링의 대략적인 넓이(㎢) — 위도 평균으로 경도 거리를 줄인 평면 신발끈 공식(한도 사전 확인용이라 정밀할 필요 없음) */
export function ringAreaKm2(ring: number[][]): number {
    if (ring.length < 3) return 0
    let lat = 0
    for (const p of ring) lat += p[1]
    const kx = 111.32 * Math.cos(((lat / ring.length) * Math.PI) / 180)
    const ky = 110.574
    let s = 0
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        s += (ring[j][0] * kx) * (ring[i][1] * ky) - (ring[i][0] * kx) * (ring[j][1] * ky)
    }
    return Math.abs(s) / 2
}

function areaLimitMessage(km2: number | null): string {
    return 'VWorld는 영역이 ' + VWORLD_MAX_AREA_KM2 + ' ㎢ 이하일 때만 조회됩니다' + (km2 !== null ? '(현재 약 ' + km2.toFixed(1) + ' ㎢)' : '') + '. 영역을 줄여 다시 분석하세요.'
}

export function errorMessage(code: string, text: string): string {
    if (code === 'INVALID_KEY' || code === 'INCORRECT_KEY' || code === 'UNAVAILABLE_KEY') return 'VWorld 인증키(도메인) 문제로 질의하지 못했습니다.'
    if (code === 'OVER_REQUEST_LIMIT') return 'VWorld 호출 한도를 넘었습니다. 나중에 다시 시도하세요.'
    return 'VWorld 질의 오류' + (code ? ' (' + code + ')' : '') + (text ? ': ' + text : '')
}

export function createVWorldAreaQuery(ctx: SourceContext, custom?: (wmsName: string) => string | null, maxVertices?: number) {
    return {
        matches(layer: LayerDef): boolean {
            return layer.type === 'WMS' && isVWorldUrl(layer.url)
        },

        async describe(layer: LayerDef, part: string | undefined): Promise<AreaQueryLayerInfo> {
            const name = vworldDataName(layer, part, custom)
            if (!name) return { queryable: false, reason: 'Data API 이름을 알 수 없습니다' }
            const known = KNOWN[name]
            if (!known) return { queryable: 'unknown' }
            return { queryable: true, columns: known.columns.map(c => ({ ...c })), defaultCategory: known.defaultCategory, supportsCount: false }
        },

        async query(layer: LayerDef, part: string | undefined, ring4326: number[][], page: number, signal?: AbortSignal): Promise<AreaQueryPage> {
            const name = vworldDataName(layer, part, custom)
            if (!name) throw new AreaQueryUnsupportedError('Data API 이름을 알 수 없습니다')
            // 한도를 넘는 영역은 보내 봐야 거절되므로 요청 전에 막는다(호출 한도·시간 낭비 방지, 레이어는 그대로 쓸 수 있는 상태로 둔다)
            const km2 = ringAreaKm2(ring4326)
            if (km2 > VWORLD_MAX_AREA_KM2 * 0.99) throw new Error(areaLimitMessage(km2))
            const proxy = ctx.host().endpoints.proxyBaseUrl
            const wkt = ringToWkt(reduceRing(ring4326, maxVertices))
            const url =
                `${proxy}/vworld/data?service=data&version=2.0&request=GetFeature&format=json&crs=EPSG:4326` +
                `&size=${PAGE_SIZE}&page=${page}&geometry=true&attribute=true` +
                `&data=${encodeURIComponent(name)}&geomFilter=${encodeURIComponent(wkt)}`
            const res = await ctx.http.fetch(url, { signal })
            let json: VWorldResponse | null = null
            try {
                json = (await res.json()) as VWorldResponse | null
            } catch {
                json = null
            }
            const r = json?.response
            if (!r || typeof r.status !== 'string') {
                throw new Error('VWorld 응답을 읽지 못했습니다(HTTP ' + res.status + ')')
            }
            if (r.status === 'NOT_FOUND') return { features: [], total: 0, hasMore: false }
            if (r.status !== 'OK') {
                const code = r.error?.code ?? ''
                const text = r.error?.text ?? ''
                // 영역 한도 초과(INVALID_RANGE 중 geomFilter·요청면적 문구) — 사전 확인을 빠져나온 경우의 안전망. 레이어 불가로 굳히지 않는다
                if (code === 'INVALID_RANGE' && /geomFilter|요청면적/.test(text)) throw new Error(areaLimitMessage(km2))
                if (UNSUPPORTED_CODES.includes(code)) throw new AreaQueryUnsupportedError(code === 'PROXY_REJECTED' ? 'Data API 허용 목록에 없는 레이어' : 'Data API에 없는 레이어')
                throw new Error(errorMessage(code, text))
            }
            const raw = r.result?.featureCollection?.features
            const features = Array.isArray(raw) ? (raw as GeoJsonObject[]) : []
            const derive = isParcelLayer(name)
            if (derive) {
                for (const f of features) {
                    const p = f.properties
                    if (p && typeof p === 'object') (p as Record<string, unknown>)['jimok'] = jimokOf((p as Record<string, unknown>)['jibun'])
                }
            }
            const total = toInt(r.record?.total)
            const pages = toInt(r.page?.total)
            const current = toInt(r.page?.current) ?? page
            return { features, total, hasMore: pages !== null && current < pages }
        },
    }
}

/** 지목을 파생해야 하는 레이어(연속지적도) */
function isParcelLayer(name: string): boolean {
    return name === 'LP_PA_CBND_BUBUN' || name === 'LP_PA_CBND_BONBUN'
}
