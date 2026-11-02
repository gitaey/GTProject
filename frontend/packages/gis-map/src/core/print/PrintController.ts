// 지도 출력 컨트롤러(지도 인스턴스마다 하나, map.print). 틀·옵션 스토어·렌더·내보내기를 조율한다.
//   틀 DOM·리스너·인쇄 iframe은 이 컨트롤러가 들고 있다가 hideFrame/destroy에서 해제한다(호스트 View·레이어·target은 건드리지 않는다).
//   상태는 전부 인스턴스 필드 — 모듈 전역 없음. 범례·로고 이미지·SLD 견본 캐시는 "틀을 띄운 동안"만 산다(미리보기 다시 그리기에서 재요청 없음).
import { getPointResolution } from 'ol/proj'
import type OlMap from 'ol/Map'
import type { ResolvedGisMapTheme } from '../config'
import type { RegionWatcher } from '../features/RegionWatcher'
import { isBasemapLayer } from '../layers/basemap'
import type { BasemapModeNames } from '../layers/basemap'
import type { LayerTreeController } from '../layers/LayerTreeController'
import { minimalPdf } from '../lib/minimalPdf'
import type { RasterOverlayController } from '../overlays/RasterOverlayController'
import type { VectorOverlayController } from '../overlays/VectorOverlayController'
import type { LegendSource } from '../sources'
import { createStore } from '../store'
import type { ReadableStore, WritableStore } from '../store'
import type { VWorldLegendItem } from '../types/search'
import { collectMeasureTooltips, composeMapCrop, drawMeasureTooltips, isCanvasTainted } from './composeMap'
import type { FrameRect } from './composeMap'
import { collectAttributions, collectLayerNetInfos, findTaintSuspects } from './layerInfo'
import { buildLegendGroups } from './legendModel'
import type { LegendGroup } from './legendModel'
import { MAX_PAGE_PIXELS, clampDpi, computeLayout, mmToPx, paperLabel } from './paper'
import { PrintFrameView, defaultFrameRect, planScaleFrame } from './printFrame'
import { printCanvas } from './printWindow'
import type { PrintWindowHandle } from './printWindow'
import { formatPrintDate, renderPage } from './renderPage'
import { formatScaleRatio, framePxWidthForScale, mapDpiOf, scaleDenominator } from './scaleBar'
import { GisPrintError } from './types'
import type {
    PrintController, PrintElements, PrintLayoutConfig, PrintOptions, PrintOrientation, PrintPage, PrintPaperSize, PrintState,
    PrintWarning,
} from './types'

export const DEFAULT_PRINT_FONT_FAMILY = "'Malgun Gothic','Apple SD Gothic Neo','Noto Sans KR',sans-serif"
export const DEFAULT_PRINT_SCALES: readonly number[] = Object.freeze([1000, 2500, 5000, 10000, 25000, 50000])
export const DEFAULT_VWORLD_ATTRIBUTION = '배경지도: 브이월드(국토교통부)'
export const DEFAULT_PRINT_DPI = 150
export const DEFAULT_RENDER_TIMEOUT_MS = 15000
/** 이미지(범례·로고) 읽기 최대 시간 */
const IMAGE_TIMEOUT_MS = 10000
/** 틀이 이 비율 넘게 어긋난 채 움직이면(사용자가 줌) 지정 축척을 풀고 "화면 그대로"로 돌린다 */
const SCALE_DRIFT_RATIO = 0.02

export const DEFAULT_PRINT_ELEMENTS: Readonly<PrintElements> = Object.freeze({
    legend: true, scaleBar: true, northArrow: true, date: true, attribution: true, logo: true,
})

export const INITIAL_PRINT_STATE: Readonly<PrintState> = Object.freeze({
    frameVisible: false, paper: 'A4' as PrintPaperSize, orientation: 'landscape' as PrintOrientation, scale: null, busy: false,
})

export interface PrintControllerOptions {
    olMap: OlMap
    config?: PrintLayoutConfig
    theme: Readonly<ResolvedGisMapTheme>
    layers: LayerTreeController
    basemapModes: BasemapModeNames
    vector: VectorOverlayController
    raster: RasterOverlayController
    region: RegionWatcher
    legend?: LegendSource
}

function isSecurityError(e: unknown): boolean {
    return typeof e === 'object' && e !== null && (e as { name?: string }).name === 'SecurityError'
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob> {
    return new Promise<Blob>((resolve, reject) => {
        try {
            canvas.toBlob(b => (b ? resolve(b) : reject(new Error('[gis-map] 이미지를 만들지 못했다'))), type, quality)
        } catch (e) {
            reject(isSecurityError(e) ? new GisPrintError('TAINTED') : e)
        }
    })
}

export class PrintControllerImpl implements PrintController {
    readonly store: ReadableStore<PrintState>

    private readonly state: WritableStore<PrintState>
    private readonly opts: PrintControllerOptions
    private readonly cfg: PrintLayoutConfig
    private frameView: PrintFrameView | null = null
    private frameRect: FrameRect | null = null
    private mapOffs: Array<() => void> = []
    private readonly waiters = new Set<() => void>()
    private readonly vworldCache = new Map<string, Promise<VWorldLegendItem[]>>()
    private readonly imageCache = new Map<string, Promise<HTMLImageElement | null>>()
    /** 렌더 직렬화 줄(미리보기와 내보내기가 겹쳐도 차례로) — 항상 reject하지 않는 Promise */
    private queue: Promise<void> = Promise.resolve()
    private exporting = false
    private printHandle: PrintWindowHandle | null = null
    private destroyed = false

    constructor(opts: PrintControllerOptions) {
        this.opts = opts
        this.cfg = opts.config ?? {}
        this.state = createStore<PrintState>({ ...INITIAL_PRINT_STATE })
        this.store = this.state
    }

    // ── 틀 ────────────────────────────────────────────────────────────────

    showFrame(opts?: { paper?: PrintPaperSize; orientation?: PrintOrientation }): void {
        if (this.destroyed) return
        const s = this.state.getState()
        this.state.setState({
            paper: opts?.paper ?? s.paper,
            orientation: opts?.orientation ?? s.orientation,
            frameVisible: true,
        })
        if (!this.frameView) {
            const viewport = this.opts.olMap.getViewport()
            this.frameView = new PrintFrameView(viewport.ownerDocument, viewport, this.opts.theme.primary)
            const olMap = this.opts.olMap
            olMap.on('change:size', this.handleSize)
            olMap.on('moveend', this.handleMoveEnd)
            this.mapOffs.push(() => olMap.un('change:size', this.handleSize), () => olMap.un('moveend', this.handleMoveEnd))
        }
        this.relayout(true)
    }

    hideFrame(): void {
        if (this.destroyed) return
        this.teardownFrame()
        this.state.setState({ frameVisible: false, scale: null })
    }

    setScale(denominator: number | null): void {
        if (this.destroyed) return
        const v = denominator !== null && Number.isFinite(denominator) && denominator > 0 ? denominator : null
        this.state.setState({ scale: v })
        if (this.frameView) this.relayout(true)
    }

    private readonly handleSize = (): void => {
        if (this.frameView) this.relayout(false)
    }

    private readonly handleMoveEnd = (): void => {
        if (!this.frameView || !this.frameRect) return
        const s = this.state.getState()
        if (s.scale !== null) {
            const den = this.currentDenominator(this.frameRect)
            if (den > 0 && Math.abs(den / s.scale - 1) > SCALE_DRIFT_RATIO) this.state.setState({ scale: null })
        }
        this.updateFrameDom()
    }

    private teardownFrame(): void {
        this.mapOffs.splice(0).forEach(off => off())
        this.frameView?.destroy()
        this.frameView = null
        this.frameRect = null
        this.vworldCache.clear()
        this.imageCache.clear()
    }

    /** 지금 뷰 중심의 지상 해상도(m/px). 뷰 좌표계를 쓴다 */
    private groundRes(resolution?: number): number {
        const view = this.opts.olMap.getView()
        const res = resolution ?? view.getResolution()
        const center = view.getCenter()
        if (res === undefined || !center) return 0
        return getPointResolution(view.getProjection(), res, center, 'm')
    }

    private currentDenominator(rect: FrameRect): number {
        const layout = computeLayout(this.state.getState().paper, this.state.getState().orientation)
        return scaleDenominator(rect.w, this.groundRes(), layout.map.w)
    }

    /** 틀 크기를 다시 정한다. applyZoom = 축척 지정이면 줌 단계를 바꿔도 된다(사용자 동작 직후만) */
    private relayout(applyZoom: boolean): void {
        const olMap = this.opts.olMap
        const size = olMap.getSize()
        if (!size || !(size[0] > 0) || !(size[1] > 0)) return
        const s = this.state.getState()
        const layout = computeLayout(s.paper, s.orientation)
        const view = olMap.getView()
        let rect = defaultFrameRect(size[0], size[1], layout.mapAspect)
        if (s.scale !== null) {
            const res = view.getResolution()
            const zoom = view.getZoom()
            const ground = this.groundRes()
            if (res !== undefined && zoom !== undefined && ground > 0) {
                if (applyZoom) {
                    const factor = ground / res
                    const plan = planScaleFrame({
                        denominator: s.scale, mapBoxWidthMm: layout.map.w, aspect: layout.mapAspect, mapW: size[0], mapH: size[1],
                        groundResForDelta: d => factor * view.getResolutionForZoom(zoom + d),
                        minDelta: Math.max(-8, view.getMinZoom() - zoom), maxDelta: Math.min(8, view.getMaxZoom() - zoom),
                    })
                    rect = plan.rect
                    if (plan.zoomDelta !== 0) view.setZoom(zoom + plan.zoomDelta)
                } else {
                    const w = framePxWidthForScale(s.scale, ground, layout.map.w)
                    if (w > 0) {
                        const h = w / layout.mapAspect
                        rect = { x: (size[0] - w) / 2, y: (size[1] - h) / 2, w, h }
                    }
                }
            }
        }
        this.frameRect = rect
        this.updateFrameDom()
    }

    private updateFrameDom(): void {
        if (!this.frameView || !this.frameRect) return
        const s = this.state.getState()
        const den = this.currentDenominator(this.frameRect)
        this.frameView.update(this.frameRect, paperLabel(s.paper, s.orientation) + (den > 0 ? ' · ' + formatScaleRatio(den) : ''))
    }

    // ── 렌더 ───────────────────────────────────────────────────────────────

    render(opts?: PrintOptions): Promise<PrintPage> {
        return this.enqueue(() => this.renderNow(opts))
    }

    private enqueue<T>(fn: () => Promise<T>): Promise<T> {
        const run = this.queue.then(fn)
        this.queue = run.then(() => undefined, () => undefined)
        return run
    }

    private waitRenderComplete(timeoutMs: number): Promise<boolean> {
        return new Promise<boolean>(resolve => {
            const olMap = this.opts.olMap
            let timer: ReturnType<typeof setTimeout> | null = null
            const onComplete = (): void => finish(true)
            const abort = (): void => finish(false)
            const finish = (ok: boolean): void => {
                if (timer !== null) clearTimeout(timer)
                timer = null
                olMap.un('rendercomplete', onComplete)
                this.waiters.delete(abort)
                resolve(ok)
            }
            this.waiters.add(abort)
            olMap.on('rendercomplete', onComplete)
            timer = setTimeout(abort, timeoutMs)
            olMap.render()
        })
    }

    private loadImage(url: string): Promise<HTMLImageElement | null> {
        const cached = this.imageCache.get(url)
        if (cached) return cached
        const doc = this.opts.olMap.getViewport().ownerDocument
        const p = new Promise<HTMLImageElement | null>(resolve => {
            const img = doc.createElement('img')
            const timer = setTimeout(() => resolve(null), IMAGE_TIMEOUT_MS)
            // 캔버스를 오염시키지 않도록 CORS 요청으로 읽는다(허락이 없으면 실패 → 그림만 뺀다)
            img.crossOrigin = 'anonymous'
            img.onload = () => {
                clearTimeout(timer)
                resolve(img)
            }
            img.onerror = () => {
                clearTimeout(timer)
                resolve(null)
            }
            img.src = url
        })
        this.imageCache.set(url, p)
        return p
    }

    private vworldItems(layerName: string): Promise<VWorldLegendItem[]> {
        const cached = this.vworldCache.get(layerName)
        if (cached) return cached
        const fn = this.opts.legend?.vworldLegend
        const p = fn ? fn.call(this.opts.legend, layerName) : Promise.resolve([] as VWorldLegendItem[])
        this.vworldCache.set(layerName, p)
        return p
    }

    private async collectLegend(): Promise<{ groups: LegendGroup[]; warnings: PrintWarning[] }> {
        const { layers, basemapModes, vector, raster } = this.opts
        const treeLayers = layers.allLayers().filter(l => layers.isRendered(l) && !isBasemapLayer(l, basemapModes))
        const myMaps = vector.store.getState().visibleIds
            .filter(id => vector.getOlLayer(id) !== null)
            .map(id => ({ name: vector.nameOf(id) ?? '나만의지도 ' + id, style: vector.getStyle(id) }))
        const rasters = raster.store.getState().visibleIds.map(id => ({ name: raster.nameOf(id) ?? 'GeoTIFF ' + id }))
        return buildLegendGroups({
            layers: treeLayers,
            legend: this.opts.legend,
            vworldItems: name => this.vworldItems(name),
            loadImage: url => this.loadImage(url),
            myMaps,
            rasters,
        })
    }

    private async renderNow(opts?: PrintOptions): Promise<PrintPage> {
        if (this.destroyed) throw new GisPrintError('DESTROYED')
        const { olMap, theme, region } = this.opts
        const st = this.state.getState()
        const paper = opts?.paper ?? st.paper
        const orientation = opts?.orientation ?? st.orientation
        const layout = computeLayout(paper, orientation)
        const dpi = clampDpi(opts?.dpi, this.cfg.defaultDpi ?? DEFAULT_PRINT_DPI)
        const pxW = mmToPx(layout.widthMm, dpi)
        const pxH = mmToPx(layout.heightMm, dpi)
        if (pxW * pxH > MAX_PAGE_PIXELS) throw new GisPrintError('TOO_LARGE')
        const show: PrintElements = { ...DEFAULT_PRINT_ELEMENTS, ...opts?.show }
        const warnings: PrintWarning[] = []

        const ok = await this.waitRenderComplete(this.cfg.renderTimeoutMs ?? DEFAULT_RENDER_TIMEOUT_MS)
        if (this.destroyed) throw new GisPrintError('DESTROYED')
        if (!ok) warnings.push({ code: 'RENDER_TIMEOUT', message: '지도가 다 그려지기 전에 찍었습니다. 일부 타일이 비어 있을 수 있습니다.' })

        const size = olMap.getSize()
        if (!size || !(size[0] > 0) || !(size[1] > 0)) throw new GisPrintError('NO_MAP_SIZE')
        // 틀은 지금 선택한 용지와 같은 용지일 때만 쓴다(다른 용지로 직접 부르면 가운데 용지 비율 영역)
        const useFrame = this.frameRect !== null && this.frameView !== null && paper === st.paper && orientation === st.orientation
        const rect = useFrame && this.frameRect ? this.frameRect : defaultFrameRect(size[0], size[1], layout.mapAspect)

        const doc = olMap.getViewport().ownerDocument
        const win = doc.defaultView
        const dpr = Math.min(3, Math.max(1, win?.devicePixelRatio ?? 1))
        const fontFamily = this.cfg.fontFamily ?? DEFAULT_PRINT_FONT_FAMILY
        const createCanvas = (w: number, h: number): HTMLCanvasElement => {
            const c = doc.createElement('canvas')
            c.width = w
            c.height = h
            return c
        }
        const crop = composeMapCrop({ viewport: olMap.getViewport(), size: [size[0], size[1]], frame: rect, dpr, createCanvas })
        drawMeasureTooltips(crop.ctx, collectMeasureTooltips(olMap, rect), dpr, fontFamily)

        let groups: LegendGroup[] = []
        if (show.legend) {
            const legend = await this.collectLegend()
            groups = legend.groups
            warnings.push(...legend.warnings)
        }
        let logo: HTMLImageElement | null = null
        if (show.logo && this.cfg.logo) {
            logo = await this.loadImage(this.cfg.logo)
            if (!logo) warnings.push({ code: 'LOGO_SKIPPED', message: '로고 이미지를 불러오지 못해 뺐습니다(주소 또는 CORS 확인).' })
        }
        if (this.destroyed) throw new GisPrintError('DESTROYED')

        const view = olMap.getView()
        const ground = this.groundRes()
        const denominator = scaleDenominator(rect.w, ground, layout.map.w)
        const regionName = region.store.getState().name
        const subtitle = opts?.subtitle === undefined ? (regionName === '-' ? '' : regionName) : opts.subtitle ?? ''
        const infos = collectLayerNetInfos(olMap)
        const vworldText = this.cfg.vworldAttribution === undefined ? DEFAULT_VWORLD_ATTRIBUTION : this.cfg.vworldAttribution

        const canvas = createCanvas(pxW, pxH)
        const drawn = renderPage(canvas, {
            layout, mapCanvas: crop.canvas, title: (opts?.title ?? '').trim(), subtitle: subtitle.trim(), show, groups,
            denominator, groundMetersPerMm: ground > 0 ? (ground * rect.w) / layout.map.w : 0, rotation: view.getRotation(),
            dateText: formatPrintDate(new Date()), attributions: collectAttributions(this.cfg.attributions, vworldText, infos),
            organization: this.cfg.organization, logo, paperName: paper, primary: theme.primary, fontFamily,
        })
        warnings.push(...drawn.warnings)

        const pageCtx = canvas.getContext('2d')
        const tainted = pageCtx ? isCanvasTainted(pageCtx) : true
        const taintSuspects = tainted
            ? findTaintSuspects(infos, win?.location?.origin ?? '', doc.baseURI)
            : []
        return {
            canvas, widthMm: layout.widthMm, heightMm: layout.heightMm, tainted, taintSuspects,
            scaleDenominator: denominator, mapDpi: mapDpiOf(rect.w, dpr, layout.map.w), warnings,
        }
    }

    // ── 내보내기 ───────────────────────────────────────────────────────────

    private async runExport<T>(fn: () => Promise<T>): Promise<T> {
        if (this.destroyed) throw new GisPrintError('DESTROYED')
        if (this.exporting) throw new GisPrintError('BUSY')
        this.exporting = true
        this.state.setState({ busy: true })
        try {
            return await this.enqueue(fn)
        } finally {
            this.exporting = false
            if (!this.destroyed) this.state.setState({ busy: false })
        }
    }

    exportPng(opts?: PrintOptions): Promise<Blob> {
        return this.runExport(async () => {
            const page = await this.renderNow(opts)
            if (page.tainted) throw new GisPrintError('TAINTED')
            return canvasToBlob(page.canvas, 'image/png')
        })
    }

    exportPdf(opts?: PrintOptions): Promise<Blob> {
        return this.runExport(async () => {
            const page = await this.renderNow(opts)
            if (page.tainted) throw new GisPrintError('TAINTED')
            const jpeg = await canvasToBlob(page.canvas, 'image/jpeg', 0.92)
            const bytes = new Uint8Array(await jpeg.arrayBuffer())
            const pdf = minimalPdf(bytes, page.canvas.width, page.canvas.height, page.widthMm, page.heightMm, {
                title: (opts?.title ?? '').trim() || undefined, created: new Date(),
            })
            return new Blob([pdf], { type: 'application/pdf' })
        })
    }

    print(opts?: PrintOptions): Promise<void> {
        return this.runExport(async () => {
            const page = await this.renderNow(opts)
            const handle = printCanvas(this.opts.olMap.getViewport().ownerDocument, page.canvas, page.widthMm, page.heightMm)
            this.printHandle = handle
            try {
                await handle.done
            } finally {
                if (this.printHandle === handle) this.printHandle = null
            }
        })
    }

    // ── 정리 ───────────────────────────────────────────────────────────────

    /** 엔진 destroy용: 틀·리스너·인쇄 iframe 해제, 기다리는 렌더 중단 */
    destroy(): void {
        if (this.destroyed) return
        this.destroyed = true
        this.teardownFrame()
        Array.from(this.waiters).forEach(w => w())
        this.waiters.clear()
        this.printHandle?.dispose()
        this.printHandle = null
        this.state.destroy()
    }
}
