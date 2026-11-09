// 나만의지도 GeoJSON 오버레이(지도 인스턴스마다 하나). 옛 hooks/map/useMyMapLayers.ts(모듈 전역 layerMap)와
// components/map/panel/MyMapPanel.tsx의 목록·폴링·삭제를 React 없이 옮겼다.
//   - 데이터는 MyMapSource.geojson(id)(EPSG:4326 FeatureCollection) → 뷰 좌표계로 읽어 VectorLayer
//   - 표시 상태(visibleIds)·로딩 중(loadingIds)·OL 레이어는 이 인스턴스의 필드 → 패널을 닫았다 열어도 체크 = 지도
//   - 3단계: 레이어마다 스타일(styleConfig v1) — 서버에 저장된 값(saved)과 대화상자가 보여 주는 미리보기(preview)를 따로 들고,
//     스타일만 바뀌면 GeoJSON을 다시 받지 않고 layer.setStyle만 한다. 라벨은 같은 VectorSource를 쓰는 별도 레이어(declutter·minZoom).
//     클릭 팝업은 MyMapPopup(코어 DOM). 스타일 설정이 없거나 깨졌으면 옛 고정 스타일(myMapStyle) 그대로
//   - 큰 레이어(10만 피처): GeoJSON → 피처 변환을 시간을 나눠 하고(runChunked, 취소 가능, 진행률 loadProgress),
//     화면 안 피처가 많으면 본 레이어는 그대로 두고 숨긴 채 격자 묶음 레이어(myMapCluster)를 덧붙인다(moveend마다 다시 판단, 누르면 확대)
import type OlMap from 'ol/Map'
import type Feature from 'ol/Feature'
import type Geometry from 'ol/geom/Geometry'
import type { Pixel } from 'ol/pixel'
import type { Extent } from 'ol/extent'
import type MapBrowserEvent from 'ol/MapBrowserEvent'
import { transformExtent } from 'ol/proj'
import VectorLayer from 'ol/layer/Vector'
import VectorSource from 'ol/source/Vector'
import GeoJSON from 'ol/format/GeoJSON'
import { Style, Fill, Stroke, Circle as CircleStyle } from 'ol/style'
import type { MyMapSource } from '../sources'
import { createStore } from '../store'
import type { ReadableStore, WritableStore } from '../store'
import type { MapResources } from '../tracker'
import type { ToolManager } from '../tools/ToolManager'
import type { MyMapColumnInfo, MyMapQuota, MyMapStyleConfig, MyMapUpdateInput, UserMapListItem, UserMapStatus } from '../types/mymap'
import { createLegacyMyMapStyle, createMyMapAnchors, createMyMapClusterStyle, createMyMapLabelStyle, createMyMapStyle } from '../lib/mymapStyle'
import type { MyMapAnchors } from '../lib/mymapStyle'
import {
    categoryCounts, defaultMyMapStyle, displayText, effectiveLabelMinZoom, makeClassColorFn, numericValues, parseMyMapStyle, popupFieldsFor,
    serializeMyMapStyle, summarizeColumns,
} from '../lib/mymapStyleConfig'
import { defaultNow, defaultYield, runChunked } from '../lib/runner'
import type { CategoryCounts } from '../lib/mymapStyleConfig'
import { CatalogBase } from './catalog'
import type { Catalog, CatalogState } from './catalog'
import { MyMapPopup } from './MyMapPopup'
import type { AppearanceSource } from '../types/appearance'
import type { MyMapPopupContent } from './MyMapPopup'
import {
    CLUSTER_OFF_RATIO, MyMapClusterView, emptyKindCounts, geomKindOf, isClusterable, resolveLoadChunkMs, resolveMyMapCluster, viewCountExceeds,
} from './myMapCluster'
import type { ClusterScale, GisMapMyMapConfig, KindCounts, ResolvedMyMapClusterConfig } from './myMapCluster'

export interface VectorOverlayState {
    /** 표시하기로 한 나만의지도 id(체크 상태). 불러오는 중인 것도 포함 */
    visibleIds: readonly number[]
    /** GeoJSON을 받는 중인 id(받기 + 피처 변환 단계) */
    loadingIds: readonly number[]
    /** 피처 변환 단계의 진행률(id → 0..1). 받는 동안(서버 응답을 기다리는 동안)에는 없다 */
    loadProgress: Readonly<Record<number, number>>
    /** 지금 묶음(원 + 숫자)으로 그리는 id. 이때 본 레이어(getOlLayer)는 숨겨져 있다 */
    clusteredIds: readonly number[]
}

export const EMPTY_VECTOR_OVERLAY_STATE: Readonly<VectorOverlayState> = Object.freeze({
    visibleIds: Object.freeze([]) as readonly number[],
    loadingIds: Object.freeze([]) as readonly number[],
    loadProgress: Object.freeze({}) as Readonly<Record<number, number>>,
    clusteredIds: Object.freeze([]) as readonly number[],
})

export interface MyMapCatalogState extends CatalogState<UserMapListItem> {
    /** 한도·적재 범위(source.quota가 있고 조회에 성공했을 때). 없으면 null — 화면은 한도 표시를 뺀다 */
    quota: MyMapQuota | null
}

/** 목록이 아직 없을 때(첫 렌더·SSR) 위젯이 쓰는 상태 — 옛 MyMapPanel 초기값(loading: true) */
export const EMPTY_MYMAP_CATALOG_STATE: Readonly<MyMapCatalogState> = Object.freeze({
    items: Object.freeze([]) as readonly UserMapListItem[],
    loading: true,
    error: null,
    quota: null,
})

export interface MyMapCatalog extends Catalog<UserMapListItem, MyMapCatalogState> {
    /**
     * 스타일을 서버에 저장한다(PATCH). 등록자만 — 공유받은 레이어면 서버를 부르지 않고 거절한다(서버도 403).
     * 성공하면 목록 항목과 지도 레이어에 반영한다. json이 null·''이면 서버 값을 지운다(= 기본 스타일).
     * 소스에 update가 없으면 거절. 실패하면 서버 message로 Error를 던진다(미리보기는 그대로 — 호출한 쪽이 되돌린다)
     */
    saveStyle(id: number, json: string | null): Promise<void>
}

export interface MyMapFeatureHit {
    layerId: number
    /** 속성(지오메트리 제외) */
    properties: Record<string, unknown>
}

export interface VectorOverlayController {
    readonly store: ReadableStore<VectorOverlayState>
    /**
     * 체크 상태를 바로 켜고 GeoJSON을 받아 지도에 올린다. 이미 올라가 있거나 받는 중이면 그 작업을 그대로 돌려준다(중복 요청 없음).
     * 받는 도중 hide()하면 결과를 버린다. 받기에 실패하면 체크 상태를 되돌린다.
     * color = 스타일 설정이 없을 때 쓰는 기본 색, styleConfig = 서버에 저장된 스타일(목록을 연 상태면 목록 값을 이미 알고 있다)
     */
    show(id: number, opts?: { color?: string; styleConfig?: string | null }): Promise<void>
    hide(id: number): void
    /** 지도에 없으면 먼저 show()하고, 피처 범위로 이동(padding 60, 500ms, maxZoom 18). 범위가 비었으면 이동하지 않는다 */
    zoomTo(id: number, opts?: { color?: string }): Promise<void>
    /** 체크 상태(받는 중 포함) */
    isVisible(id: number): boolean
    /**
     * 본 레이어. 묶음 모드(displayMode 'cluster')에서는 숨겨져 있다(getVisible() false) — 레이어 자체는 그대로고 소스·스타일도 그대로.
     * 호스트가 가시성을 읽어 쓰면 displayMode를 함께 본다
     */
    getOlLayer(id: number): VectorLayer<Feature<Geometry>> | null
    /** 지금 이 레이어를 어떻게 그리는가: 'shape' 원래 모양 / 'cluster' 묶음(원 + 숫자) / null 지도에 없음 */
    displayMode(id: number): 'shape' | 'cluster' | null
    /** 불러온 피처를 서버 응답 순서 그대로(속성 표 행 번호와 같다). 지도에 없으면 null. 호출한 쪽은 바꾸지 않는다 */
    featuresInOrder(id: number): readonly Feature<Geometry>[] | null
    /** 피처 범위(EPSG:4326 [minLon, minLat, maxLon, maxLat]). 모양이 없거나 좌표가 깨졌으면 null */
    featureLonLatExtent(feature: Feature<Geometry>): [number, number, number, number] | null
    /** 목록(openCatalog)에서 본 레이어 이름. 모르면 null — 출력 범례가 쓴다 */
    nameOf(id: number): string | null
    /** 목록 하나를 연다(패널 한 번 열림). autoLoad 기본 true. 엔진 destroy 때 열린 목록도 전부 dispose */
    openCatalog(opts?: { autoLoad?: boolean }): MyMapCatalog

    // ── 3단계: 스타일 ──
    /** 서버에 저장된(저장한) 스타일로 지정하고 바로 반영한다. null·''·못 읽는 값이면 옛 고정 스타일. 미리보기는 끝난다. GeoJSON을 다시 받지 않는다 */
    restyle(id: number, style: MyMapStyleConfig | string | null): void
    /** 저장하지 않고 바로 보여 준다(대화상자 미리보기). endPreview로 저장된 값으로 되돌린다 */
    previewStyle(id: number, style: MyMapStyleConfig): void
    endPreview(id: number): void
    /** 지금 지도에 그려지는 스타일(미리보기 중이면 미리보기, 없으면 기본값으로 채운 스타일) */
    getStyle(id: number): MyMapStyleConfig
    /** 저장된 스타일(설정이 없으면 null = 옛 고정 스타일) */
    getSavedStyle(id: number): MyMapStyleConfig | null
    /** 이 색 기준의 기본 스타일(옛 고정 스타일과 같은 모양). id를 주면 그 레이어의 기본 색 */
    defaultStyle(id?: number): MyMapStyleConfig
    /** 불러온 피처로 센 컬럼 요약. 레이어가 지도에 없으면 null */
    columns(id: number): MyMapColumnInfo[] | null
    /** 값별 개수(범주 색 나누기용). 레이어가 지도에 없으면 null */
    categories(id: number, field: string): CategoryCounts | null
    /** 숫자로 읽히는 값(오름차순, 구간 색 나누기용). 레이어가 지도에 없으면 null */
    numbers(id: number, field: string): number[] | null
    /** 불러온 피처 수(라벨 안전장치 계산용). 지도에 없으면 null */
    featureCount(id: number): number | null
    /** 이 픽셀의 나만의지도 피처(맨 위 것). 렌더 전이거나 없으면 null */
    featureAt(pixel: Pixel): MyMapFeatureHit | null
    /** 클릭 팝업을 켜고 끈다(기본 켬). 끄면 열려 있던 팝업도 닫는다 */
    setPopupEnabled(enabled: boolean): void
    closePopup(): void
}

export interface VectorOverlayControllerOptions {
    olMap: OlMap
    resources: MapResources
    source?: MyMapSource
    zIndex: number
    /** color를 안 넘겼을 때의 색(옛 DEFAULT_COLOR = 테마 primary 기본값 DEFAULT_THEME.primary와 같은 글자) */
    defaultColor: string
    /** 도구(그리기·측정 등)가 켜져 있으면 클릭 팝업을 띄우지 않는다. 없으면 항상 허용 */
    tools?: ToolManager
    /** 나눠 불러오기·묶음 설정(config.myMap). 없으면 기본값 */
    config?: GisMapMyMapConfig
    /** 목록에서 삭제했을 때(이 지도에서 숨긴 뒤) 엔진이 이벤트로 알리는 데 쓴다 */
    onRemoved?: (id: number) => void
    /** 클릭 팝업에 밝기 속성(data-gm-theme)을 달기 위한 통로(엔진이 넘김) */
    appearance?: AppearanceSource
}

/** 옛 styleFor 그대로: 채우기는 색 + 알파 '33', 선 2px, 점은 반지름 5 + 흰 테두리 */
export function myMapStyle(color: string): Style {
    return new Style({
        fill: new Fill({ color: `${color}33` }),
        stroke: new Stroke({ color, width: 2 }),
        image: new CircleStyle({ radius: 5, fill: new Fill({ color }), stroke: new Stroke({ color: '#fff', width: 1 }) }),
    })
}

/** 라벨 레이어가 본 레이어보다 위에 그려지도록 zIndex에 더하는 값 */
const LABEL_Z_OFFSET = 0.1
/** 묶음 레이어가 본 레이어보다 위·라벨 레이어보다 아래에 오도록 zIndex에 더하는 값 */
const CLUSTER_Z_OFFSET = 0.05
/** 묶음 레이어 className — OL은 className이 같은 레이어를 한 캔버스에 겹쳐 그린다. 패널 CSS(gm-*)와 겹치지 않도록 gm-hl- 접두사 */
const CLUSTER_CLASS_NAME = 'ol-layer gm-hl-mymap-cluster'
/** 피처 변환 중 VectorSource에 한 번에 넣는 개수(rbush 적재를 나눠 한 덩어리 멈춤을 없앤다) */
const SOURCE_BATCH = 1000
/** 묶음 원을 눌러 확대할 때 여백(px)·시간(ms) */
const CLUSTER_FIT_PADDING = 60
const CLUSTER_FIT_MS = 300
/** 팝업 값 최대 글자 수 */
const POPUP_VALUE_MAX = 200
/** 클릭 판정 여유(px) — 가는 선·작은 점도 잡히게 */
const HIT_TOLERANCE = 4

/** 상태 응답에서 목록 항목에 반영하는 선택 필드(응답에 있는 것만 — 옛 서버는 없다) */
const STATUS_EXTRA_KEYS = ['errorMessage', 'progressTotal', 'progressDone', 'matchedCount', 'failedCount', 'parcelVersion', 'geomType'] as const

/**
 * 상태 조회 결과를 목록 항목에 합친다. status·featureCount는 옛 코드 그대로, 진행률·매칭/실패 수·실패 이유는 응답에 있을 때만 덮는다.
 * 바뀐 값이 하나도 없으면 받은 항목 객체를 그대로 돌려준다(진행 중 폴링이 같은 값으로 화면을 다시 그리지 않게)
 */
export function mergeMyMapStatus(item: UserMapListItem, s: UserMapStatus): UserMapListItem {
    let next: UserMapListItem = item
    const set = (patch: Partial<UserMapListItem>) => {
        next = { ...next, ...patch }
    }
    if (item.status !== s.status) set({ status: s.status })
    if (item.featureCount !== s.featureCount) set({ featureCount: s.featureCount })
    for (const key of STATUS_EXTRA_KEYS) {
        const v = s[key]
        if (v !== undefined && item[key] !== v) set({ [key]: v })
    }
    return next
}

/** 컨트롤러가 카탈로그에 꽂는 훅 */
interface CatalogHooks {
    /** 목록이 바뀔 때마다(스타일·이름 기억) */
    onItems(items: readonly UserMapListItem[]): void
    /** 저장에 성공했을 때 */
    onStyleSaved(id: number, json: string | null): void
}

class MyMapCatalogImpl extends CatalogBase<UserMapListItem, UserMapStatus, MyMapCatalogState> implements MyMapCatalog {
    private quotaRequested = false
    private readonly quotaSource: MyMapSource | undefined
    private readonly hooks: CatalogHooks | undefined

    constructor(source: MyMapSource | undefined, onRemoved: (id: number) => void, onDisposed: () => void, hooks?: CatalogHooks) {
        super({ items: [], loading: true, error: null, quota: null }, {
            list: source ? () => source.list() : undefined,
            status: source ? id => source.status(id) : undefined,
            remove: source ? id => source.remove(id) : undefined,
            merge: mergeMyMapStatus,
            // 처리 중에도 진행률(progressDone/Total)을 목록에 반영한다
            mergeWhileProcessing: true,
            onRemoved,
            onDisposed,
        })
        this.quotaSource = source
        this.hooks = hooks
    }

    /** 목록이 바뀌면 컨트롤러에 알린다(스타일·이름 기억). 닫힌 목록은 알리지 않는다 */
    protected override patch(part: Partial<CatalogState<UserMapListItem>> | Partial<MyMapCatalogState>): void {
        super.patch(part)
        if (!this.disposed && 'items' in part && part.items) this.hooks?.onItems(part.items)
    }

    /** 목록을 받을 때 한도도 한 번 받는다(이 목록 객체 수명 동안 1번 — 업로드 뒤 load()에서는 다시 받지 않는다). 실패하면 한도 표시만 빠진다 */
    override async load(): Promise<void> {
        const source = this.quotaSource
        if (source?.quota && !this.quotaRequested && !this.disposed) {
            this.quotaRequested = true
            void (async () => {
                try {
                    const q = await source.quota?.()
                    if (q) this.patch({ quota: q })
                } catch {
                    // 한도 조회 실패는 조용히(옛 서버·권한 문제) — quota는 null 그대로
                }
            })()
        }
        await super.load()
    }

    async saveStyle(id: number, json: string | null): Promise<void> {
        const item = this.state.getState().items.find(i => i.id === id)
        if (item && !item.owner) throw new Error('등록한 사람만 스타일을 바꿀 수 있습니다.')
        const source = this.quotaSource
        if (!source || !source.update) throw new Error('이 서버에서는 스타일을 저장할 수 없습니다.')
        const value = json && json.trim() !== '' ? json : null
        const patch: MyMapUpdateInput = { styleConfig: value ?? '' }
        await source.update(id, patch)
        // 지도 레이어는 패널이 닫혀 이 목록이 없어져도 바꾼다
        this.hooks?.onStyleSaved(id, value)
        if (this.disposed) return
        this.setItems(this.state.getState().items.map(i => (i.id === id ? { ...i, styleConfig: value } : i)))
    }
}

interface LayerEntry {
    layer: VectorLayer<Feature<Geometry>>
    labelLayer: VectorLayer<Feature<Geometry>> | null
    baseColor: string
    featureCount: number
    geometryName: string
    anchors: MyMapAnchors
    columns: MyMapColumnInfo[] | null
    /** 서버 응답 순서 그대로의 피처(속성 표 행 번호·묶음 격자의 피처 번호) */
    features: Array<Feature<Geometry>>
    /** 점·면·그 밖 개수(묶을 수 있는 레이어인지 판단) */
    kinds: KindCounts
    /** 묶음 레이어(처음 묶을 때 만든다) */
    cluster: MyMapClusterView | null
    /** 지금 묶음으로 그리는가(본 레이어 숨김) */
    clustered: boolean
    /** 본 레이어를 지도에 올렸는가(show 도중에는 false — 그때 만든 라벨 레이어는 show가 함께 올린다) */
    mounted: boolean
}

export class VectorOverlayControllerImpl implements VectorOverlayController {
    readonly store: ReadableStore<VectorOverlayState>

    private readonly state: WritableStore<VectorOverlayState>
    private readonly opts: VectorOverlayControllerOptions
    private readonly entries = new Map<number, LayerEntry>()
    /** 받는 중인 작업과 그 표(token). hide()하면 지워져서 늦게 온 결과를 버린다 */
    private readonly pending = new Map<number, { token: object; task: Promise<void> }>()
    private readonly catalogs = new Set<MyMapCatalog>()
    /** 서버에 저장된 styleConfig 원문(목록·저장에서 받은 값). null = 설정 없음 */
    private readonly saved = new Map<number, string | null>()
    /** 대화상자 미리보기 */
    private readonly previews = new Map<number, MyMapStyleConfig>()
    /** 팝업 제목용 레이어 이름 */
    private readonly names = new Map<number, string>()
    private popup: MyMapPopup | null = null
    private popupEnabled = true
    private popupLayerId: number | null = null
    private destroyed = false
    /** 묶음 설정(null = 끔) · 피처 변환 한 번의 시간 */
    private readonly clusterCfg: ResolvedMyMapClusterConfig | null
    private readonly chunkMs: number
    /** moveend·singleclick 리스너 해제(엔진이 붙인 것은 엔진이 뗀다) */
    private unlisten: (() => void) | null = null

    constructor(opts: VectorOverlayControllerOptions) {
        this.opts = opts
        this.clusterCfg = resolveMyMapCluster(opts.config)
        this.chunkMs = resolveLoadChunkMs(opts.config)
        this.state = createStore<VectorOverlayState>({ visibleIds: [], loadingIds: [], loadProgress: {}, clusteredIds: [] })
        this.store = this.state
    }

    show(id: number, opts?: { color?: string; styleConfig?: string | null }): Promise<void> {
        if (this.destroyed || this.entries.has(id)) return Promise.resolve()
        const running = this.pending.get(id)
        if (running) return running.task
        const source = this.opts.source
        if (!source) return Promise.resolve()
        if (opts && opts.styleConfig !== undefined) this.saved.set(id, opts.styleConfig && opts.styleConfig.trim() !== '' ? opts.styleConfig : null)

        const s = this.state.getState()
        this.state.setState({
            visibleIds: s.visibleIds.includes(id) ? s.visibleIds : [...s.visibleIds, id],
            loadingIds: [...s.loadingIds, id],
        })
        // 소스가 동기로 throw해도 finally가 표를 찾을 수 있게, 작업을 시작하기 전에 자리를 잡아 둔다
        const token = {}
        const slot = { token, task: Promise.resolve() }
        this.pending.set(id, slot)
        const isCurrent = (): boolean => !this.destroyed && this.pending.get(id)?.token === token
        const task: Promise<void> = (async () => {
            let loaded = false
            try {
                const geojson = await source.geojson(id)
                if (!isCurrent()) return
                const read = await this.readLayer(geojson, () => !isCurrent(), fraction => this.setProgress(id, fraction))
                if (!read || !isCurrent()) return
                const { features } = read
                const layer = new VectorLayer<Feature<Geometry>>({
                    source: read.source,
                    zIndex: this.opts.zIndex,
                })
                const entry: LayerEntry = {
                    layer, labelLayer: null, baseColor: opts?.color ?? this.opts.defaultColor, featureCount: features.length,
                    geometryName: features.length > 0 ? features[0].getGeometryName() : 'geometry',
                    anchors: createMyMapAnchors(),
                    columns: null, features, kinds: read.kinds, cluster: null, clustered: false, mounted: false,
                }
                this.entries.set(id, entry)
                // 스타일을 먼저 정한 뒤 지도에 올린다(기본 파랑 스타일이 한 프레임 보이지 않게)
                this.apply(id)
                this.opts.resources.addLayer(layer)
                entry.mounted = true
                if (entry.labelLayer) this.opts.resources.addLayer(entry.labelLayer)
                this.ensurePopup()
                this.ensureMapListeners()
                loaded = true
                this.evaluateCluster(id)
            } catch {
                // 옛 코드: !res.ok면 조용히 끝(레이어 없음)
            } finally {
                if (isCurrent()) {
                    this.pending.delete(id)
                    const cur = this.state.getState()
                    this.state.setState({
                        loadingIds: cur.loadingIds.filter(x => x !== id),
                        loadProgress: withoutKey(cur.loadProgress, id),
                        // 받지 못했으면 체크도 되돌린다(체크 = 지도)
                        visibleIds: loaded ? cur.visibleIds : cur.visibleIds.filter(x => x !== id),
                    })
                }
            }
        })()
        slot.task = task
        return task
    }

    hide(id: number): void {
        if (this.destroyed) return
        this.pending.delete(id)
        this.previews.delete(id)
        const entry = this.entries.get(id)
        if (entry) {
            this.removeLayers(entry)
            this.entries.delete(id)
        }
        if (this.popupLayerId === id) this.popup?.close()
        const s = this.state.getState()
        if (s.visibleIds.includes(id) || s.loadingIds.includes(id)) {
            this.state.setState({
                visibleIds: s.visibleIds.filter(x => x !== id),
                loadingIds: s.loadingIds.filter(x => x !== id),
                loadProgress: withoutKey(s.loadProgress, id),
            })
        }
        this.syncClusteredIds()
    }

    async zoomTo(id: number, opts?: { color?: string }): Promise<void> {
        if (this.destroyed) return
        // 레이어가 아직 지도에 없으면(체크 안 된 상태) 먼저 불러온 뒤, 피처 범위로 지도를 이동한다
        if (!this.entries.has(id)) await this.show(id, opts)
        if (this.destroyed) return
        const layer = this.entries.get(id)?.layer
        const extent = layer?.getSource()?.getExtent()
        if (!extent || extent.some(v => !Number.isFinite(v))) return
        this.opts.olMap.getView().fit(extent, { padding: [60, 60, 60, 60], duration: 500, maxZoom: 18 })
    }

    isVisible(id: number): boolean {
        return this.state.getState().visibleIds.includes(id)
    }

    getOlLayer(id: number): VectorLayer<Feature<Geometry>> | null {
        return this.entries.get(id)?.layer ?? null
    }

    displayMode(id: number): 'shape' | 'cluster' | null {
        const e = this.entries.get(id)
        return e ? (e.clustered ? 'cluster' : 'shape') : null
    }

    featuresInOrder(id: number): readonly Feature<Geometry>[] | null {
        return this.entries.get(id)?.features ?? null
    }

    featureLonLatExtent(feature: Feature<Geometry>): [number, number, number, number] | null {
        const g = feature.getGeometry()
        if (!g) return null
        const e = g.getExtent()
        if (e.some(v => !Number.isFinite(v))) return null
        const ll = transformExtent(e, this.opts.olMap.getView().getProjection(), 'EPSG:4326')
        if (ll.some(v => !Number.isFinite(v))) return null
        return [ll[0], ll[1], ll[2], ll[3]]
    }

    nameOf(id: number): string | null {
        return this.names.get(id) ?? null
    }

    // ── 스타일 ──────────────────────────────────────────────────────────────

    restyle(id: number, style: MyMapStyleConfig | string | null): void {
        if (this.destroyed) return
        const raw = style === null ? null : typeof style === 'string' ? style : serializeMyMapStyle(style)
        this.saved.set(id, raw && raw.trim() !== '' ? raw : null)
        this.previews.delete(id)
        this.apply(id)
    }

    previewStyle(id: number, style: MyMapStyleConfig): void {
        if (this.destroyed) return
        this.previews.set(id, style)
        this.apply(id)
    }

    endPreview(id: number): void {
        if (this.destroyed) return
        if (this.previews.delete(id)) this.apply(id)
    }

    getStyle(id: number): MyMapStyleConfig {
        return this.previews.get(id) ?? this.getSavedStyle(id) ?? this.defaultStyle(id)
    }

    getSavedStyle(id: number): MyMapStyleConfig | null {
        return parseMyMapStyle(this.saved.get(id) ?? null, this.baseColorOf(id))
    }

    defaultStyle(id?: number): MyMapStyleConfig {
        return defaultMyMapStyle(id === undefined ? this.opts.defaultColor : this.baseColorOf(id))
    }

    columns(id: number): MyMapColumnInfo[] | null {
        const e = this.entries.get(id)
        if (!e) return null
        if (!e.columns) e.columns = summarizeColumns(this.featuresOf(e), [e.geometryName])
        return e.columns
    }

    categories(id: number, field: string): CategoryCounts | null {
        const e = this.entries.get(id)
        return e ? categoryCounts(this.featuresOf(e), field) : null
    }

    numbers(id: number, field: string): number[] | null {
        const e = this.entries.get(id)
        return e ? numericValues(this.featuresOf(e), field) : null
    }

    featureCount(id: number): number | null {
        return this.entries.get(id)?.featureCount ?? null
    }

    featureAt(pixel: Pixel): MyMapFeatureHit | null {
        const hit = this.pick(pixel)
        if (!hit) return null
        return { layerId: hit.id, properties: this.propertiesOf(hit.feature, hit.id) }
    }

    setPopupEnabled(enabled: boolean): void {
        this.popupEnabled = enabled
        this.popup?.setEnabled(enabled)
    }

    closePopup(): void {
        this.popup?.close()
    }

    private baseColorOf(id: number): string {
        return this.entries.get(id)?.baseColor ?? this.opts.defaultColor
    }

    private featuresOf(e: LayerEntry): Array<Feature<Geometry>> {
        return e.layer.getSource()?.getFeatures() ?? []
    }

    private propertiesOf(feature: Feature<Geometry>, id: number): Record<string, unknown> {
        const geometryName = this.entries.get(id)?.geometryName ?? feature.getGeometryName()
        const out: Record<string, unknown> = {}
        for (const key of feature.getKeys()) if (key !== geometryName) out[key] = feature.get(key)
        return out
    }

    /** 저장값·미리보기를 합쳐 지도 레이어(본 레이어·라벨 레이어·묶음 레이어)에 반영한다. 지도에 없는 id면 아무것도 안 한다 */
    private apply(id: number): void {
        const e = this.entries.get(id)
        if (!e) return
        const cfg = this.effectiveStyle(id, e)
        this.applyBase(e, cfg)
        e.cluster?.setStyle(createMyMapClusterStyle(cfg, e.baseColor))
        if (e.labelLayer) e.labelLayer.setVisible(!e.clustered)
        // 스타일이 바뀌면 묶음 대상(점으로 표시 여부)·묶음 색이 달라질 수 있다
        this.evaluateCluster(id)
    }

    /** 미리보기 > 저장값. null = 설정 없음(옛 고정 스타일) */
    private effectiveStyle(id: number, e: LayerEntry): MyMapStyleConfig | null {
        return this.previews.get(id) ?? parseMyMapStyle(this.saved.get(id) ?? null, e.baseColor)
    }

    private applyBase(e: LayerEntry, cfg: MyMapStyleConfig | null): void {
        if (!cfg) {
            // 설정이 없거나 못 읽는다 → 옛 고정 스타일 그대로
            e.layer.setStyle(createLegacyMyMapStyle(myMapStyle(e.baseColor), e.baseColor, e.anchors))
            this.dropLabelLayer(e)
            return
        }
        e.layer.setStyle(createMyMapStyle(cfg, e.anchors))
        const labelStyle = createMyMapLabelStyle(cfg, e.anchors)
        if (!labelStyle || !cfg.label) {
            this.dropLabelLayer(e)
            return
        }
        const minZoom = effectiveLabelMinZoom(cfg.label.minZoom, e.featureCount)
        // OL의 minZoom은 "이 값 초과에서만 보임"(exclusive)이라 같은 줌에서도 보이도록 조금 낮춘다
        const olMinZoom = minZoom > 0 ? minZoom - 1e-6 : Number.NEGATIVE_INFINITY
        if (!e.labelLayer) {
            const source = e.layer.getSource()
            if (!source) return
            const labelLayer = new VectorLayer<Feature<Geometry>>({
                source,
                zIndex: this.opts.zIndex + LABEL_Z_OFFSET,
                declutter: true,
                minZoom: olMinZoom,
                style: labelStyle,
            })
            e.labelLayer = labelLayer
            // 아직 본 레이어를 지도에 올리기 전(show 도중)이면 show가 함께 올린다
            if (e.mounted) this.opts.resources.addLayer(labelLayer)
        } else {
            e.labelLayer.setMinZoom(olMinZoom)
            e.labelLayer.setStyle(labelStyle)
        }
    }

    private dropLabelLayer(e: LayerEntry): void {
        if (!e.labelLayer) return
        this.opts.resources.removeLayer(e.labelLayer)
        e.labelLayer = null
    }

    private removeLayers(e: LayerEntry): void {
        this.dropLabelLayer(e)
        if (e.cluster) {
            this.opts.resources.removeLayer(e.cluster.layer)
            e.cluster.dispose()
            e.cluster = null
        }
        e.clustered = false
        this.opts.resources.removeLayer(e.layer)
    }

    // ── 나눠 불러오기 ───────────────────────────────────────────────────────

    /**
     * GeoJSON → 피처. FeatureCollection이면 피처 하나씩 변환하며 chunkMs마다 화면에 양보하고(취소되면 null), VectorSource에도 SOURCE_BATCH개씩 나눠 넣는다.
     * 그 밖의 모양(단일 Feature·지오메트리)은 한 번에 읽는다. 결과 순서 = 서버 응답 순서
     */
    private async readLayer(
        geojson: unknown, isCancelled: () => boolean, onProgress: (fraction: number) => void,
    ): Promise<{ features: Array<Feature<Geometry>>; source: VectorSource<Feature<Geometry>>; kinds: KindCounts } | null> {
        const format = new GeoJSON()
        const readOpts = { dataProjection: 'EPSG:4326', featureProjection: this.opts.olMap.getView().getProjection() }
        const kinds = emptyKindCounts()
        const tally = (f: Feature<Geometry>): void => {
            const k = geomKindOf(f.getGeometry())
            if (k) kinds[k]++
        }
        const fc = geojson as { type?: unknown; features?: unknown } | null
        if (!fc || fc.type !== 'FeatureCollection' || !Array.isArray(fc.features)) {
            const features = format.readFeatures(geojson as never, readOpts) as Array<Feature<Geometry>>
            features.forEach(tally)
            return { features, source: new VectorSource<Feature<Geometry>>({ features }), kinds }
        }
        const list = fc.features as unknown[]
        const features = new Array<Feature<Geometry>>(list.length)
        const source = new VectorSource<Feature<Geometry>>()
        let batch: Array<Feature<Geometry>> = []
        const done = await runChunked(list.length, i => {
            const f = format.readFeature(list[i] as never, readOpts) as Feature<Geometry>
            features[i] = f
            tally(f)
            batch.push(f)
            if (batch.length >= SOURCE_BATCH) {
                source.addFeatures(batch)
                batch = []
            }
        }, {
            budgetMs: this.chunkMs, now: defaultNow, yieldToUi: defaultYield, isCancelled,
            onProgress: (d, t) => onProgress(t > 0 ? d / t : 1),
        })
        if (!done) return null
        if (batch.length > 0) source.addFeatures(batch)
        return { features, source, kinds }
    }

    /** 변환 진행률(0..1). 받는 중이 아니거나 같은 퍼센트면 상태를 바꾸지 않는다(패널 다시 그리기 최소) */
    private setProgress(id: number, fraction: number): void {
        const cur = this.state.getState()
        if (this.destroyed || !cur.loadingIds.includes(id)) return
        const prev = cur.loadProgress[id]
        if (prev !== undefined && Math.floor(prev * 100) === Math.floor(fraction * 100)) return
        this.state.setState({ loadProgress: { ...cur.loadProgress, [id]: fraction } })
    }

    // ── 묶음 ────────────────────────────────────────────────────────────────

    /** 이동·확대가 끝날 때마다 묶음 여부를 다시 판단하고, 묶음 원을 누르면 확대한다(묶음을 끈 설정이면 붙이지 않는다) */
    private ensureMapListeners(): void {
        if (this.unlisten || this.destroyed || !this.clusterCfg) return
        const olMap = this.opts.olMap
        olMap.on('moveend', this.onMoveEnd)
        olMap.on('singleclick', this.onSingleClick)
        this.unlisten = this.opts.resources.onDispose(() => {
            olMap.un('moveend', this.onMoveEnd)
            olMap.un('singleclick', this.onSingleClick)
        })
    }

    private readonly onMoveEnd = (): void => {
        if (this.destroyed) return
        Array.from(this.entries.keys()).forEach(id => this.evaluateCluster(id))
    }

    private readonly onSingleClick = (ev: MapBrowserEvent<UIEvent>): void => {
        const cfg = this.clusterCfg
        if (this.destroyed || !cfg) return
        const t = this.opts.tools
        if (t && t.store.getState().activeTool !== 'none') return
        const layers = new Set<unknown>()
        this.entries.forEach(e => {
            if (e.clustered && e.cluster) layers.add(e.cluster.layer)
        })
        if (layers.size === 0) return
        let target: Extent | null = null
        this.opts.olMap.forEachFeatureAtPixel(
            ev.pixel,
            feature => {
                const count = feature.get('count') as number
                const ext = feature.get('extent') as Extent | undefined
                if (!(count > 1) || !ext) return undefined
                target = ext
                return true
            },
            { layerFilter: l => layers.has(l), hitTolerance: HIT_TOLERANCE },
        )
        if (!target) return
        this.popup?.close()
        const pad = CLUSTER_FIT_PADDING
        this.opts.olMap.getView().fit(target, { padding: [pad, pad, pad, pad], duration: CLUSTER_FIT_MS, maxZoom: cfg.maxZoom })
    }

    /** 줌을 정수 단계로 맞춘 격자 키·해상도(줌을 모르는 뷰는 해상도를 2의 거듭제곱으로) */
    private scaleOf(): ClusterScale {
        const view = this.opts.olMap.getView()
        const zoom = view.getZoom()
        if (zoom !== undefined && Number.isFinite(zoom)) {
            const z = Math.round(zoom)
            return { key: z, resolution: view.getResolutionForZoom(z) }
        }
        const k = Math.round(Math.log2(view.getResolution() ?? 1))
        return { key: 1000 + k, resolution: Math.pow(2, k) }
    }

    /**
     * 이 레이어를 묶음으로 그릴지 판단하고 반영한다(moveend·스타일 변경·불러오기 끝에서).
     * 묶음 대상: 피처 수 > minFeatures, 선이 없음, 줌 < maxZoom, 화면 안 점(또는 점으로 표시 중인 면) > pointViewLimit 또는 면 > areaViewLimit.
     * 켜져 있을 때는 기준의 80%까지 유지한다(깜빡임 방지). 화면 크기를 모르면 지금 상태를 유지한다
     */
    private evaluateCluster(id: number): void {
        const cfg = this.clusterCfg
        const e = this.entries.get(id)
        if (!cfg || !e || !e.mounted || this.destroyed) return
        const olMap = this.opts.olMap
        const view = olMap.getView()
        const style = this.effectiveStyle(id, e)
        const areaAsPoint = style?.display === 'point'
        const zoom = view.getZoom()
        const size = olMap.getSize()
        const extent = size && size[0] > 0 && size[1] > 0 ? view.calculateExtent(size) : null
        const source = e.layer.getSource()
        let want = false
        if (!source || e.featureCount <= cfg.minFeatures || !isClusterable(e.kinds, cfg, areaAsPoint)) want = false
        else if (zoom !== undefined && zoom >= cfg.maxZoom - 1e-6) want = false
        else if (!extent) want = e.clustered
        else want = viewCountExceeds(source, extent, cfg, areaAsPoint, e.clustered ? CLUSTER_OFF_RATIO : 1)
        if (want && extent) {
            if (!e.cluster) {
                e.cluster = new MyMapClusterView({
                    features: e.features, cfg, zIndex: this.opts.zIndex + CLUSTER_Z_OFFSET, className: CLUSTER_CLASS_NAME,
                    style: createMyMapClusterStyle(style, e.baseColor),
                })
                this.opts.resources.addLayer(e.cluster.layer)
            }
            const classify = style?.classify ?? null
            const colorOf = classify ? colorFnOf(classify) : null
            e.cluster.update(extent, this.scaleOf(), colorOf)
        }
        this.setClustered(id, e, want)
    }

    private setClustered(id: number, e: LayerEntry, on: boolean): void {
        if (e.clustered === on) return
        e.clustered = on
        e.layer.setVisible(!on)
        e.labelLayer?.setVisible(!on)
        if (e.cluster) {
            e.cluster.layer.setVisible(on)
            if (!on) e.cluster.clear()
        }
        // 팝업이 떠 있던 피처는 이제 화면에 없다
        if (on && this.popupLayerId === id) this.popup?.close()
        this.syncClusteredIds()
    }

    private syncClusteredIds(): void {
        const ids: number[] = []
        this.entries.forEach((e, id) => {
            if (e.clustered) ids.push(id)
        })
        const cur = this.state.getState().clusteredIds
        if (cur.length === ids.length && cur.every((v, i) => v === ids[i])) return
        this.state.setState({ clusteredIds: ids })
    }

    // ── 클릭 팝업 ───────────────────────────────────────────────────────────

    private ensurePopup(): void {
        if (this.popup || this.destroyed) return
        this.popup = new MyMapPopup(this.opts.olMap, this.opts.resources, {
            pick: pixel => this.popupContentAt(pixel),
            toolActive: () => {
                const t = this.opts.tools
                return !!t && t.store.getState().activeTool !== 'none'
            },
        }, this.opts.appearance)
        this.popup.setEnabled(this.popupEnabled)
    }

    private pick(pixel: Pixel): { id: number; feature: Feature<Geometry> } | null {
        const byLayer = new Map<unknown, number>()
        const clusterLayers = new Set<unknown>()
        this.entries.forEach((e, id) => {
            byLayer.set(e.layer, id)
            if (e.cluster) {
                byLayer.set(e.cluster.layer, id)
                clusterLayers.add(e.cluster.layer)
            }
        })
        let found: { id: number; feature: Feature<Geometry> } | null = null
        this.opts.olMap.forEachFeatureAtPixel(
            pixel,
            (feature, layer) => {
                const id = layer ? byLayer.get(layer) : undefined
                if (id === undefined) return undefined
                if (layer && clusterLayers.has(layer)) {
                    // 묶음 원: 둘 이상이면 팝업 대신 확대(onSingleClick), 하나뿐인 칸은 그 피처 자체
                    const orig = feature.get('orig') as Feature<Geometry> | undefined
                    if (feature.get('count') !== 1 || !orig) return undefined
                    found = { id, feature: orig }
                    return true
                }
                found = { id, feature: feature as Feature<Geometry> }
                return true
            },
            { layerFilter: l => byLayer.has(l), hitTolerance: HIT_TOLERANCE },
        )
        return found
    }

    private popupContentAt(pixel: Pixel): MyMapPopupContent | null {
        const hit = this.pick(pixel)
        if (!hit) {
            this.popupLayerId = null
            return null
        }
        const props = this.propertiesOf(hit.feature, hit.id)
        const popup = this.getStyle(hit.id).popup
        const fields = popupFieldsFor(popup, Object.keys(props))
        // 팝업을 끈 레이어(빈 배열)면 아무것도 열지 않는다
        if (fields.length === 0) {
            this.popupLayerId = null
            return null
        }
        this.popupLayerId = hit.id
        return {
            title: this.names.get(hit.id) ?? '나만의지도',
            rows: fields.map(name => ({ name, value: displayText(props[name], POPUP_VALUE_MAX) || '-' })),
        }
    }

    // ── 목록 ────────────────────────────────────────────────────────────────

    /** 목록이 바뀔 때: 이름과 서버의 스타일 설정을 기억하고, 바뀐 것만 지도에 다시 반영한다(미리보기 중인 레이어는 건드리지 않는다) */
    private registerItems(items: readonly UserMapListItem[]): void {
        if (this.destroyed) return
        for (const it of items) {
            this.names.set(it.id, it.name)
            const raw = it.styleConfig && it.styleConfig.trim() !== '' ? it.styleConfig : null
            if (this.saved.has(it.id) && this.saved.get(it.id) === raw) continue
            this.saved.set(it.id, raw)
            if (!this.previews.has(it.id)) this.apply(it.id)
        }
    }

    private forget(id: number): void {
        this.hide(id)
        this.saved.delete(id)
        this.names.delete(id)
        this.previews.delete(id)
        if (!this.destroyed) this.opts.onRemoved?.(id)
    }

    openCatalog(opts?: { autoLoad?: boolean }): MyMapCatalog {
        const catalog: MyMapCatalog = new MyMapCatalogImpl(
            this.destroyed ? undefined : this.opts.source,
            id => this.forget(id),
            () => {
                this.catalogs.delete(catalog)
            },
            {
                onItems: items => this.registerItems(items),
                onStyleSaved: (id, json) => this.restyle(id, json),
            },
        )
        if (this.destroyed) {
            catalog.dispose()
            return catalog
        }
        this.catalogs.add(catalog)
        if (opts?.autoLoad !== false) void catalog.load()
        return catalog
    }

    /** 엔진 destroy용: 열린 목록(폴링 타이머) 정리, 받는 중인 결과 버림, 팝업·OL 레이어 떼기 */
    destroy(): void {
        if (this.destroyed) return
        this.destroyed = true
        this.unlisten?.()
        this.unlisten = null
        Array.from(this.catalogs).forEach(c => c.dispose())
        this.catalogs.clear()
        this.pending.clear()
        this.popup?.destroy()
        this.popup = null
        this.entries.forEach(e => this.removeLayers(e))
        this.entries.clear()
        this.saved.clear()
        this.previews.clear()
        this.names.clear()
        this.state.destroy()
    }
}

/** id 키를 뺀 새 객체(없으면 같은 객체 — 상태가 안 바뀌게) */
function withoutKey(rec: Readonly<Record<number, number>>, id: number): Readonly<Record<number, number>> {
    if (!(id in rec)) return rec
    const next: Record<number, number> = { ...rec }
    delete next[id]
    return next
}

/** 범주·구간 스타일의 값 → 색(묶음의 대표 색 계산용) */
function colorFnOf(classify: NonNullable<MyMapStyleConfig['classify']>): (f: Feature<Geometry>) => string {
    const colorOfValue = makeClassColorFn(classify)
    const field = classify.field
    return f => colorOfValue(f.get(field))
}
