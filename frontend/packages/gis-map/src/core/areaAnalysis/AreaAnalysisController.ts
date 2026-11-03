// 영역 분석 컨트롤러(지도 인스턴스마다 하나, map.areaAnalysis).
//   영역(그리기 3종·현재 화면·setArea) → 분석할 레이어 고르기(트리의 GeoServer·VWorld 레이어) → run():
//   ① 질의 가능 판정·예상 건수(probe) → ② 예상 건수가 상한을 넘거나 영역이 넓으면 사전 확인 → ③ 레이어마다 서버에서 걸친 피처를 쪽으로 받기(상한까지)
//   → ④ 브라우저에서 정확 판정·잘라낸 면적·집계를 약 12ms씩 나눠 계산 → 결과 카드/강조/내보내기. 상태는 전부 인스턴스 필드 — 모듈 전역 없음.
//   영역 레이어·강조 레이어·그리기 interaction·클릭 리스너는 필요할 때만 붙이고 clear/destroy에서 뗀다(호스트 레이어·View는 안 건드림).
//   강조 레이어는 className을 따로 준다('ol-layer gm-hl-analysis'): OL은 className이 같은 레이어를 한 캔버스에 겹쳐 그리는데,
//   CORS 없는 WMS가 닿아 오염된 캔버스(지도 저장 불가)에 우리 그림이 섞이거나 반대로 우리 캔버스가 이웃 레이어와 엉키지 않게 분리한다.
//   이름은 패널 CSS(.gm-analysis·.gm-analysis__*)와 겹치지 않게 gm-hl- 접두사 — 겹치면 패널 스타일(흰 배경·max-height)이 지도 레이어에 입혀진다.
import Feature from 'ol/Feature'
import Polygon from 'ol/geom/Polygon'
import type Geometry from 'ol/geom/Geometry'
import VectorLayer from 'ol/layer/Vector'
import VectorSource from 'ol/source/Vector'
import GeoJSON from 'ol/format/GeoJSON'
import { Style, Stroke, Fill, Circle as CircleStyle } from 'ol/style'
import { getTransform, transform } from 'ol/proj'
import type OlMap from 'ol/Map'
import type MapBrowserEvent from 'ol/MapBrowserEvent'
import type { ResolvedGisMapTheme } from '../config'
import { translucent } from '../lib/color'
import type { LayerTreeController } from '../layers/LayerTreeController'
import type { AreaQuerySource } from '../sources'
import type { LayerDef } from '../types/layer'
import { createStore } from '../store'
import type { ReadableStore, WritableStore } from '../store'
import type { ToolManagerImpl } from '../tools/ToolManager'
import type { MapResources } from '../tracker'
import { categorize } from './aggregate'
import { analyzeCandidates } from './analyze'
import type { AnalyzeOutput, Candidate, SelectedRecord } from './analyze'
import { polygonAreaM2 } from './clip'
import { ANALYSIS_TOOLS, AreaDrawTool, analysisToolShape } from './drawTool'
import { buildCsv, round2 } from './exportResult'
import type { AreaLayerProvider, CancelToken, LayerCandidates, RunArea } from './providers'
import { RemoteProvider } from './remoteProvider'
import { defaultNow, defaultYield, runPool } from './runner'
import { AREA_REASON_TEXT, buildAreaModel } from './spatial'
import type { AreaModel, Ring } from './spatial'
import { DEFAULT_AREA_ANALYSIS, refKey, sameRef } from './types'
import type {
    AreaAnalysisArea, AreaAnalysisColumn, AreaAnalysisController, AreaAnalysisLayerItem, AreaAnalysisLayerRef, AreaAnalysisState, AreaConfirm,
    AreaConfirmChoice, AreaDrawShape, AreaResultRecord, AreaSelectMode, AreaShape, GisMapAreaAnalysisConfig, LayerAnalysisResult,
} from './types'

type OlFeature = Feature<Geometry>

export interface AreaAnalysisControllerOptions {
    olMap: OlMap
    resources: MapResources
    tools: ToolManagerImpl
    /** 레이어 트리(어떤 레이어가 켜져 있나·목록) */
    layers: LayerTreeController
    /** 원격 질의 수단. 없으면 레이어 목록이 비어 있다 */
    areaQuery?: AreaQuerySource
    /** 배경지도 레이어는 분석 목록에서 뺀다 */
    isBasemap(layer: LayerDef): boolean
    theme: Readonly<ResolvedGisMapTheme>
    /** 영역 레이어 zIndex(= 도구 zIndex). 강조 레이어는 1 낮다(트리 레이어보다 위, 그리기·측정보다 아래) */
    zIndex: number
    config?: GisMapAreaAnalysisConfig
    /** 시험용: 시계·양보 교체 */
    timing?: { now(): number; yieldToUi(): Promise<void> }
}

export const INITIAL_AREA_ANALYSIS_STATE: Readonly<AreaAnalysisState> = Object.freeze({
    status: 'idle' as const,
    drawing: null,
    area: null,
    areaError: null,
    mode: 'intersects' as const,
    layers: Object.freeze([]) as unknown as AreaAnalysisLayerItem[],
    picked: Object.freeze([]) as unknown as AreaAnalysisLayerRef[],
    results: Object.freeze([]) as unknown as LayerAnalysisResult[],
    confirm: null,
    active: null,
})

/** 한 레이어에서 받은 원본(서버가 걸러 준 후보) — 선택 기준을 바꾸면 이것으로 다시 계산한다(재질의 없음) */
interface LayerInput {
    raw: Array<Candidate<OlFeature>>
    geometryName: string
    generation: number | null
    total: number | null
    capped: boolean
    columnInfo: readonly AreaAnalysisColumn[]
    defaultHint: string | null
}

/** 한 레이어의 결과 원본(결과 카드 밖에 보관 — 범주 열 바꾸기·내보내기·강조·결과 목록이 쓴다) */
interface LayerData extends LayerInput {
    records: Array<SelectedRecord<OlFeature>>
    columns: string[]
    /** 받은 순서 번호 → 선택된 레코드 */
    byIndex: Map<number, SelectedRecord<OlFeature>>
}

const HIT_TOLERANCE = 4

/** 아직 끝나지 않은 상태(취소하면 '취소됨'으로 바뀐다) */
function isPending(r: LayerAnalysisResult): boolean {
    return r.status === 'queued' || r.status === 'counting' || r.status === 'confirm' || r.status === 'loading' || r.status === 'computing'
}

function errorText(e: unknown, fallback: string): string {
    return e instanceof Error && e.message ? e.message : fallback
}

export class AreaAnalysisControllerImpl implements AreaAnalysisController {
    readonly store: ReadableStore<AreaAnalysisState>

    private readonly state: WritableStore<AreaAnalysisState>
    private readonly opts: AreaAnalysisControllerOptions
    private readonly cfg: Required<GisMapAreaAnalysisConfig>
    private readonly providers: AreaLayerProvider[]
    private readonly drawTool: AreaDrawTool
    private readonly data = new Map<string, LayerData>()
    private readonly userPick = new Map<string, boolean>()
    /** 사용자가 고른 범주 열(undefined = 기본, null = 끔) */
    private readonly categoryChoice = new Map<string, string | null>()
    private readonly offs: Array<() => void> = []
    private model: AreaModel | null = null
    private token: CancelToken | null = null
    private abort: AbortController | null = null
    /** 사전 확인에 답을 기다리는 중이면 그 해결 함수 */
    private confirmResolve: ((choice: AreaConfirmChoice) => void) | null = null
    /** 강조 피처 → 어느 레이어 몇 번째(지도 클릭으로 가리킬 때) */
    private readonly featureOwner = new WeakMap<OlFeature, { ref: AreaAnalysisLayerRef; index: number }>()
    /** 패널이 열려 있다(레이어 목록 판정을 시작해도 되는 때) */
    private listening = false
    private lastListSig = ''
    private areaLayer: VectorLayer<Feature<Geometry>> | null = null
    private areaSource: VectorSource<Feature<Geometry>> | null = null
    private hlLayer: VectorLayer<Feature<Geometry>> | null = null
    private hlSource: VectorSource<Feature<Geometry>> | null = null
    private activeFeature: OlFeature | null = null
    private styles: { poly: Style; line: Style; point: Style; aPoly: Style; aLine: Style; aPoint: Style } | null = null
    private destroyed = false

    constructor(opts: AreaAnalysisControllerOptions) {
        this.opts = opts
        this.cfg = { ...DEFAULT_AREA_ANALYSIS, ...opts.config }
        this.state = createStore<AreaAnalysisState>({ ...INITIAL_AREA_ANALYSIS_STATE })
        this.store = this.state
        this.providers = [new RemoteProvider({
            layers: opts.layers, source: opts.areaQuery, isBasemap: opts.isBasemap,
            getProjection: () => opts.olMap.getView().getProjection(),
        })]
        this.drawTool = new AreaDrawTool({
            olMap: opts.olMap, resources: opts.resources, tools: opts.tools, color: opts.theme.primary,
            onDrawn: (shape, ring) => this.acceptRing(shape, ring),
        })
        this.offs.push(opts.tools.store.subscribe(() => this.syncStatus()))
        for (const p of this.providers) {
            const off = p.subscribe?.(() => this.onProvidersChanged())
            if (off) this.offs.push(off)
        }
        this.rebuildLayers()
    }

    // ── 설정 ──────────────────────────────────────────────────────────────

    setPicked(refs: AreaAnalysisLayerRef[]): void {
        if (this.destroyed) return
        for (const item of this.state.getState().layers) this.userPick.set(refKey(item.ref), refs.some(r => sameRef(r, item.ref)))
        this.rebuildLayers()
    }

    setMode(mode: AreaSelectMode): void {
        // 분석이 도는 동안(또는 사전 확인 중)에는 기준을 바꾸지 않는다 — 결과가 섞인다
        if (this.destroyed || this.state.getState().mode === mode || this.token || this.confirmResolve) return
        this.state.setState({ mode })
        // 결과가 있으면 받아 둔 피처로 다시 센다(재질의 없음 — 서버는 걸침으로 거른 결과만 주므로 중심점·완전히 안은 그 안에서 거른다)
        if (this.model && this.state.getState().results.length > 0 && !analysisToolShape(this.opts.tools.store.getState().activeTool)) {
            void this.reanalyze(mode)
        }
    }

    setCategory(ref: AreaAnalysisLayerRef, column: string | null): void {
        if (this.destroyed) return
        const key = refKey(ref)
        const d = this.data.get(key)
        const result = this.state.getState().results.find(r => sameRef(r.ref, ref))
        if (!d || !result || (result.status !== 'done' && result.status !== 'partial')) return
        if (column !== null && !d.columns.includes(column)) return
        this.categoryChoice.set(key, column)
        const category = column === null ? null : categorize(d.records, column, result.columns.find(c => c.name === column)?.label ?? column, this.cfg.categoryTop)
        this.patchResult(ref, { category })
    }

    // ── 영역 ──────────────────────────────────────────────────────────────

    startDrawing(shape: AreaDrawShape): void {
        if (this.destroyed) return
        const tool = ANALYSIS_TOOLS[shape]
        if (this.opts.tools.store.getState().activeTool === tool) return
        this.state.setState({ areaError: null })
        this.opts.tools.activate(tool)
    }

    stopDrawing(): void {
        if (this.destroyed) return
        if (analysisToolShape(this.opts.tools.store.getState().activeTool)) this.opts.tools.deactivate()
    }

    useViewExtent(): void {
        if (this.destroyed) return
        this.stopDrawing()
        const olMap = this.opts.olMap
        const size = olMap.getSize()
        if (!size || !(size[0] > 0) || !(size[1] > 0)) {
            this.state.setState({ areaError: '지도 크기를 알 수 없습니다.' })
            return
        }
        const e = olMap.getView().calculateExtent(size)
        this.acceptRing('extent', [[e[0], e[1]], [e[2], e[1]], [e[2], e[3]], [e[0], e[3]], [e[0], e[1]]])
    }

    setArea(geometry4326: unknown): void {
        if (this.destroyed) return
        const g = geometry4326 as { type?: unknown; coordinates?: unknown } | null
        let rings: unknown = null
        if (g && g.type === 'Polygon') rings = g.coordinates
        else if (g && g.type === 'MultiPolygon' && Array.isArray(g.coordinates) && g.coordinates.length === 1) rings = g.coordinates[0]
        if (!Array.isArray(rings) || rings.length === 0 || !Array.isArray(rings[0])) {
            throw new Error('[gis-map] setArea: 경위도(EPSG:4326) GeoJSON Polygon이 필요하다(MultiPolygon은 폴리곤 하나일 때만)')
        }
        if (rings.length > 1) throw new Error('[gis-map] setArea: 구멍이 있는 영역은 지원하지 않는다')
        const proj = this.opts.olMap.getView().getProjection()
        const ring = (rings[0] as number[][]).map(c => transform([c[0], c[1]], 'EPSG:4326', proj))
        this.stopDrawing()
        const reason = this.acceptRing('custom', ring)
        if (reason) throw new Error('[gis-map] setArea: ' + reason)
    }

    /** 영역을 받아 모델·레이어·상태를 만든다. 받지 못하면 이유(글자)를 돌려주고 상태에 남긴다(이전 영역은 그대로) */
    private acceptRing(shape: AreaShape, ring: Ring): string | null {
        if (this.destroyed) return null
        const check = buildAreaModel(ring)
        if (!check.ok) {
            const reason = AREA_REASON_TEXT[check.reason] ?? '영역을 받을 수 없습니다.'
            this.state.setState({ areaError: reason })
            return reason
        }
        this.cancelRun()
        this.token = null
        const model = check.model
        this.model = model
        const toLonLat = this.toLonLat()
        const flat = toLonLat(model.ring.flatMap(p => [p[0], p[1]]))
        const coords: number[][] = []
        for (let i = 0; i < flat.length; i += 2) coords.push([flat[i], flat[i + 1]])
        const area: AreaAnalysisArea = {
            shape, vertices: model.vertices, areaM2: polygonAreaM2([model.ring], toLonLat),
            geojson4326: { type: 'Polygon', coordinates: [coords] },
        }
        this.ensureLayers()
        this.areaSource?.clear(true)
        this.areaSource?.addFeature(new Feature<Geometry>(new Polygon([model.ring])))
        this.dropResults()
        this.state.setState({ area, areaError: null })
        this.syncStatus()
        return null
    }

    // ── 분석 ──────────────────────────────────────────────────────────────

    async run(): Promise<LayerAnalysisResult[]> {
        if (this.destroyed) return []
        const model = this.model
        const area = this.state.getState().area
        if (!model || !area) throw new Error('[gis-map] 영역 분석: 영역을 먼저 정해야 한다(startDrawing·useViewExtent·setArea)')
        this.cancelRun()
        this.stopDrawing()
        const abort = new AbortController()
        const token: CancelToken = { cancelled: false, signal: abort.signal }
        this.abort = abort
        this.token = token
        const st = this.state.getState()
        const refs = st.picked.slice()
        const mode = st.mode
        const dead = (): boolean => token.cancelled || this.token !== token || this.destroyed
        const runArea: RunArea = { model, ring4326: area.geojson4326.coordinates[0] }
        this.data.clear()
        this.setActiveInternal(null)
        this.state.setState({ results: refs.map(ref => this.initialResult(ref)), confirm: null })
        this.syncHighlight()
        this.syncStatus()

        // ① 질의 가능 판정 + 예상 건수(동시 요청 수 제한)
        const expected = new Map<string, number | null>()
        const failed = new Set<string>()
        await runPool(refs, this.cfg.maxConcurrent, async ref => {
            const provider = this.providerFor(ref)
            const key = refKey(ref)
            if (!provider) {
                failed.add(key)
                this.patchResult(ref, { status: 'error', error: '이 지도에서는 이 레이어를 분석할 수단이 없습니다.' }, token)
                return
            }
            this.patchResult(ref, { status: 'counting', progress: 0 }, token)
            try {
                const probe = await provider.probe(ref, runArea, token)
                if (dead()) return
                expected.set(key, probe.expected)
                this.patchResult(ref, { status: 'queued', total: probe.expected }, token)
            } catch (e) {
                failed.add(key)
                if (!dead()) this.patchResult(ref, { status: 'error', error: errorText(e, '레이어를 확인하지 못했습니다.') }, token)
            }
        }, dead)

        // ② 사전 확인: 예상 건수가 상한을 넘는 레이어가 있거나 영역이 경고 기준보다 넓을 때
        const limit = this.cfg.maxFeaturesPerLayer
        const ok = refs.filter(r => !failed.has(refKey(r)))
        const skip = new Set<string>()
        if (!dead() && ok.length > 0) {
            const over = ok.filter(r => (expected.get(refKey(r)) ?? 0) > limit)
            const areaKm2 = area.areaM2 / 1_000_000
            const overArea = areaKm2 > this.cfg.areaWarnKm2
            if (over.length > 0 || overArea) {
                for (const r of over) this.patchResult(r, { status: 'confirm' }, token)
                const choice = await this.askConfirm({
                    items: over.map(r => ({ ref: r, name: this.nameOfRef(r), expected: expected.get(refKey(r)) as number, limit })),
                    areaKm2, overAreaLimit: overArea, areaWarnKm2: this.cfg.areaWarnKm2,
                })
                if (this.token !== token) return this.state.getState().results
                if (choice === 'cancel') token.cancelled = true
                for (const r of over) {
                    if (choice === 'skip-over') {
                        skip.add(refKey(r))
                        this.patchResult(r, { status: 'cancelled', error: '예상 건수가 상한을 넘어 건너뛰었습니다.' }, token)
                    } else {
                        this.patchResult(r, { status: 'queued' }, token)
                    }
                }
            }
        }

        // ③④ 받기 + 계산
        const todo = ok.filter(r => !skip.has(refKey(r)))
        await runPool(todo, this.cfg.maxConcurrent, ref => this.runLayer(ref, runArea, mode, token), dead)
        for (const p of this.providers) p.reset?.()

        if (this.token === token) {
            if (token.cancelled) {
                // 아직 끝나지 않은 레이어는 모두 '취소됨'(숫자를 보여 주지 않는다)
                const results = this.state.getState().results.map(r => (isPending(r) ? this.cancelledResult(r) : r))
                this.state.setState({ results })
            }
            this.token = null
            this.abort = null
            this.syncHighlight()
            this.syncStatus()
        }
        return this.state.getState().results
    }

    cancel(): void {
        this.cancelRun()
    }

    private cancelRun(): void {
        if (this.token) this.token.cancelled = true
        this.abort?.abort()
        this.answerConfirm('cancel')
    }

    answerConfirm(choice: AreaConfirmChoice): void {
        const resolve = this.confirmResolve
        if (!resolve) return
        this.confirmResolve = null
        if (!this.destroyed) this.state.setState({ confirm: null })
        resolve(choice)
        this.syncStatus()
    }

    private askConfirm(confirm: AreaConfirm): Promise<AreaConfirmChoice> {
        return new Promise<AreaConfirmChoice>(resolve => {
            this.confirmResolve = resolve
            this.state.setState({ confirm })
            this.syncStatus()
        })
    }

    private nameOfRef(ref: AreaAnalysisLayerRef): string {
        return this.providerFor(ref)?.nameOf(ref) ?? ''
    }

    private initialResult(ref: AreaAnalysisLayerRef): LayerAnalysisResult {
        const provider = this.providerFor(ref)
        const item = this.state.getState().layers.find(l => sameRef(l.ref, ref))
        return {
            ref, name: item?.name ?? provider?.nameOf(ref) ?? '', provider: item?.provider ?? 'none', status: 'queued', progress: 0,
            total: null, received: 0, count: 0, byKind: { polygon: 0, line: 0, point: 0, empty: 0 },
            sumAreaM2: null, clipAreaM2: null, sumLengthM: null, columns: [], numeric: [], category: null,
            highlightCapped: false, offMap: false, warnings: [], error: null,
        }
    }

    private cancelledResult(r: LayerAnalysisResult): LayerAnalysisResult {
        return { ...this.initialResult(r.ref), name: r.name, provider: r.provider, status: 'cancelled', progress: r.progress }
    }

    /** 레이어 하나: 서버에서 걸친 피처를 상한까지 받고(③) 브라우저에서 계산한다(④) */
    private async runLayer(ref: AreaAnalysisLayerRef, area: RunArea, mode: AreaSelectMode, token: CancelToken): Promise<void> {
        const live = (): boolean => !this.destroyed && this.token === token
        const provider = this.providerFor(ref)
        try {
            if (!provider) {
                this.patchResult(ref, { status: 'error', error: '이 지도에서는 이 레이어를 분석할 수단이 없습니다.' }, token)
                return
            }
            const limit = this.cfg.maxFeaturesPerLayer
            this.patchResult(ref, { status: 'loading', progress: 0 }, token)
            const cand = await provider.candidates(ref, area, token, {
                limit,
                onProgress: (received, total) => {
                    const denom = total === null ? null : Math.min(total, limit)
                    this.patchResult(ref, { progress: denom ? Math.min(0.5, 0.5 * received / denom) : 0.25, ...(total !== null ? { total } : {}) }, token)
                },
            })
            if (!live() || token.cancelled) return
            if (!cand) {
                this.patchResult(ref, { status: 'error', error: '레이어를 찾을 수 없습니다.' }, token)
                return
            }
            const input = this.inputOf(cand)
            this.patchResult(ref, { status: 'computing', progress: 0.5 }, token)
            const out = await this.analyze(ref, input, area.model, mode, token)
            if (!live() || out === null) return
            this.finishLayer(ref, provider, input, out, token)
        } catch (e) {
            if (live() && !token.cancelled) this.patchResult(ref, { status: 'error', error: errorText(e, '분석 중 오류가 났습니다.') }, token)
        }
    }

    private inputOf(cand: LayerCandidates): LayerInput {
        return {
            raw: cand.features, geometryName: cand.geometryName, generation: cand.generation, total: cand.total, capped: cand.capped,
            columnInfo: cand.columns, defaultHint: cand.defaultCategory,
        }
    }

    private analyze(ref: AreaAnalysisLayerRef, input: LayerInput, model: AreaModel, mode: AreaSelectMode, token: CancelToken): Promise<AnalyzeOutput<OlFeature> | null> {
        const timing = this.opts.timing
        return analyzeCandidates<OlFeature>({
            candidates: input.raw, area: model, mode, toLonLat: this.toLonLat(), skipKeys: [input.geometryName], columnInfo: input.columnInfo,
            chunk: {
                budgetMs: this.cfg.chunkMs, now: timing?.now ?? defaultNow, yieldToUi: timing?.yieldToUi ?? defaultYield,
                isCancelled: () => token.cancelled || this.token !== token,
                onProgress: (done, total) => this.patchResult(ref, { progress: 0.5 + (total > 0 ? 0.5 * done / total : 0.5) }, token),
            },
        })
    }

    private finishLayer(ref: AreaAnalysisLayerRef, provider: AreaLayerProvider, input: LayerInput, out: AnalyzeOutput<OlFeature>, token: CancelToken): void {
        const key = refKey(ref)
        const choice = this.categoryChoice.get(key)
        const columnNames = out.columns.map(c => c.name)
        const hint = input.defaultHint !== null && columnNames.includes(input.defaultHint) ? input.defaultHint : out.defaultCategory
        let column = choice === undefined ? hint : choice
        if (column !== null && !columnNames.includes(column)) column = null
        const category = column === null ? null : categorize(out.records, column, out.columns.find(c => c.name === column)?.label ?? column, this.cfg.categoryTop)
        const byIndex = new Map<number, SelectedRecord<OlFeature>>()
        for (const r of out.records) {
            byIndex.set(r.index, r)
            this.featureOwner.set(r.feature, { ref, index: r.index })
        }
        this.data.set(key, { ...input, records: out.records, columns: columnNames, byIndex })
        const hlCapped = out.records.length > this.cfg.highlightMax
        const received = input.raw.length
        const warnings: LayerAnalysisResult['warnings'] = []
        if (input.capped) {
            const limitText = received.toLocaleString('en-US')
            warnings.push({
                code: 'LIMIT',
                message: input.total !== null && input.total > received
                    ? '전체 ' + input.total.toLocaleString('en-US') + '건 중 ' + limitText + '건만 집계했습니다.'
                    : '상한 ' + limitText + '건까지만 집계했습니다(전체 건수는 모릅니다).',
            })
        }
        if (hlCapped) warnings.push({ code: 'HIGHLIGHT_LIMIT', message: '지도 강조는 ' + this.cfg.highlightMax.toLocaleString('en-US') + '개까지만 그립니다.' })
        this.patchResult(ref, {
            status: input.capped ? 'partial' : 'done', progress: 1, total: input.total ?? received, received, count: out.records.length,
            byKind: out.byKind, sumAreaM2: out.sumAreaM2, clipAreaM2: out.clipAreaM2, sumLengthM: out.sumLengthM,
            columns: out.columns, numeric: out.numeric, category, highlightCapped: hlCapped,
            offMap: !provider.onMap(ref, input.generation), warnings, error: null,
        }, token)
        this.syncHighlight()
    }

    /** 선택 기준을 바꿨다 — 이미 받은 피처로 다시 계산한다(재질의 없음) */
    private async reanalyze(mode: AreaSelectMode): Promise<void> {
        const model = this.model
        if (!model || this.destroyed) return
        const abort = new AbortController()
        const token: CancelToken = { cancelled: false, signal: abort.signal }
        this.abort = abort
        this.token = token
        this.syncStatus()
        for (const r of this.state.getState().results.slice()) {
            if (token.cancelled || this.token !== token) break
            const d = this.data.get(refKey(r.ref))
            const provider = this.providerFor(r.ref)
            if (!d || !provider || (r.status !== 'done' && r.status !== 'partial')) continue
            this.patchResult(r.ref, { status: 'computing', progress: 0.5 }, token)
            const out = await this.analyze(r.ref, d, model, mode, token)
            if (out === null || this.token !== token) break
            this.finishLayer(r.ref, provider, d, out, token)
        }
        if (this.token === token) {
            if (token.cancelled) {
                const results = this.state.getState().results.map(r => (r.status === 'computing' ? this.cancelledResult(r) : r))
                this.state.setState({ results })
            }
            this.token = null
            this.abort = null
            this.syncHighlight()
            this.syncStatus()
        }
    }

    private patchResult(ref: AreaAnalysisLayerRef, patch: Partial<LayerAnalysisResult>, token?: CancelToken): void {
        if (this.destroyed || (token && this.token !== token)) return
        const results = this.state.getState().results
        const i = results.findIndex(r => sameRef(r.ref, ref))
        if (i < 0) return
        const next = results.slice()
        next[i] = { ...results[i], ...patch }
        this.state.setState({ results: next })
    }

    private dropResults(): void {
        this.data.clear()
        this.setActiveInternal(null)
        if (this.state.getState().results.length > 0) this.state.setState({ results: [] })
        this.syncHighlight()
    }

    // ── 레이어 목록 ───────────────────────────────────────────────────────

    /** 패널이 열렸다 — 목록을 다시 읽고, 아직 모르는 레이어의 질의 가능 여부 판정을 시작한다(레이어당 1번) */
    refreshLayers(): void {
        if (this.destroyed) return
        this.listening = true
        this.rebuildLayers()
        for (const p of this.providers) p.warmUp?.()
    }

    private rebuildLayers(): void {
        const layers: AreaAnalysisLayerItem[] = []
        for (const p of this.providers) layers.push(...p.list())
        // 기본은 전부 해제 — 사용자가 고른 것만(질의 불가가 된 레이어는 골라 둔 것도 뺀다)
        const picked = layers
            .filter(l => (this.userPick.get(refKey(l.ref)) ?? false) && l.queryable !== false)
            .map(l => l.ref)
        // 바뀐 게 없으면 상태를 건드리지 않는다(레이어 트리가 불투명도 같은 것으로 알릴 때마다 패널이 다시 그려지지 않게)
        const sig = layers.map(l => [refKey(l.ref), l.name, l.provider, l.on, String(l.queryable), l.reason ?? ''].join('|')).join('\n') + '#' + picked.map(refKey).join(',')
        if (sig === this.lastListSig) return
        this.lastListSig = sig
        this.state.setState({ layers, picked })
    }

    private onProvidersChanged(): void {
        if (this.destroyed) return
        this.rebuildLayers()
        if (this.listening) for (const p of this.providers) p.warmUp?.()
        // 꺼졌거나 다시 켜진 레이어의 결과는 남기되 '지도에서 꺼짐'. 강조는 켜진 레이어 것만 그린다
        const results = this.state.getState().results
        let changed = false
        const next = results.map(r => {
            const d = this.data.get(refKey(r.ref))
            const provider = this.providerFor(r.ref)
            if (!d || !provider || isPending(r)) return r
            const off = !provider.onMap(r.ref, d.generation)
            if (off === r.offMap) return r
            changed = true
            return { ...r, offMap: off }
        })
        if (changed) this.state.setState({ results: next })
        this.syncHighlight()
    }

    private providerFor(ref: AreaAnalysisLayerRef): AreaLayerProvider | null {
        return this.providers.find(p => p.handles(ref)) ?? null
    }

    // ── 활성 피처·지도 클릭 ───────────────────────────────────────────────

    setActive(ref: AreaAnalysisLayerRef, index: number | null, opts?: { fit?: boolean }): void {
        if (this.destroyed) return
        if (index === null) {
            this.setActiveInternal(null)
            this.syncHighlight()
            return
        }
        const f = this.data.get(refKey(ref))?.byIndex.get(index)?.feature ?? null
        if (!f) return
        this.ensureLayers()
        this.setActiveInternal({ ref, index }, f)
        this.syncHighlight()
        if (opts?.fit) {
            const g = f.getGeometry()
            const ext = g?.getExtent()
            if (g && ext && !ext.some(v => !Number.isFinite(v))) {
                const isPoint = ext[0] === ext[2] && ext[1] === ext[3]
                this.opts.olMap.getView().fit(ext, { padding: [60, 60, 60, 60], duration: 500, maxZoom: isPoint ? 17 : 18 })
            }
        }
    }

    private setActiveInternal(a: { ref: AreaAnalysisLayerRef; index: number } | null, feature: OlFeature | null = null): void {
        this.activeFeature = a ? feature : null
        const cur = this.state.getState().active
        if (cur === null && a === null) return
        if (cur && a && sameRef(cur.ref, a.ref) && cur.index === a.index) return
        this.state.setState({ active: a })
    }

    enableMapPick(): () => void {
        if (this.destroyed) return () => undefined
        const olMap = this.opts.olMap
        const handler = (e: MapBrowserEvent<UIEvent>): void => {
            if (this.destroyed || this.opts.tools.store.getState().activeTool !== 'none') return
            const hl = this.hlLayer
            if (!hl) return
            let hit: OlFeature | null = null
            olMap.forEachFeatureAtPixel(e.pixel, f => { hit = f as OlFeature; return true }, { layerFilter: l => l === hl, hitTolerance: HIT_TOLERANCE })
            if (!hit) {
                const cur = this.state.getState().active
                if (cur) this.setActive(cur.ref, null)
                return
            }
            const owner = this.featureOwner.get(hit)
            if (owner) this.setActive(owner.ref, owner.index)
        }
        olMap.on('singleclick', handler)
        let on = true
        const off = (): void => {
            if (!on) return
            on = false
            olMap.un('singleclick', handler)
            unregister()
        }
        const unregister = this.opts.resources.onDispose(() => {
            if (on) {
                on = false
                olMap.un('singleclick', handler)
            }
        })
        return off
    }

    // ── 내보내기 ──────────────────────────────────────────────────────────

    resultFeatures(ref: AreaAnalysisLayerRef): ReadonlyArray<unknown> {
        return this.data.get(refKey(ref))?.records.map(r => r.feature) ?? []
    }

    resultRecords(ref: AreaAnalysisLayerRef): ReadonlyArray<AreaResultRecord> {
        const d = this.data.get(refKey(ref))
        if (!d) return []
        return d.records.map(r => {
            const props = r.feature.getProperties()
            delete props[d.geometryName]
            return { index: r.index, props, areaM2: r.areaM2, clipAreaM2: r.clipAreaM2, lengthM: r.lengthM }
        })
    }

    exportResult(ref: AreaAnalysisLayerRef, format: 'csv' | 'geojson'): Blob {
        const d = this.data.get(refKey(ref))
        const result = this.state.getState().results.find(r => sameRef(r.ref, ref))
        if (!d || !result) throw new Error('[gis-map] 영역 분석: 내보낼 결과가 없다')
        if (format === 'csv') {
            const header = ['번호', ...result.columns.map(c => c.label), '면적(㎡)', '잘라낸 면적(㎡)']
            const rows = d.records.map(r => [
                r.index + 1, ...result.columns.map(c => r.feature.get(c.name)), round2(r.areaM2), round2(r.clipAreaM2),
            ])
            return new Blob([buildCsv(header, rows)], { type: 'text/csv;charset=utf-8' })
        }
        const proj = this.opts.olMap.getView().getProjection()
        const copies = d.records.map(r => {
            const props: Record<string, unknown> = {}
            for (const c of result.columns) props[c.name] = r.feature.get(c.name)
            props['area_m2'] = round2(r.areaM2)
            props['clip_area_m2'] = round2(r.clipAreaM2)
            props['row_no'] = r.index + 1
            const f = new Feature<Geometry>(r.feature.getGeometry())
            f.setProperties(props, true)
            return f
        })
        const fc = new GeoJSON().writeFeaturesObject(copies, { dataProjection: 'EPSG:4326', featureProjection: proj, decimals: 7 })
        return new Blob([JSON.stringify(fc)], { type: 'application/geo+json' })
    }

    // ── 지우기 ────────────────────────────────────────────────────────────

    clear(): void {
        if (this.destroyed) return
        this.cancelRun()
        this.token = null
        this.stopDrawing()
        this.model = null
        this.data.clear()
        this.activeFeature = null
        this.dropLayers()
        this.listening = false
        this.state.setState({ area: null, areaError: null, results: [], confirm: null, active: null })
        this.syncStatus()
    }

    destroy(): void {
        if (this.destroyed) return
        this.cancelRun()
        this.token = null
        this.offs.splice(0).forEach(off => off())
        this.providers.forEach(p => p.destroy?.())
        this.dropLayers()
        this.data.clear()
        this.destroyed = true
        this.state.destroy()
    }

    // ── 상태·그리기 ───────────────────────────────────────────────────────

    private syncStatus(): void {
        if (this.destroyed) return
        const st = this.state.getState()
        const shape = analysisToolShape(this.opts.tools.store.getState().activeTool)
        const status: AreaAnalysisState['status'] = shape ? 'drawing' : this.confirmResolve ? 'confirm' : this.token ? 'running'
            : st.results.some(r => r.status !== 'cancelled') ? 'done' : st.area ? 'ready' : 'idle'
        this.state.setState({ status, drawing: shape })
    }

    private toLonLat(): (flat: number[]) => number[] {
        const tf = getTransform(this.opts.olMap.getView().getProjection(), 'EPSG:4326')
        return flat => tf(flat, undefined, 2)
    }

    private ensureLayers(): void {
        if (this.areaLayer) return
        const { resources, theme, zIndex } = this.opts
        const color = theme.primary
        const areaStyle = new Style({
            stroke: new Stroke({ color, width: 2.5, lineDash: [9, 6] }),
            fill: new Fill({ color: translucent(color, 0.06) }),
        })
        this.areaSource = new VectorSource<Feature<Geometry>>()
        this.areaLayer = new VectorLayer<Feature<Geometry>>({ source: this.areaSource, zIndex, style: areaStyle })
        resources.addLayer(this.areaLayer)

        const sel = theme.selection
        const act = sel.active
        const stroke = (c: string, w: number): Stroke => new Stroke({ color: c, width: w })
        const dot = (c: string, r: number): CircleStyle => new CircleStyle({ radius: r, fill: new Fill({ color: c }), stroke: new Stroke({ color: '#fff', width: 1.5 }) })
        this.styles = {
            poly: new Style({ stroke: stroke(sel.stroke, 2.5), fill: new Fill({ color: sel.fill }) }),
            line: new Style({ stroke: stroke(sel.stroke, 4) }),
            point: new Style({ image: dot(sel.stroke, 7) }),
            aPoly: new Style({ stroke: stroke(act, 4), fill: new Fill({ color: translucent(act, 0.15) }) }),
            aLine: new Style({ stroke: stroke(act, 5) }),
            aPoint: new Style({ image: dot(act, 9) }),
        }
        this.hlSource = new VectorSource<Feature<Geometry>>()
        this.hlLayer = new VectorLayer<Feature<Geometry>>({
            source: this.hlSource, zIndex: zIndex - 1, className: 'ol-layer gm-hl-analysis',
            style: feature => {
                const s = this.styles!
                const type = (feature.getGeometry() as Geometry | undefined)?.getType() ?? ''
                const active = feature === this.activeFeature
                if (type === 'Point' || type === 'MultiPoint') return active ? s.aPoint : s.point
                if (type === 'LineString' || type === 'MultiLineString') return active ? s.aLine : s.line
                return active ? s.aPoly : s.poly
            },
        })
        resources.addLayer(this.hlLayer)
    }

    private dropLayers(): void {
        const r = this.opts.resources
        if (this.areaLayer) r.removeLayer(this.areaLayer)
        if (this.hlLayer) r.removeLayer(this.hlLayer)
        this.areaLayer = this.hlLayer = null
        this.areaSource = this.hlSource = null
        this.styles = null
    }

    /** 강조 레이어를 지금 결과(지도에 켜진 레이어의 것만, 레이어당 상한까지)와 활성 피처로 다시 채운다 */
    private syncHighlight(): void {
        const source = this.hlSource
        if (!source) return
        const feats: OlFeature[] = []
        for (const r of this.state.getState().results) {
            if (r.offMap || (r.status !== 'done' && r.status !== 'partial')) continue
            const d = this.data.get(refKey(r.ref))
            if (!d) continue
            const n = Math.min(d.records.length, this.cfg.highlightMax)
            for (let i = 0; i < n; i++) feats.push(d.records[i].feature)
        }
        if (this.activeFeature && !feats.includes(this.activeFeature)) feats.push(this.activeFeature)
        source.clear(true)
        if (feats.length > 0) source.addFeatures(feats)
        else if (this.areaSource && this.areaSource.getFeatures().length === 0) this.dropLayers()
    }
}
