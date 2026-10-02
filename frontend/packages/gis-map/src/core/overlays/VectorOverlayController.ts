// 나만의지도 GeoJSON 오버레이(지도 인스턴스마다 하나). 옛 hooks/map/useMyMapLayers.ts(모듈 전역 layerMap)와
// components/map/panel/MyMapPanel.tsx의 목록·폴링·삭제를 React 없이 옮겼다.
//   - 데이터는 MyMapSource.geojson(id)(EPSG:4326 FeatureCollection) → 뷰 좌표계로 읽어 VectorLayer
//   - 표시 상태(visibleIds)·로딩 중(loadingIds)·OL 레이어는 이 인스턴스의 필드 → 패널을 닫았다 열어도 체크 = 지도
import type OlMap from 'ol/Map'
import type Feature from 'ol/Feature'
import type Geometry from 'ol/geom/Geometry'
import VectorLayer from 'ol/layer/Vector'
import VectorSource from 'ol/source/Vector'
import GeoJSON from 'ol/format/GeoJSON'
import { Style, Fill, Stroke, Circle as CircleStyle } from 'ol/style'
import type { MyMapSource } from '../sources'
import { createStore } from '../store'
import type { ReadableStore, WritableStore } from '../store'
import type { MapResources } from '../tracker'
import type { UserMapListItem, UserMapStatus } from '../types/mymap'
import { CatalogBase } from './catalog'
import type { Catalog, CatalogState } from './catalog'

export interface VectorOverlayState {
    /** 표시하기로 한 나만의지도 id(체크 상태). 불러오는 중인 것도 포함 */
    visibleIds: readonly number[]
    /** GeoJSON을 받는 중인 id */
    loadingIds: readonly number[]
}

export const EMPTY_VECTOR_OVERLAY_STATE: Readonly<VectorOverlayState> = Object.freeze({
    visibleIds: Object.freeze([]) as readonly number[],
    loadingIds: Object.freeze([]) as readonly number[],
})

export type MyMapCatalogState = CatalogState<UserMapListItem>

/** 목록이 아직 없을 때(첫 렌더·SSR) 위젯이 쓰는 상태 — 옛 MyMapPanel 초기값(loading: true) */
export const EMPTY_MYMAP_CATALOG_STATE: Readonly<MyMapCatalogState> = Object.freeze({
    items: Object.freeze([]) as readonly UserMapListItem[],
    loading: true,
    error: null,
})

export type MyMapCatalog = Catalog<UserMapListItem, MyMapCatalogState>

export interface VectorOverlayController {
    readonly store: ReadableStore<VectorOverlayState>
    /**
     * 체크 상태를 바로 켜고 GeoJSON을 받아 지도에 올린다. 이미 올라가 있거나 받는 중이면 그 작업을 그대로 돌려준다(중복 요청 없음).
     * 받는 도중 hide()하면 결과를 버린다. 받기에 실패하면 체크 상태를 되돌린다
     */
    show(id: number, opts?: { color?: string }): Promise<void>
    hide(id: number): void
    /** 지도에 없으면 먼저 show()하고, 피처 범위로 이동(padding 60, 500ms, maxZoom 18). 범위가 비었으면 이동하지 않는다 */
    zoomTo(id: number, opts?: { color?: string }): Promise<void>
    /** 체크 상태(받는 중 포함) */
    isVisible(id: number): boolean
    getOlLayer(id: number): VectorLayer<Feature<Geometry>> | null
    /** 목록 하나를 연다(패널 한 번 열림). autoLoad 기본 true. 엔진 destroy 때 열린 목록도 전부 dispose */
    openCatalog(opts?: { autoLoad?: boolean }): MyMapCatalog
}

export interface VectorOverlayControllerOptions {
    olMap: OlMap
    resources: MapResources
    source?: MyMapSource
    zIndex: number
    /** color를 안 넘겼을 때의 색(옛 DEFAULT_COLOR = 테마 primary 기본값 DEFAULT_THEME.primary와 같은 글자) */
    defaultColor: string
}

/** 옛 styleFor 그대로: 채우기는 색 + 알파 '33', 선 2px, 점은 반지름 5 + 흰 테두리 */
export function myMapStyle(color: string): Style {
    return new Style({
        fill: new Fill({ color: `${color}33` }),
        stroke: new Stroke({ color, width: 2 }),
        image: new CircleStyle({ radius: 5, fill: new Fill({ color }), stroke: new Stroke({ color: '#fff', width: 1 }) }),
    })
}

class MyMapCatalogImpl extends CatalogBase<UserMapListItem, UserMapStatus, MyMapCatalogState> implements MyMapCatalog {
    constructor(source: MyMapSource | undefined, onRemoved: (id: number) => void, onDisposed: () => void) {
        super({ items: [], loading: true, error: null }, {
            list: source ? () => source.list() : undefined,
            status: source ? id => source.status(id) : undefined,
            remove: source ? id => source.remove(id) : undefined,
            // 옛 코드: status와 featureCount만 바꾼다
            merge: (i, s) => ({ ...i, status: s.status, featureCount: s.featureCount }),
            onRemoved,
            onDisposed,
        })
    }
}

export class VectorOverlayControllerImpl implements VectorOverlayController {
    readonly store: ReadableStore<VectorOverlayState>

    private readonly state: WritableStore<VectorOverlayState>
    private readonly opts: VectorOverlayControllerOptions
    private readonly layers = new Map<number, VectorLayer<Feature<Geometry>>>()
    /** 받는 중인 작업과 그 표(token). hide()하면 지워져서 늦게 온 결과를 버린다 */
    private readonly pending = new Map<number, { token: object; task: Promise<void> }>()
    private readonly catalogs = new Set<MyMapCatalog>()
    private destroyed = false

    constructor(opts: VectorOverlayControllerOptions) {
        this.opts = opts
        this.state = createStore<VectorOverlayState>({ visibleIds: [], loadingIds: [] })
        this.store = this.state
    }

    show(id: number, opts?: { color?: string }): Promise<void> {
        if (this.destroyed || this.layers.has(id)) return Promise.resolve()
        const running = this.pending.get(id)
        if (running) return running.task
        const source = this.opts.source
        if (!source) return Promise.resolve()

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
                const features = new GeoJSON().readFeatures(geojson, {
                    dataProjection: 'EPSG:4326',
                    featureProjection: this.opts.olMap.getView().getProjection(),
                })
                const layer = new VectorLayer<Feature<Geometry>>({
                    source: new VectorSource({ features }),
                    zIndex: this.opts.zIndex,
                    style: myMapStyle(opts?.color ?? this.opts.defaultColor),
                })
                this.opts.resources.addLayer(layer)
                this.layers.set(id, layer)
                loaded = true
            } catch {
                // 옛 코드: !res.ok면 조용히 끝(레이어 없음)
            } finally {
                if (isCurrent()) {
                    this.pending.delete(id)
                    const cur = this.state.getState()
                    this.state.setState({
                        loadingIds: cur.loadingIds.filter(x => x !== id),
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
        const layer = this.layers.get(id)
        if (layer) {
            this.opts.resources.removeLayer(layer)
            this.layers.delete(id)
        }
        const s = this.state.getState()
        if (s.visibleIds.includes(id) || s.loadingIds.includes(id)) {
            this.state.setState({
                visibleIds: s.visibleIds.filter(x => x !== id),
                loadingIds: s.loadingIds.filter(x => x !== id),
            })
        }
    }

    async zoomTo(id: number, opts?: { color?: string }): Promise<void> {
        if (this.destroyed) return
        // 레이어가 아직 지도에 없으면(체크 안 된 상태) 먼저 불러온 뒤, 피처 범위로 지도를 이동한다
        if (!this.layers.has(id)) await this.show(id, opts)
        if (this.destroyed) return
        const layer = this.layers.get(id)
        const extent = layer?.getSource()?.getExtent()
        if (!extent || extent.some(v => !Number.isFinite(v))) return
        this.opts.olMap.getView().fit(extent, { padding: [60, 60, 60, 60], duration: 500, maxZoom: 18 })
    }

    isVisible(id: number): boolean {
        return this.state.getState().visibleIds.includes(id)
    }

    getOlLayer(id: number): VectorLayer<Feature<Geometry>> | null {
        return this.layers.get(id) ?? null
    }

    openCatalog(opts?: { autoLoad?: boolean }): MyMapCatalog {
        const catalog: MyMapCatalog = new MyMapCatalogImpl(
            this.destroyed ? undefined : this.opts.source,
            id => this.hide(id),
            () => {
                this.catalogs.delete(catalog)
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

    /** 엔진 destroy용: 열린 목록(폴링 타이머) 정리, 받는 중인 결과 버림, OL 레이어 떼기 */
    destroy(): void {
        if (this.destroyed) return
        this.destroyed = true
        Array.from(this.catalogs).forEach(c => c.dispose())
        this.catalogs.clear()
        this.pending.clear()
        this.layers.forEach(l => this.opts.resources.removeLayer(l))
        this.layers.clear()
        this.state.destroy()
    }
}
