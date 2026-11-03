// 필지 정보 컨트롤러(지도 인스턴스마다 하나, map.parcelInfo).
//   "필지 정보" 도구(MapTool 'parcel-info')가 켜진 동안만 지도 클릭(singleclick)을 듣고, 클릭 지점의 필지 1건(sources.parcel.infoAt)을 받아
//   경계를 강조(map.parcel.showParcel, 핀 없음)하고 면적(면적 측정 도구와 같은 구면 공식)을 재고, 이어서 그 필지의 건물 목록(sources.parcelBuildings.byPnu)을 받는다.
//   필지 먼저, 건물 나중. 연속 클릭은 이전 요청을 취소하고(AbortController) 늦게 온 응답은 요청 번호로 버린다. 같은 필지 안을 다시 누르면 요청 0.
//   건물 결과는 PNU별로 인스턴스 안에 최근 30건·5분 캐시한다. 건물 API가 404면(이식처 백엔드에 없음) 인스턴스 동안 건물 조회를 끈다.
//   상태·캐시·요청 번호·리스너는 전부 인스턴스 필드(모듈 전역 없음). 도구가 꺼지거나 close/clear/destroy 되면 요청 취소·강조·리스너를 정리한다.
import type Geometry from 'ol/geom/Geometry'
import type MultiPolygon from 'ol/geom/MultiPolygon'
import type Polygon from 'ol/geom/Polygon'
import GeoJSON from 'ol/format/GeoJSON'
import { fromLonLat, toLonLat } from 'ol/proj'
import type { ProjectionLike } from 'ol/proj'
import type OlMap from 'ol/Map'
import type MapBrowserEvent from 'ol/MapBrowserEvent'
import type { ParcelHighlighter } from '../features/ParcelHighlighter'
import type { ParcelBuildingSource, ParcelBuildingsResult, ParcelInfo, ParcelSource } from '../sources'
import { createStore } from '../store'
import type { ReadableStore, WritableStore } from '../store'
import { polygonArea } from '../tools/AreaTool'
import type { ToolHandler, ToolManagerImpl } from '../tools/ToolManager'
import type { MapResources } from '../tracker'
import type { MapTool } from '../types/draw'
import type { GeoJsonObject } from '../types/geojson'
import { INITIAL_PARCEL_INFO_STATE } from './types'
import type { ParcelInfoController, ParcelInfoState } from './types'

export const PARCEL_INFO_TOOL: MapTool = 'parcel-info'
/** 카드가 처음 받는 건물 수 / 전체 보기 상한(백엔드 U25의 기본값·최대값) */
export const BUILDINGS_FIRST_LIMIT = 200
export const BUILDINGS_ALL_LIMIT = 1000
const CACHE_MAX = 30
const CACHE_TTL_MS = 5 * 60 * 1000

export interface ParcelInfoControllerOptions {
    olMap: OlMap
    resources: MapResources
    tools: ToolManagerImpl
    /** 경계 강조(검색 강조와 같은 레이어 관리자) */
    parcel: ParcelHighlighter
    parcelSource?: ParcelSource
    buildingSource?: ParcelBuildingSource
    /** 시험용: 시계 교체 */
    now?: () => number
}

interface CacheEntry {
    result: ParcelBuildingsResult
    limit: number
    at: number
}

function errorText(e: unknown, fallback: string): string {
    return e instanceof Error && e.message ? e.message : fallback
}

function statusOf(e: unknown): number | null {
    const s = (e as { status?: unknown } | null)?.status
    return typeof s === 'number' ? s : null
}

function isAbort(e: unknown): boolean {
    return (e as { name?: unknown } | null)?.name === 'AbortError'
}

/** 경계 Feature(EPSG:4326) → 뷰 좌표계 지오메트리. 읽을 수 없으면 null */
export function readParcelGeometry(feature: GeoJsonObject, projection: ProjectionLike): Geometry | null {
    try {
        const wrapped = feature.type === 'Feature' ? feature : { type: 'Feature', geometry: feature, properties: {} }
        const features = new GeoJSON().readFeatures({ type: 'FeatureCollection', features: [wrapped] }, { featureProjection: projection })
        return features[0]?.getGeometry() ?? null
    } catch {
        return null
    }
}

/** Polygon·MultiPolygon의 지상 면적(㎡). 그 밖의 모양·비정상 값은 null. projection = 지오메트리가 지금 있는 좌표계(뷰 좌표계) */
export function parcelAreaM2(geometry: Geometry | null, projection: ProjectionLike): number | null {
    if (!geometry) return null
    const type = geometry.getType()
    let total = 0
    if (type === 'Polygon') total = polygonArea(geometry as Polygon, projection)
    else if (type === 'MultiPolygon') for (const p of (geometry as MultiPolygon).getPolygons()) total += polygonArea(p, projection)
    else return null
    return Number.isFinite(total) ? total : null
}

export class ParcelInfoControllerImpl implements ParcelInfoController, ToolHandler {
    readonly store: ReadableStore<ParcelInfoState>
    readonly available: boolean

    private readonly state: WritableStore<ParcelInfoState>
    private readonly opts: ParcelInfoControllerOptions
    private readonly now: () => number
    private readonly cache = new Map<string, CacheEntry>()
    private readonly offs: Array<() => void> = []
    private offClick: (() => void) | null = null
    /** 요청 번호: 새 조회·닫기마다 올려 늦게 온 응답을 버린다 */
    private seq = 0
    private abort: AbortController | null = null
    /** 지금 카드가 강조한 필지의 토큰(0 = 없음) */
    private hlToken = 0
    /** 지금 카드 필지의 경계(뷰 좌표계) — 같은 필지 안 재클릭 판정용 */
    private shape: Geometry | null = null
    /** 건물 API가 404였다 — 인스턴스 동안 건물 조회를 끈다 */
    private buildingsUnsupported = false
    private destroyed = false

    constructor(opts: ParcelInfoControllerOptions) {
        this.opts = opts
        this.now = opts.now ?? Date.now
        this.available = typeof opts.parcelSource?.infoAt === 'function'
        this.state = createStore<ParcelInfoState>({ ...INITIAL_PARCEL_INFO_STATE })
        this.store = this.state
        opts.tools.register(this)
        // 검색 강조가 강조를 덮으면 카드를 닫는다(강조는 이미 바뀌었으니 지우지 않는다)
        this.offs.push(opts.parcel.onReplaced(() => this.closeInternal(false)))
    }

    // ── 도구(ToolHandler) ──────────────────────────────────────────────────

    handles(tool: MapTool): boolean {
        return tool === PARCEL_INFO_TOOL
    }

    update(next: MapTool, prev: MapTool): void {
        if (this.destroyed) return
        if (next === PARCEL_INFO_TOOL) {
            this.startListening()
        } else if (prev === PARCEL_INFO_TOOL) {
            this.stopListening()
            this.closeInternal(true)
        }
    }

    private startListening(): void {
        if (this.offClick) return
        const olMap = this.opts.olMap
        const handler = (e: MapBrowserEvent<UIEvent>): void => {
            if (this.destroyed || this.opts.tools.store.getState().activeTool !== PARCEL_INFO_TOOL) return
            const [lon, lat] = toLonLat(e.coordinate, olMap.getView().getProjection())
            void this.lookupAt(lon, lat)
        }
        olMap.on('singleclick', handler)
        let on = true
        const unregister = this.opts.resources.onDispose(() => {
            if (on) {
                on = false
                olMap.un('singleclick', handler)
            }
        })
        this.offClick = (): void => {
            if (!on) return
            on = false
            olMap.un('singleclick', handler)
            unregister()
        }
    }

    private stopListening(): void {
        this.offClick?.()
        this.offClick = null
    }

    // ── 조회 ──────────────────────────────────────────────────────────────

    async lookupAt(lon: number, lat: number): Promise<void> {
        const source = this.opts.parcelSource
        if (this.destroyed || !source?.infoAt) return
        const cur = this.state.getState()
        // 같은 필지 안을 다시 눌렀다: 요청 없이 그대로(점만 갱신하지 않는다)
        if (cur.open && cur.parcel.status === 'ready' && this.shape && this.containsLonLat(lon, lat)) return

        this.cancelPending()
        this.removeHighlight()
        this.shape = null
        const seq = ++this.seq
        const abort = new AbortController()
        this.abort = abort
        this.state.setState({
            open: true,
            point: [lon, lat],
            parcel: { status: 'loading', info: null, areaM2: null, error: null },
            buildings: { status: 'off', result: null, error: null, loadingAll: false },
        })

        let info: ParcelInfo | null
        try {
            info = await source.infoAt(lon, lat, abort.signal)
        } catch (e) {
            if (this.seq !== seq || this.destroyed || abort.signal.aborted || isAbort(e)) return
            this.state.setState({ parcel: { status: 'error', info: null, areaM2: null, error: errorText(e, '필지 정보를 불러오지 못했습니다.') } })
            return
        }
        if (this.seq !== seq || this.destroyed) return
        if (!info) {
            this.state.setState({ parcel: { status: 'none', info: null, areaM2: null, error: null } })
            return
        }

        let areaM2: number | null = null
        if (info.geometry) {
            const projection = this.opts.olMap.getView().getProjection()
            this.shape = readParcelGeometry(info.geometry, projection)
            areaM2 = parcelAreaM2(this.shape, projection)
            if (this.shape) this.hlToken = this.opts.parcel.showParcel(info.geometry)
        }
        this.state.setState({ parcel: { status: 'ready', info, areaM2, error: null } })
        await this.fetchBuildings(info.pnu, seq, abort, BUILDINGS_FIRST_LIMIT)
    }

    async retry(): Promise<void> {
        if (this.destroyed) return
        const s = this.state.getState()
        if (!s.open) return
        if (s.parcel.status === 'error' || s.parcel.status === 'none') {
            if (s.point) await this.lookupAt(s.point[0], s.point[1])
            return
        }
        const info = s.parcel.info
        if (s.parcel.status !== 'ready' || !info) return
        const bs = s.buildings.status
        if (bs !== 'error' && bs !== 'unavailable' && bs !== 'unauthorized') return
        this.cancelPending()
        const seq = ++this.seq
        const abort = new AbortController()
        this.abort = abort
        await this.fetchBuildings(info.pnu, seq, abort, BUILDINGS_FIRST_LIMIT)
    }

    async loadAllBuildings(): Promise<void> {
        if (this.destroyed) return
        const s = this.state.getState()
        const info = s.parcel.info
        const res = s.buildings.result
        if (!s.open || s.buildings.status !== 'ready' || !info || !res || !res.truncated || s.buildings.loadingAll) return
        const seq = this.seq
        const abort = this.abort
        const source = this.opts.buildingSource
        if (!source || !abort) return
        const cached = this.cacheGet(info.pnu, BUILDINGS_ALL_LIMIT)
        if (cached) {
            this.state.setState({ buildings: { status: 'ready', result: cached, error: null, loadingAll: false } })
            return
        }
        this.state.setState({ buildings: { ...s.buildings, error: null, loadingAll: true } })
        try {
            const result = await source.byPnu(info.pnu, { limit: BUILDINGS_ALL_LIMIT, signal: abort.signal })
            if (this.seq !== seq || this.destroyed) return
            this.cachePut(info.pnu, result, BUILDINGS_ALL_LIMIT)
            this.state.setState({ buildings: { status: 'ready', result, error: null, loadingAll: false } })
        } catch (e) {
            if (this.seq !== seq || this.destroyed || abort.signal.aborted || isAbort(e)) return
            // 앞서 받은 일부 결과는 그대로 두고 오류만 알린다
            this.state.setState({ buildings: { ...this.state.getState().buildings, error: errorText(e, '전체 목록을 불러오지 못했습니다.'), loadingAll: false } })
        }
    }

    /** 건물 칸 조회(캐시 → 소스). seq·abort는 이 조회의 것 — 그사이 다른 조회가 시작됐으면 결과를 버린다 */
    private async fetchBuildings(pnu: string, seq: number, abort: AbortController, limit: number): Promise<void> {
        const source = this.opts.buildingSource
        if (!source) return
        if (this.buildingsUnsupported) {
            this.state.setState({ buildings: { status: 'unsupported', result: null, error: null, loadingAll: false } })
            return
        }
        const cached = this.cacheGet(pnu, limit)
        if (cached) {
            this.state.setState({ buildings: { status: 'ready', result: cached, error: null, loadingAll: false } })
            return
        }
        this.state.setState({ buildings: { status: 'loading', result: null, error: null, loadingAll: false } })
        try {
            const result = await source.byPnu(pnu, { limit, signal: abort.signal })
            if (this.seq !== seq || this.destroyed) return
            this.cachePut(pnu, result, limit)
            this.state.setState({ buildings: { status: 'ready', result, error: null, loadingAll: false } })
        } catch (e) {
            if (this.seq !== seq || this.destroyed || abort.signal.aborted || isAbort(e)) return
            const code = statusOf(e)
            if (code === 404) this.buildingsUnsupported = true
            const status = code === 403 ? 'unauthorized' : code === 404 ? 'unsupported' : code === 503 ? 'unavailable' : 'error'
            this.state.setState({ buildings: { status, result: null, error: errorText(e, '건물 정보를 불러오지 못했습니다.'), loadingAll: false } })
        }
    }

    // ── 캐시(PNU별, 최근 30건·5분) ───────────────────────────────────────────

    /** limit 건 이상을 보장하는 항목만(잘리지 않은 결과는 어느 limit에도 쓸 수 있다) */
    private cacheGet(pnu: string, limit: number): ParcelBuildingsResult | null {
        const e = this.cache.get(pnu)
        if (!e) return null
        if (this.now() - e.at > CACHE_TTL_MS) {
            this.cache.delete(pnu)
            return null
        }
        if (e.result.truncated && e.limit < limit) return null
        // 최근 사용 순으로 다시 넣는다
        this.cache.delete(pnu)
        this.cache.set(pnu, e)
        return e.result
    }

    private cachePut(pnu: string, result: ParcelBuildingsResult, limit: number): void {
        this.cache.delete(pnu)
        this.cache.set(pnu, { result, limit, at: this.now() })
        while (this.cache.size > CACHE_MAX) {
            const oldest = this.cache.keys().next().value
            if (oldest === undefined) break
            this.cache.delete(oldest)
        }
    }

    // ── 닫기·정리 ─────────────────────────────────────────────────────────

    close(): void {
        this.closeInternal(true)
    }

    clear(): void {
        this.closeInternal(true)
    }

    private closeInternal(clearHighlight: boolean): void {
        if (this.destroyed) return
        this.cancelPending()
        if (clearHighlight) this.removeHighlight()
        else this.hlToken = 0
        this.shape = null
        if (this.state.getState().open) this.state.setState({ ...INITIAL_PARCEL_INFO_STATE })
    }

    private cancelPending(): void {
        this.seq++
        this.abort?.abort()
        this.abort = null
    }

    private removeHighlight(): void {
        if (this.hlToken !== 0) this.opts.parcel.clearParcel(this.hlToken)
        this.hlToken = 0
    }

    private containsLonLat(lon: number, lat: number): boolean {
        const shape = this.shape
        if (!shape) return false
        const olMap = this.opts.olMap
        const projection = olMap.getView().getProjection()
        const p = fromLonLat([lon, lat], projection)
        const g = shape as unknown as { intersectsCoordinate?: (c: number[]) => boolean }
        return typeof g.intersectsCoordinate === 'function' ? g.intersectsCoordinate(p) : false
    }

    destroy(): void {
        if (this.destroyed) return
        this.cancelPending()
        this.removeHighlight()
        this.stopListening()
        this.offs.forEach(f => f())
        this.offs.length = 0
        this.cache.clear()
        this.shape = null
        this.destroyed = true
        this.state.destroy()
    }
}
