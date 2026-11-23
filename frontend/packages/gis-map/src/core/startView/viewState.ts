// 시작 화면 순수 함수: 지도 → 화면 상태 읽기, 화면 상태 → 지도 적용, 저장 JSON 만들기·검사.
// 서버는 형식·크기만 보므로(좌표 범위·줌 같은 내용은 해석하지 않는다) parseStartView가 내용 검사의 유일한 관문이다.
import { fromLonLat, toLonLat } from 'ol/proj'
import type { GisMap } from '../GisMap'
import type { BasemapMode } from '../types/layer'
import { captureLayerState, restoreLayerState } from './layerState'
import type { LayerRestoreResult } from './layerState'
import type { GisMapLayerState, GisMapStartView, GisMapViewState } from './types'

export const START_VIEW_VERSION = 1
export const START_VIEW_MAX_PANES = 4
const MAX_ZOOM_VALUE = 28
/** 한 칸에 저장·복원하는 레이어 번호의 최대 개수(서버 8KB 제한 안에 들게) */
const MAX_LAYER_IDS = 300
const BASEMAPS: readonly BasemapMode[] = ['normal', 'satellite', 'none']

function round(value: number, digits: number): number {
    const f = Math.pow(10, digits)
    return Math.round(value * f) / f
}

function isObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isFiniteNumber(value: unknown): value is number {
    return typeof value === 'number' && Number.isFinite(value)
}

export interface CaptureViewOptions {
    /** 켜 둔 레이어(목록 체크·투명도·나만의지도·TIFF)도 읽는다. 기본 false */
    layers?: boolean
}

/** 지금 지도의 중심(경위도)·줌·회전·배경지도 모드(+선택: 켜 둔 레이어). 뷰에 중심이 없으면 null */
export function captureViewState(map: GisMap, options?: CaptureViewOptions): GisMapViewState | null {
    const view = map.olMap.getView()
    const center = view.getCenter()
    const zoom = view.getZoom()
    if (!center || zoom === undefined) return null
    const lonLat = toLonLat(center, view.getProjection())
    if (!isFiniteNumber(lonLat[0]) || !isFiniteNumber(lonLat[1])) return null
    const state: GisMapViewState = {
        center: [round(lonLat[0], 6), round(lonLat[1], 6)],
        zoom: round(zoom, 3),
        rotation: round(view.getRotation(), 4),
        basemap: map.layers.store.getState().basemapMode,
    }
    if (options?.layers) state.layers = captureLayerState(map)
    return state
}

/**
 * 화면 상태를 지도에 적용한다. 중심은 뷰 좌표계로 바꾸고 줌은 뷰의 min/max로 자른다.
 * 배경지도는 레이어 트리가 있으면 바로, 없으면 트리가 처음 도착할 때 한 번 — 그 사이 사용자가 배경지도를 바꿨으면 건너뛰고,
 * 저장한 모드의 배경지도 레이어가 트리에 없으면 바꾸지 않는다(빈 지도가 되지 않게).
 * state.layers가 있으면 켜 둔 레이어도 되살린다(트리·목록이 도착할 때까지 기다리므로 비동기 — 끝나면 onLayers로 건너뛴 개수를 알린다).
 */
export function applyViewState(map: GisMap, state: GisMapViewState, onLayers?: (result: LayerRestoreResult) => void): void {
    const view = map.olMap.getView()
    view.cancelAnimations()
    view.setCenter(fromLonLat(state.center, view.getProjection()))
    const min = view.getMinZoom()
    const max = view.getMaxZoom()
    let zoom = state.zoom
    if (isFiniteNumber(min) && zoom < min) zoom = min
    if (isFiniteNumber(max) && zoom > max) zoom = max
    view.setZoom(zoom)
    view.setRotation(state.rotation)
    applyBasemap(map, state.basemap)
    if (state.layers) {
        restoreLayerState(map, state.layers).then(
            result => { onLayers?.(result) },
            () => { /* 레이어를 못 켜도 위치는 이미 적용했다 */ },
        )
    }
}

function applyBasemap(map: GisMap, mode: BasemapMode): void {
    const layers = map.layers
    const now = layers.store.getState()
    if (now.tree) {
        if (now.basemapMode !== mode && layers.hasBasemapMode(mode)) layers.setBasemapMode(mode)
        return
    }
    const modeAtApply = now.basemapMode
    if (modeAtApply === mode) return
    const off = layers.store.subscribe(s => {
        if (!s.tree) return
        off()
        offDestroy()
        if (s.basemapMode === modeAtApply && layers.hasBasemapMode(mode)) layers.setBasemapMode(mode)
    })
    const offDestroy = map.on('destroy', off)
}

export interface BuildStartViewSplit {
    count: number
    sync: boolean
    activeIndex: number
}

/** 지도들(분할이면 번호 순서)의 화면 상태로 저장할 시작 화면을 만든다. count는 1~4와 지도 수로 자른다. layers면 켜 둔 레이어도 담는다 */
export function buildStartView(maps: readonly GisMap[], split: BuildStartViewSplit, now: Date = new Date(), options?: CaptureViewOptions): GisMapStartView {
    const limit = Math.max(1, Math.min(START_VIEW_MAX_PANES, Math.floor(split.count), maps.length))
    const panes: GisMapViewState[] = []
    for (let i = 0; i < limit; i++) {
        const state = captureViewState(maps[i], options)
        if (!state) throw new Error('[gis-map] 지도 ' + (i + 1) + '의 화면 상태를 읽지 못했다(뷰에 중심이 없다)')
        panes.push(state)
    }
    const count = panes.length as 1 | 2 | 3 | 4
    const active = Number.isInteger(split.activeIndex) && split.activeIndex >= 0 && split.activeIndex < count ? split.activeIndex : 0
    return {
        version: START_VIEW_VERSION,
        savedAt: now.toISOString(),
        split: { count, sync: !!split.sync, activeIndex: active },
        panes,
    }
}

function parseIds(raw: unknown): number[] | null {
    if (!Array.isArray(raw) || raw.length > MAX_LAYER_IDS) return null
    const out: number[] = []
    for (const v of raw) {
        if (typeof v !== 'number' || !Number.isInteger(v) || v < 0) return null
        out.push(v)
    }
    return out
}

/**
 * 저장한 레이어 상태 검사. 모양이 틀리면 null — 호출한 쪽은 "레이어는 저장 안 함"으로 본다
 * (레이어 정보가 깨졌다고 위치까지 못 쓰게 하지 않는다)
 */
function parseLayers(raw: unknown): GisMapLayerState | undefined {
    if (!isObject(raw)) return undefined
    const on = parseIds(raw.on)
    const mymap = parseIds(raw.mymap)
    const tiff = parseIds(raw.tiff)
    if (!on || !mymap || !tiff) return undefined
    if (!Array.isArray(raw.opacity) || raw.opacity.length > MAX_LAYER_IDS) return undefined
    const opacity: Array<[number, number]> = []
    for (const p of raw.opacity) {
        if (!Array.isArray(p) || p.length !== 2) return undefined
        const [id, value] = p
        if (typeof id !== 'number' || !Number.isInteger(id) || id < 0) return undefined
        if (!isFiniteNumber(value) || value < 0 || value > 1) return undefined
        opacity.push([id, value])
    }
    return { on, opacity, mymap, tiff }
}

function parsePane(raw: unknown): GisMapViewState | null {
    if (!isObject(raw)) return null
    const c = raw.center
    if (!Array.isArray(c) || c.length !== 2) return null
    const lon = c[0]
    const lat = c[1]
    if (!isFiniteNumber(lon) || !isFiniteNumber(lat) || lon < -180 || lon > 180 || lat < -90 || lat > 90) return null
    const zoom = raw.zoom
    if (!isFiniteNumber(zoom) || zoom < 0 || zoom > MAX_ZOOM_VALUE) return null
    const rotation = raw.rotation
    if (!isFiniteNumber(rotation) || Math.abs(rotation) > 100) return null
    const basemap = raw.basemap
    if (typeof basemap !== 'string' || !BASEMAPS.includes(basemap as BasemapMode)) return null
    const pane: GisMapViewState = { center: [lon, lat], zoom, rotation, basemap: basemap as BasemapMode }
    const layers = parseLayers(raw.layers)
    if (layers) pane.layers = layers
    return pane
}

/**
 * 저장소에서 읽은 값 검사. 맞으면 알려진 필드만 담은 새 객체, 틀리면 null(옛 버전·수동 수정·깨진 값).
 * version 1 · count 1~4 · panes 길이 = count · 경도 -180~180 · 위도 -90~90 · 유한수 · basemap 열거값 · activeIndex 범위
 */
export function parseStartView(raw: unknown): GisMapStartView | null {
    if (!isObject(raw)) return null
    if (raw.version !== START_VIEW_VERSION) return null
    if (typeof raw.savedAt !== 'string') return null
    const split = raw.split
    if (!isObject(split)) return null
    const count = split.count
    if (count !== 1 && count !== 2 && count !== 3 && count !== 4) return null
    if (typeof split.sync !== 'boolean') return null
    const active = split.activeIndex
    if (typeof active !== 'number' || !Number.isInteger(active) || active < 0 || active >= count) return null
    if (!Array.isArray(raw.panes) || raw.panes.length !== count) return null
    const panes: GisMapViewState[] = []
    for (const p of raw.panes) {
        const pane = parsePane(p)
        if (!pane) return null
        panes.push(pane)
    }
    return { version: START_VIEW_VERSION, savedAt: raw.savedAt, split: { count, sync: split.sync, activeIndex: active }, panes }
}
