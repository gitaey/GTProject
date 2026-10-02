// 지도 엔진 본체. 처음부터 "붙이기(attach) 모델"로 만든다.
//   createGisMap  = 엔진이 ol.Map을 새로 만든 뒤 내부적으로 붙인다(owned = true)
//   attachGisMap  = 호스트가 이미 만든 ol.Map에 붙인다(owned = false, 호스트의 target·view·기존 레이어는 안 건드림)
// 상태는 전부 인스턴스 필드다(한 페이지에 지도 2개를 띄워도 서로 영향 없음).
import OlMap from 'ol/Map'
import View from 'ol/View'
import { fromLonLat, get as getProjection, transformExtent } from 'ol/proj'
import { resolveTheme, resolveView, resolveZIndex } from './config'
import type { GisMapAttachOptions, GisMapConfig, GisMapZIndex, ResolvedGisMapTheme } from './config'
import { createEmitter } from './events'
import type { Emitter } from './events'
import { DEFAULT_HOST, mergeHost } from './host'
import type { GisMapHost, PartialGisMapHost } from './host'
import { createHttpClient } from './http'
import type { HttpClient } from './http'
import type { GisMapPlugin } from './plugin'
import { hasLonLatTransform, registerProjections } from './projection'
import { resolveSources } from './sources'
import type { GisMapSources } from './sources'
import { createStore } from './store'
import type { ReadableStore, WritableStore } from './store'
import { MapResources } from './tracker'
import { DEFAULT_DRAW_STYLE, DrawControllerImpl } from './tools/DrawController'
import type { DrawController } from './tools/DrawController'
import { ToolManagerImpl } from './tools/ToolManager'
import type { ToolManager } from './tools/ToolManager'
import { ToolHintView, resolveToolHints } from './tools/toolHint'
import { DistanceTool } from './tools/DistanceTool'
import { AreaTool } from './tools/AreaTool'
import { RadiusTool } from './tools/RadiusTool'
import { LayerTreeControllerImpl } from './layers/LayerTreeController'
import type { LayerTreeController } from './layers/LayerTreeController'
import { resolveBasemapModes } from './layers/basemap'
import { defaultResolveLayerUrl } from './layers/resolveLayerUrl'
import { RasterOverlayControllerImpl } from './overlays/RasterOverlayController'
import type { RasterOverlayController } from './overlays/RasterOverlayController'
import { VectorOverlayControllerImpl } from './overlays/VectorOverlayController'
import type { VectorOverlayController } from './overlays/VectorOverlayController'
import { ParcelHighlighterImpl } from './features/ParcelHighlighter'
import type { ParcelHighlighter } from './features/ParcelHighlighter'
import { RegionWatcherImpl } from './features/RegionWatcher'
import type { RegionWatcher } from './features/RegionWatcher'

/** zoom 기본 16, 600ms */
export interface FlyToRequest {
    lon: number
    lat: number
    zoom?: number
}

export interface GisMapEvents {
    clear: undefined
    hostchange: GisMapHost
    destroy: undefined
}

export interface GisMap {
    readonly id: string
    readonly olMap: OlMap
    /** true = 엔진이 만든 지도(createGisMap), false = 호스트 지도에 붙음(attachGisMap) */
    readonly owned: boolean
    readonly hostStore: ReadableStore<GisMapHost>
    readonly http: HttpClient
    readonly sources: Readonly<GisMapSources>
    readonly theme: Readonly<ResolvedGisMapTheme>
    /** 도구 전환(activeTool·반경 입력값) */
    readonly tools: ToolManager
    /** 그리기·선택·편집·삭제. 거리·면적·반경 측정은 tools.activate('measure-distance' | 'measure-area' | 'radius-search')로 쓴다 */
    readonly draw: DrawController
    /** 레이어 트리(소스 로드·체크·투명도·펼침·배경지도 모드) → OL 레이어 동기화 */
    readonly layers: LayerTreeController
    /** GeoTIFF 타일 오버레이(표시 상태 + 목록·업로드·폴링) */
    readonly raster: RasterOverlayController
    /** 나만의지도 GeoJSON 오버레이(표시 상태 + 목록·폴링) */
    readonly vector: VectorOverlayController
    /** 검색 결과 필지 강조(핀 + 필지 폴리곤) */
    readonly parcel: ParcelHighlighter
    /** 지도 중심 지역명(구독자가 있을 때만 조회) */
    readonly region: RegionWatcher

    /** owned=false면 아무것도 안 함(경고) */
    mount(target: HTMLElement | string): void
    unmount(): void
    /** 호스트 값 일부 교체. hostchange 발생 */
    setHost(patch: PartialGisMapHost): void
    flyTo(req: FlyToRequest): void
    /** EPSG:4326 범위로 맞춤. 기본 padding 60, maxZoom 18, duration 500 */
    fitLonLatExtent(extent: [number, number, number, number], opts?: { duration?: number; maxZoom?: number }): void
    /** 그리기·측정·반경·필지 강조·플러그인 clear() 정리. GeoTIFF/나만의지도/바람길은 유지 */
    clearAll(): void
    use<T extends GisMapPlugin>(plugin: T): T
    getPlugin<T extends GisMapPlugin>(name: string): T | null
    on<K extends keyof GisMapEvents>(type: K, fn: (e: GisMapEvents[K]) => void): () => void
    /**
     * owned=true: 추가한 것 해제 + olMap.setTarget(undefined)
     * owned=false: 엔진이 추가한 것만 해제. 호스트 지도는 그대로 둔다
     */
    destroy(): void
}

/** ol.Map 속성에 엔진 id를 적어 "한 지도 = 한 엔진"을 지킨다(모듈 전역 목록 없이) */
const ENGINE_KEY = 'gisMapEngineId'

function newEngineId(): string {
    return 'gm-' + Math.random().toString(36).slice(2, 10)
}

class GisMapEngine implements GisMap {
    readonly id: string
    readonly olMap: OlMap
    readonly owned: boolean
    readonly hostStore: ReadableStore<GisMapHost>
    readonly http: HttpClient
    readonly sources: Readonly<GisMapSources>
    readonly theme: Readonly<ResolvedGisMapTheme>
    readonly tools: ToolManager
    readonly draw: DrawController
    readonly layers: LayerTreeController
    readonly raster: RasterOverlayController
    readonly vector: VectorOverlayController
    readonly parcel: ParcelHighlighter
    readonly region: RegionWatcher

    /** FE-3·FE-4 컨트롤러가 쓸 설정값 */
    protected readonly zIndex: Readonly<GisMapZIndex>
    protected readonly options: GisMapAttachOptions
    protected readonly resources: MapResources

    private readonly hostState: WritableStore<GisMapHost>
    private readonly events: Emitter<GisMapEvents>
    private readonly plugins = new Map<string, GisMapPlugin>()
    private readonly toolManager: ToolManagerImpl
    private readonly drawController: DrawControllerImpl
    private readonly measureTools: ReadonlyArray<{ clear(): void }>
    private readonly layerController: LayerTreeControllerImpl
    private readonly rasterController: RasterOverlayControllerImpl
    private readonly vectorController: VectorOverlayControllerImpl
    private readonly parcelHighlighter: ParcelHighlighterImpl
    private readonly regionWatcher: RegionWatcherImpl
    private destroyed = false

    constructor(olMap: OlMap, owned: boolean, options: GisMapAttachOptions) {
        this.id = newEngineId()
        this.olMap = olMap
        this.owned = owned
        this.options = options
        this.hostState = createStore<GisMapHost>(mergeHost(DEFAULT_HOST, options.host))
        this.hostStore = this.hostState
        this.http = createHttpClient(() => this.hostState.getState())
        this.sources = resolveSources(options.sources, { host: () => this.hostState.getState(), http: this.http })
        this.theme = Object.freeze(resolveTheme(options.theme))
        this.zIndex = Object.freeze(resolveZIndex(options.zIndex))
        this.resources = new MapResources(olMap)
        this.events = createEmitter<GisMapEvents>()
        olMap.set(ENGINE_KEY, this.id, true)

        // 도구: 관리자 → 그리기(레이어 1개를 지금 붙임, interaction은 도구를 켤 때만) → 커서 안내
        this.toolManager = new ToolManagerImpl()
        this.tools = this.toolManager
        this.drawController = new DrawControllerImpl({
            olMap,
            resources: this.resources,
            tools: this.toolManager,
            zIndex: this.zIndex.tools,
            initialStyle: { ...DEFAULT_DRAW_STYLE, color: this.theme.primary },
            textInput: options.ui?.textInput,
        })
        this.draw = this.drawController
        // 측정: 거리 → 면적 → 반경 순으로 레이어를 붙인다(옛 훅 호출 순서). interaction은 도구를 켤 때만
        const measure = { olMap, resources: this.resources, tools: this.toolManager, zIndex: this.zIndex.tools }
        this.measureTools = [
            new DistanceTool({ ...measure, color: this.theme.measure.distance }),
            new AreaTool({ ...measure, color: this.theme.measure.area }),
            new RadiusTool({ ...measure, color: this.theme.measure.radius }),
        ]
        new ToolHintView(olMap, this.resources, this.toolManager.store, resolveToolHints(options.ui?.toolHints))

        // 레이어 트리: 트리가 도착하면 OL 레이어를 그때 붙인다(도구 레이어 뒤). layerTree 소스가 있으면 바로 로드
        this.layerController = new LayerTreeControllerImpl({
            resources: this.resources,
            hostStore: this.hostStore,
            http: this.http,
            source: this.sources.layerTree,
            wfs: this.sources.wfs,
            zIndex: this.zIndex.tree,
            resolveUrl: options.layers?.resolveUrl ?? defaultResolveLayerUrl,
            basemapModes: resolveBasemapModes(options.layers?.basemapModes),
            expandedStorage: options.layers?.expandedStorage,
        })
        this.layers = this.layerController
        if (options.layers?.autoLoad !== false && this.sources.layerTree) void this.layerController.load()

        // 오버레이·기능: 만들 때는 아무것도 붙이지 않는다(레이어는 표시할 때, 이동 리스너는 지역명 구독자가 생길 때)
        this.rasterController = new RasterOverlayControllerImpl({
            olMap, resources: this.resources, source: this.sources.geoTiff, zIndex: this.zIndex.raster,
        })
        this.raster = this.rasterController
        this.vectorController = new VectorOverlayControllerImpl({
            olMap, resources: this.resources, source: this.sources.myMap, zIndex: this.zIndex.vector,
            defaultColor: this.theme.primary,
        })
        this.vector = this.vectorController
        this.parcelHighlighter = new ParcelHighlighterImpl({
            olMap, resources: this.resources, source: this.sources.parcel, zIndex: this.zIndex.parcel, theme: this.theme,
        })
        this.parcel = this.parcelHighlighter
        this.regionWatcher = new RegionWatcherImpl({ olMap, source: this.sources.regionName })
        this.region = this.regionWatcher
    }

    mount(target: HTMLElement | string): void {
        if (this.destroyed) return
        if (!this.owned) {
            console.warn('[gis-map] 붙이기 모드에서는 mount()를 쓰지 않는다. 호스트 지도의 target을 그대로 쓴다')
            return
        }
        this.olMap.setTarget(target)
    }

    unmount(): void {
        if (this.destroyed) return
        if (!this.owned) {
            console.warn('[gis-map] 붙이기 모드에서는 unmount()를 쓰지 않는다')
            return
        }
        this.olMap.setTarget(undefined)
    }

    setHost(patch: PartialGisMapHost): void {
        if (this.destroyed) return
        this.hostState.setState(mergeHost(this.hostState.getState(), patch))
        this.events.emit('hostchange', this.hostState.getState())
    }

    flyTo(req: FlyToRequest): void {
        if (this.destroyed) return
        const view = this.olMap.getView()
        view.animate({
            center: fromLonLat([req.lon, req.lat], view.getProjection()),
            zoom: req.zoom ?? 16,
            duration: 600,
        })
    }

    fitLonLatExtent(extent: [number, number, number, number], opts?: { duration?: number; maxZoom?: number }): void {
        if (this.destroyed) return
        const view = this.olMap.getView()
        const projected = transformExtent(extent, 'EPSG:4326', view.getProjection())
        view.fit(projected, {
            padding: [60, 60, 60, 60],
            maxZoom: opts?.maxZoom ?? 18,
            duration: opts?.duration ?? 500,
        })
    }

    clearAll(): void {
        if (this.destroyed) return
        // 옛 순서 그대로: 도구 해제 → 각 기능 정리
        this.toolManager.deactivate()
        this.drawController.clear()
        this.measureTools.forEach(t => t.clear())
        this.plugins.forEach(p => {
            try {
                p.clear?.()
            } catch (err) {
                console.error('[gis-map] 플러그인 ' + p.name + ' clear() 중 오류', err)
            }
        })
        // 필지 강조(옛: 'clear' 구독자). GeoTIFF·나만의지도·바람길은 유지한다(옛 동작)
        this.parcelHighlighter.clear()
        this.events.emit('clear', undefined)
    }

    use<T extends GisMapPlugin>(plugin: T): T {
        if (this.destroyed) throw new Error('[gis-map] destroy()된 엔진에는 플러그인을 설치할 수 없다: ' + plugin.name)
        if (this.plugins.has(plugin.name)) {
            throw new Error('[gis-map] 같은 이름의 플러그인이 이미 설치됨: ' + plugin.name)
        }
        this.plugins.set(plugin.name, plugin)
        try {
            plugin.install(this)
        } catch (err) {
            this.plugins.delete(plugin.name)
            throw err
        }
        return plugin
    }

    getPlugin<T extends GisMapPlugin>(name: string): T | null {
        return (this.plugins.get(name) as T | undefined) ?? null
    }

    on<K extends keyof GisMapEvents>(type: K, fn: (e: GisMapEvents[K]) => void): () => void {
        return this.events.on(type, fn)
    }

    destroy(): void {
        if (this.destroyed) return
        this.events.emit('destroy', undefined)
        this.destroyed = true
        // 설치 역순으로 플러그인 정리
        Array.from(this.plugins.values()).reverse().forEach(p => {
            try {
                p.destroy()
            } catch (err) {
                console.error('[gis-map] 플러그인 ' + p.name + ' destroy() 중 오류', err)
            }
        })
        this.plugins.clear()
        // 도구는 전환 없이 끊고(핸들러·구독 해제), 붙인 interaction·레이어·DOM·리스너는 releaseAll이 한 번에 뗀다
        this.toolManager.destroy()
        this.layerController.destroy()
        this.regionWatcher.destroy()
        this.parcelHighlighter.destroy()
        this.vectorController.destroy()
        this.rasterController.destroy()
        this.resources.releaseAll()
        this.events.clear()
        this.hostState.destroy()
        if (this.olMap.get(ENGINE_KEY) === this.id) this.olMap.unset(ENGINE_KEY, true)
        if (this.owned) this.olMap.setTarget(undefined)
    }
}

/** 엔진이 ol.Map을 만든다(ol 포함 번들, GTProject). 기본 컨트롤(줌 버튼·저작권 표시)은 넣지 않는다 */
export function createGisMap(config: GisMapConfig = {}): GisMap {
    registerProjections(config.projections)
    const view = resolveView(config.view)
    const projection = getProjection(view.projection)
    if (!projection) {
        throw new Error('[gis-map] 뷰 좌표계 ' + view.projection + '가 등록되어 있지 않다. config.projections로 proj4 정의를 넘겨라')
    }
    const olMap = new OlMap({
        layers: [],
        controls: [],
        view: new View({
            projection,
            center: fromLonLat(view.center, projection),
            zoom: view.zoom,
            minZoom: view.minZoom,
            maxZoom: view.maxZoom,
            constrainResolution: true,
        }),
    })
    const { target, view: _view, ...options } = config
    void _view
    const engine = new GisMapEngine(olMap, true, options)
    if (target) engine.mount(target)
    return engine
}

/**
 * 이미 만든 ol.Map에 붙인다. 같은 지도에 두 번 붙이면 오류(한 지도 = 한 엔진).
 * ESM에서는 호스트와 엔진이 같은 ol 사본을 써야 한다(instanceof 확인).
 * 전역 ol 네임스페이스 검사(checkOlCompat)는 UMD attach 엔트리(src/standalone-attach.ts)가 이 함수를 부르기 전에 한다.
 */
export function attachGisMap(olMap: OlMap, options: GisMapAttachOptions = {}): GisMap {
    if (!(olMap instanceof OlMap)) {
        throw new Error('[gis-map] attachGisMap: ol.Map 인스턴스가 아니다. 호스트와 엔진이 서로 다른 ol 사본을 쓰고 있을 수 있다(ol 중복 설치·번들 설정 확인)')
    }
    if (olMap.get(ENGINE_KEY)) {
        throw new Error('[gis-map] 이 지도에는 이미 엔진이 붙어 있다(한 지도 = 한 엔진). 먼저 destroy()를 호출하라')
    }
    registerProjections(options.projections)
    assertLonLatTransform(olMap.getView().getProjection().getCode())
    return new GisMapEngine(olMap, false, options)
}

/**
 * 뷰 좌표계 ↔ 경위도(EPSG:4326) 변환이 있어야 한다(flyTo·측정·GeoJSON 입출력이 전부 이 변환을 쓴다).
 * OL은 변환이 없으면 오류 없이 좌표를 그대로 돌려주므로(identity) 조용히 엉뚱한 곳을 그리지 않게 여기서 막는다.
 */
function assertLonLatTransform(code: string): void {
    if (!hasLonLatTransform(code)) {
        throw new Error(
            '[gis-map] attachGisMap: 호스트 지도 뷰 좌표계 ' + code + '에서 EPSG:4326으로 바꾸는 변환이 등록돼 있지 않다. ' +
            'proj4 정의를 options.projections로 넘기거나(예: { "' + code + '": "+proj=…" }) 호스트가 ol.proj.proj4.register로 먼저 등록한다',
        )
    }
}
