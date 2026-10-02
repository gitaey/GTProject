// GeoTIFF 타일 오버레이(지도 인스턴스마다 하나). 옛 hooks/map/useGeoTiffLayer.ts(모듈 전역 layerMap)와
// components/map/panel/ImagePanel.tsx의 목록·업로드·폴링·삭제·좌표 재추출을 React 없이 옮겼다.
//   - 표시 중인 레이어는 이 인스턴스의 필드에만 있다 → 지도 2개가 섞이지 않고, 패널을 닫았다 열어도 체크 = 지도
//   - 타일 URL은 GeoTiffSource.tileUrl(item)(짝 백엔드면 apiBaseUrl + item.tileUrl)
import TileLayer from 'ol/layer/Tile'
import XYZ from 'ol/source/XYZ'
import { transformExtent } from 'ol/proj'
import type OlMap from 'ol/Map'
import type { GeoTiffSource } from '../sources'
import { createStore } from '../store'
import type { ReadableStore, WritableStore } from '../store'
import type { MapResources } from '../tracker'
import type { GeoTiffItem, GeoTiffStatus } from '../types/geotiff'
import { CatalogBase } from './catalog'
import type { Catalog, CatalogState } from './catalog'

export interface RasterOverlayState {
    /** 지도에 올린 GeoTIFF id(올린 순서) */
    visibleIds: readonly number[]
}

export const EMPTY_RASTER_OVERLAY_STATE: Readonly<RasterOverlayState> = Object.freeze({
    visibleIds: Object.freeze([]) as readonly number[],
})

export interface GeoTiffCatalogState extends CatalogState<GeoTiffItem> {
    uploading: boolean
}

/** 목록이 아직 없을 때(첫 렌더·SSR) 위젯이 쓰는 상태 — 옛 ImagePanel 초기값(loading: true) */
export const EMPTY_GEOTIFF_CATALOG_STATE: Readonly<GeoTiffCatalogState> = Object.freeze({
    items: Object.freeze([]) as readonly GeoTiffItem[],
    loading: true,
    error: null,
    uploading: false,
})

export interface GeoTiffCatalog extends Catalog<GeoTiffItem, GeoTiffCatalogState> {
    /** .tif/.tiff만 받는다(아니면 false, 요청 없음). 성공하면 목록 맨 앞에 넣고 폴링 */
    upload(file: File): Promise<boolean>
    /** 항목을 PROCESSING으로 바꾸고 좌표 재추출 요청(서버 실패 응답은 무시 — 옛 동작) → 폴링 */
    reprocessBounds(id: number): Promise<void>
}

export interface RasterOverlayController {
    readonly store: ReadableStore<RasterOverlayState>
    /** 이미 올라가 있으면 아무것도 안 함. fit(기본 true)이면 범위로 이동(800ms, maxZoom 18) */
    show(item: GeoTiffItem, opts?: { fit?: boolean }): void
    hide(id: number): void
    isVisible(id: number): boolean
    getOlLayer(id: number): TileLayer<XYZ> | null
    /** 목록 하나를 연다(패널 한 번 열림). autoLoad 기본 true. 엔진 destroy 때 열린 목록도 전부 dispose */
    openCatalog(opts?: { autoLoad?: boolean }): GeoTiffCatalog
}

export interface RasterOverlayControllerOptions {
    olMap: OlMap
    resources: MapResources
    source?: GeoTiffSource
    zIndex: number
}

/** 백엔드가 준 경위도 범위(4개 다 있을 때만) */
function lonLatBounds(item: GeoTiffItem): [number, number, number, number] | null {
    if (item.minLon != null && item.minLat != null && item.maxLon != null && item.maxLat != null) {
        return [item.minLon, item.minLat, item.maxLon, item.maxLat]
    }
    return null
}

class GeoTiffCatalogImpl extends CatalogBase<GeoTiffItem, GeoTiffStatus, GeoTiffCatalogState> implements GeoTiffCatalog {
    private readonly source?: GeoTiffSource

    constructor(source: GeoTiffSource | undefined, onRemoved: (id: number) => void, onDisposed: () => void) {
        super({ items: [], loading: true, error: null, uploading: false }, {
            list: source ? () => source.list() : undefined,
            status: source ? id => source.status(id) : undefined,
            remove: source && source.remove ? id => source.remove!(id) : undefined,
            // 옛 코드: status·tileUrl(없으면 기존 값)·범위 4개를 그대로 덮어쓴다(응답에 없으면 undefined)
            merge: (i, s) => ({
                ...i,
                status: s.status,
                tileUrl: s.tileUrl ?? i.tileUrl,
                minLon: s.minLon, minLat: s.minLat,
                maxLon: s.maxLon, maxLat: s.maxLat,
            }),
            onRemoved,
            onDisposed,
        })
        this.source = source
    }

    async upload(file: File): Promise<boolean> {
        if (!file.name.match(/[.]tiff?$/i)) return false
        const source = this.source
        if (this.disposed || !source || !source.upload) return false
        this.patch({ uploading: true })
        try {
            const item = await source.upload(file)
            if (this.disposed) return false
            this.setItems([item, ...this.state.getState().items])
            return true
        } catch {
            // 옛 코드: success:false면 아무것도 안 함
            return false
        } finally {
            this.patch({ uploading: false })
        }
    }

    async reprocessBounds(id: number): Promise<void> {
        if (this.disposed) return
        this.setItems(this.state.getState().items.map(i => (i.id === id ? { ...i, status: 'PROCESSING' } : i)))
        const source = this.source
        if (!source || !source.reprocessBounds) return
        try {
            await source.reprocessBounds(id)
        } catch {
            // 옛 코드: 응답을 보지 않았다(폴링은 PROCESSING 표시와 함께 이미 시작됨)
        }
        this.ensurePolling()
    }
}

export class RasterOverlayControllerImpl implements RasterOverlayController {
    readonly store: ReadableStore<RasterOverlayState>

    private readonly state: WritableStore<RasterOverlayState>
    private readonly opts: RasterOverlayControllerOptions
    private readonly layers = new Map<number, TileLayer<XYZ>>()
    private readonly catalogs = new Set<GeoTiffCatalog>()
    private destroyed = false

    constructor(opts: RasterOverlayControllerOptions) {
        this.opts = opts
        this.state = createStore<RasterOverlayState>({ visibleIds: [] })
        this.store = this.state
    }

    show(item: GeoTiffItem, opts?: { fit?: boolean }): void {
        if (this.destroyed || this.layers.has(item.id)) return
        const { olMap, resources, source, zIndex } = this.opts
        const view = olMap.getView()
        const bounds = lonLatBounds(item)
        const extent = bounds ? transformExtent(bounds, 'EPSG:4326', view.getProjection()) : undefined

        const layer = new TileLayer({
            source: new XYZ({ url: source ? source.tileUrl(item) : item.tileUrl, crossOrigin: 'anonymous' }),
            zIndex,
            extent,
        })
        resources.addLayer(layer)
        this.layers.set(item.id, layer)
        this.state.setState({ visibleIds: [...this.state.getState().visibleIds, item.id] })

        // 백엔드에서 받은 WGS84 범위로 지도 이동
        if (extent && opts?.fit !== false) {
            view.fit(extent, { padding: [60, 60, 60, 60], duration: 800, maxZoom: 18 })
        }
    }

    hide(id: number): void {
        if (this.destroyed) return
        const layer = this.layers.get(id)
        if (layer) {
            this.opts.resources.removeLayer(layer)
            this.layers.delete(id)
        }
        const ids = this.state.getState().visibleIds
        if (ids.includes(id)) this.state.setState({ visibleIds: ids.filter(x => x !== id) })
    }

    isVisible(id: number): boolean {
        return this.layers.has(id)
    }

    getOlLayer(id: number): TileLayer<XYZ> | null {
        return this.layers.get(id) ?? null
    }

    openCatalog(opts?: { autoLoad?: boolean }): GeoTiffCatalog {
        const catalog: GeoTiffCatalog = new GeoTiffCatalogImpl(
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

    /** 엔진 destroy용: 열린 목록(폴링 타이머) 정리, OL 레이어 떼기 */
    destroy(): void {
        if (this.destroyed) return
        this.destroyed = true
        Array.from(this.catalogs).forEach(c => c.dispose())
        this.catalogs.clear()
        this.layers.forEach(l => this.opts.resources.removeLayer(l))
        this.layers.clear()
        this.state.destroy()
    }
}
