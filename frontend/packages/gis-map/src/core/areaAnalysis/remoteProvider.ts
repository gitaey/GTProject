// 영역 분석 원격 제공자: 레이어 트리의 GeoServer(WFS)·VWorld(Data API) 레이어를 sources.areaQuery로 질의한다.
//   · 어떤 트리 레이어가 질의 가능한가 = 종류(VWorld WMS 주소·GeoServer 소스)로 갈라 목록을 만들고, 질의 수단(describe)이 레이어당 1번 판정한다(캐시)
//   · 서버는 "영역에 걸친 피처"만 걸러 주고, 선택 기준·잘라낸 면적·집계는 컨트롤러가 브라우저에서 한다
//   · 모든 상태(판정 캐시·미리 받은 1쪽)는 인스턴스 필드 — 모듈 전역 없음
import type Feature from 'ol/Feature'
import type Geometry from 'ol/geom/Geometry'
import GeoJSON from 'ol/format/GeoJSON'
import type { ProjectionLike } from 'ol/proj'
import { isVWorldUrl } from '../layers/resolveLayerUrl'
import type { LayerTreeController } from '../layers/LayerTreeController'
import { AreaQueryUnsupportedError } from '../sources'
import type { AreaQueryLayerInfo, AreaQueryPage, AreaQuerySource } from '../sources'
import type { LayerDef } from '../types/layer'
import type { Candidate } from './analyze'
import type { AreaLayerProvider, CancelToken, FetchOptions, LayerCandidates, ProbeResult, RunArea } from './providers'
import { runPool } from './runner'
import { refKey } from './types'
import type { AreaAnalysisLayerItem, AreaAnalysisLayerRef } from './types'

export interface RemoteProviderOptions {
    layers: LayerTreeController
    /** 없으면 목록이 비어 있다(질의 수단이 없다) */
    source: AreaQuerySource | undefined
    /** 배경지도 레이어는 목록에서 뺀다 */
    isBasemap(layer: LayerDef): boolean
    getProjection(): ProjectionLike
}

interface Target {
    layer: LayerDef
    part: string | undefined
}

type Classified =
    | { kind: 'query'; provider: 'geoserver' | 'vworld'; parts: string[] }
    | { kind: 'gray'; reason: string }

/** 그림만 주는 레이어 종류 */
const IMAGE_TYPES: readonly string[] = Object.freeze(['XYZ', 'WMTS', 'TMS', 'MVT', 'ARCGIS'])
/** 한 질의에서 쪽을 넘기는 횟수 안전 장치(응답이 계속 hasMore면 끊는다) */
const MAX_PAGES = 400

/** 쉼표로 묶인 레이어 이름을 나눈다 */
function splitNames(layerName: string): string[] {
    return layerName.split(',').map(s => s.trim()).filter(s => s !== '')
}

export function classifyTreeLayer(layer: LayerDef): Classified {
    if (IMAGE_TYPES.includes(layer.type)) return { kind: 'gray', reason: '그림만 있는 레이어' }
    const names = layer.layerName ? splitNames(layer.layerName) : []
    if (layer.type === 'WMS' && isVWorldUrl(layer.url) && names.length > 0) return { kind: 'query', provider: 'vworld', parts: names }
    if (layer.sourceType === 'GEOSERVER' && (layer.type === 'WMS' || layer.type === 'WFS') && layer.layerName) {
        return { kind: 'query', provider: 'geoserver', parts: [layer.layerName] }
    }
    return { kind: 'gray', reason: '짝 질의 수단이 없는 레이어' }
}

export class RemoteProvider implements AreaLayerProvider {
    private readonly opts: RemoteProviderOptions
    private readonly infos = new Map<string, AreaQueryLayerInfo>()
    private readonly pending = new Map<string, Promise<AreaQueryLayerInfo>>()
    /** describe를 이미 끝낸 레이어(결과가 'unknown'이어도 다시 묻지 않는다 — 알림이 되풀이되는 것을 막는다) */
    private readonly described = new Set<string>()
    /** probe가 미리 받아 둔 1쪽(VWorld — 전체 건수를 알려면 1쪽을 받아야 한다) */
    private readonly firstPages = new Map<string, AreaQueryPage>()
    private readonly listeners = new Set<() => void>()
    private readonly offs: Array<() => void> = []
    private disposed = false

    constructor(opts: RemoteProviderOptions) {
        this.opts = opts
        this.offs.push(opts.layers.store.subscribe((s, prev) => {
            if (s.tree !== prev.tree || s.visible !== prev.visible || s.basemapMode !== prev.basemapMode) this.emit()
        }))
    }

    handles(ref: AreaAnalysisLayerRef): boolean {
        return ref.kind === 'tree'
    }

    subscribe(fn: () => void): () => void {
        this.listeners.add(fn)
        return () => { this.listeners.delete(fn) }
    }

    private emit(): void {
        if (this.disposed) return
        for (const fn of Array.from(this.listeners)) fn()
    }

    private refOf(layer: LayerDef, part: string | undefined): AreaAnalysisLayerRef {
        return part === undefined ? { kind: 'tree', layerId: layer.id } : { kind: 'tree', layerId: layer.id, part }
    }

    nameOf(ref: AreaAnalysisLayerRef): string {
        const t = this.resolve(ref)
        if (!t) return '레이어 #' + ref.layerId
        return t.part !== undefined ? t.layer.name + ' · ' + t.part : t.layer.name
    }

    list(): AreaAnalysisLayerItem[] {
        if (!this.opts.source) return []
        const out: AreaAnalysisLayerItem[] = []
        for (const layer of this.opts.layers.allLayers()) {
            if (this.opts.isBasemap(layer)) continue
            const on = this.opts.layers.isVisible(layer)
            const c = classifyTreeLayer(layer)
            if (c.kind === 'gray') {
                out.push({ ref: this.refOf(layer, undefined), name: layer.name, provider: 'none', on, queryable: false, reason: c.reason, count: null })
                continue
            }
            const multi = c.parts.length > 1
            for (const part of c.parts) {
                const p = multi ? part : undefined
                const ref = this.refOf(layer, p)
                const info = this.infos.get(refKey(ref))
                out.push({
                    ref, name: multi ? layer.name + ' · ' + part : layer.name, provider: c.provider, on,
                    queryable: info ? info.queryable : 'unknown',
                    reason: info && info.queryable === false ? info.reason ?? '질의할 수 없는 레이어입니다' : null,
                    count: null,
                })
            }
        }
        return out
    }

    /** ref → (트리 레이어, 묶음 이름). 질의 가능한 종류가 아니면 null */
    private resolve(ref: AreaAnalysisLayerRef): Target | null {
        const layer = this.opts.layers.allLayers().find(l => l.id === ref.layerId)
        if (!layer) return null
        const c = classifyTreeLayer(layer)
        if (c.kind !== 'query') return null
        if (ref.part !== undefined && !c.parts.includes(ref.part)) return null
        return { layer, part: ref.part }
    }

    warmUp(): void {
        if (!this.opts.source || this.disposed) return
        const refs = this.list().filter(l => l.queryable === 'unknown' && !this.described.has(refKey(l.ref)) && !this.pending.has(refKey(l.ref))).map(l => l.ref)
        if (refs.length === 0) return
        void runPool(refs, 2, async ref => { await this.describeOnce(ref) }, () => this.disposed)
    }

    /** 질의 가능 판정(레이어당 1번 — 진행 중인 것도 하나로 합친다). 실패는 던지지 않고 회색 정보로 바꾼다 */
    private describeOnce(ref: AreaAnalysisLayerRef): Promise<AreaQueryLayerInfo> {
        const key = refKey(ref)
        const known = this.infos.get(key)
        if (known && (known.queryable !== 'unknown' || this.described.has(key))) return Promise.resolve(known)
        const running = this.pending.get(key)
        if (running) return running
        const t = this.resolve(ref)
        const source = this.opts.source
        if (!t || !source) return Promise.resolve({ queryable: false, reason: '짝 질의 수단이 없는 레이어' })
        const p = source.describe(t.layer, t.part).then(
            info => info,
            (e: unknown): AreaQueryLayerInfo => ({
                queryable: false,
                reason: e instanceof AreaQueryUnsupportedError ? e.message : '질의 수단에 연결하지 못했습니다',
            }),
        ).then(info => {
            this.pending.delete(key)
            this.described.add(key)
            if (!this.disposed) {
                this.infos.set(key, info)
                this.emit()
            }
            return info
        })
        this.pending.set(key, p)
        return p
    }

    private markUnsupported(ref: AreaAnalysisLayerRef, reason: string): void {
        this.infos.set(refKey(ref), { queryable: false, reason })
        this.emit()
    }

    private async queryPage(ref: AreaAnalysisLayerRef, t: Target, area: RunArea, page: number, token: CancelToken): Promise<AreaQueryPage> {
        const source = this.opts.source
        if (!source) throw new Error('이 지도에는 영역 질의 수단이 없습니다.')
        try {
            const res = await source.query(t.layer, t.part, area.ring4326, page, token.signal)
            const info = this.infos.get(refKey(ref))
            if (!info || info.queryable === 'unknown') this.infos.set(refKey(ref), { ...(info ?? {}), queryable: true })
            return res
        } catch (e) {
            if (e instanceof AreaQueryUnsupportedError) this.markUnsupported(ref, e.message)
            throw e
        }
    }

    async probe(ref: AreaAnalysisLayerRef, area: RunArea, token: CancelToken): Promise<ProbeResult> {
        const t = this.resolve(ref)
        const source = this.opts.source
        if (!t || !source) throw new Error('이 지도에서는 이 레이어를 분석할 수단이 없습니다.')
        const info = await this.describeOnce(ref)
        if (token.cancelled) return { expected: null }
        if (info.queryable === false) throw new Error(info.reason ?? '질의할 수 없는 레이어입니다.')
        if (info.supportsCount && source.count) {
            return { expected: await source.count(t.layer, t.part, area.ring4326, token.signal) }
        }
        // 전체 건수를 미리 알 수 없는 소스(VWorld) — 1쪽을 받아 total을 읽고, 그 쪽은 candidates가 이어서 쓴다
        const page = await this.queryPage(ref, t, area, 1, token)
        this.firstPages.set(refKey(ref), page)
        return { expected: page.total }
    }

    async candidates(ref: AreaAnalysisLayerRef, area: RunArea, token: CancelToken, o: FetchOptions): Promise<LayerCandidates | null> {
        const t = this.resolve(ref)
        if (!t) return null
        const key = refKey(ref)
        const info = this.infos.get(key)
        const raw: unknown[] = []
        const seen = new Set<string>()
        let total: number | null = null
        let hasMore = true
        let page = 1
        const first = this.firstPages.get(key)
        this.firstPages.delete(key)
        while (hasMore && raw.length < o.limit && page <= MAX_PAGES) {
            if (token.cancelled) return null
            const res = page === 1 && first ? first : await this.queryPage(ref, t, area, page, token)
            if (res.total !== null) total = res.total
            for (const f of res.features) {
                const id = (f as { id?: unknown }).id
                if (typeof id === 'string' || typeof id === 'number') {
                    const k = String(id)
                    if (seen.has(k)) continue
                    seen.add(k)
                }
                if (raw.length < o.limit) raw.push(f)
            }
            hasMore = res.hasMore && res.features.length > 0
            page++
            o.onProgress(raw.length, total)
        }
        if (token.cancelled) return null
        const capped = hasMore && raw.length >= o.limit
        const read = new GeoJSON().readFeatures({ type: 'FeatureCollection', features: raw }, {
            dataProjection: 'EPSG:4326', featureProjection: this.opts.getProjection(),
        }) as Array<Feature<Geometry>>
        // 피처 id는 지운다: 강조 레이어(VectorSource)는 같은 id의 피처를 조용히 버리므로 서로 다른 레이어의 id가 겹치면 강조가 사라진다(중복 제거는 위에서 이미 했다)
        const features: Array<Candidate<Feature<Geometry>>> = read.map((feature, index) => { feature.setId(undefined); return { feature, index } })
        return {
            features, geometryName: 'geometry', generation: this.opts.layers.isVisible(t.layer) ? 1 : null,
            total, capped, columns: info?.columns ?? [], defaultCategory: info?.defaultCategory ?? null,
        }
    }

    onMap(ref: AreaAnalysisLayerRef, generation: number | null): boolean {
        if (generation === null) return true
        const t = this.resolve(ref)
        return !!t && this.opts.layers.isVisible(t.layer)
    }

    reset(): void {
        this.firstPages.clear()
    }

    destroy(): void {
        this.disposed = true
        this.offs.splice(0).forEach(off => off())
        this.listeners.clear()
        this.firstPages.clear()
    }
}
