// 엔진 설정 타입과 기본값. 뷰 좌표계 기본값('EPSG:3857')은 이 파일에만 둔다.
import type { GisMapHost, PartialGisMapHost } from './host'
import type { GisMapSourcesInput } from './sources'
import type { MapTool } from './types/draw'
import type { BasemapMode, LayerDef } from './types/layer'
import type { LayerExpandedStorage } from './layers/LayerTreeController'
import { normalizeHexColor } from './lib/color'

export interface GisMapViewConfig {
    /** [lon, lat] EPSG:4326 */
    center?: [number, number]
    zoom?: number
    minZoom?: number
    maxZoom?: number
    /** 뷰 좌표계. 코어는 이 값(또는 호스트 지도의 뷰 좌표계)만 쓴다 */
    projection?: string
}

export interface GisMapTheme {
    /** CSS 변수 --gm-primary, 그리기 기본색, 핀 색 */
    primary?: string
    measure?: { distance?: string; area?: string; radius?: string }
    parcel?: { stroke?: string; fill?: string }
}

/** 기본값을 전부 채운 테마 */
export interface ResolvedGisMapTheme {
    primary: string
    measure: { distance: string; area: string; radius: string }
    parcel: { stroke: string; fill: string }
}

export interface GisMapLayersConfig {
    /** layerTree 소스가 있으면 생성 직후 자동 로드. 기본 true */
    autoLoad?: boolean
    /** 배경지도 모드별로 켤 XYZ 레이어 layerName */
    basemapModes?: Partial<Record<Exclude<BasemapMode, 'none'>, string[]>>
    /** 레이어 URL/파라미터 가공(선택). 기본: '{VWORLD_KEY}' 치환 + vworld.kr WMS에 key 파라미터 */
    resolveUrl?: (layer: LayerDef, host: GisMapHost) => { url: string; params?: Record<string, string> }
    /** 그룹 펼침 상태 저장소(선택). 없으면 메모리에만 둔다(새로고침하면 전부 펼침). 코어는 브라우저 저장소를 직접 쓰지 않는다 */
    expandedStorage?: LayerExpandedStorage
}

export interface TextInputRequest {
    pixel: [number, number]
    coordinate: number[]
    submit(text: string): void
    cancel(): void
}

export interface GisMapUiConfig {
    /** 도구 사용 중 커서 옆 안내문. false면 끔, 객체면 문구 교체 */
    toolHints?: boolean | Partial<Record<MapTool, string>>
    /** 텍스트 도형 입력 UI 교체(선택) */
    textInput?: (req: TextInputRequest) => void
}

export interface GisMapZIndex {
    /** WMS/WFS 레이어(XYZ 배경은 0) */
    tree: number
    /** GeoTIFF */
    raster: number
    /** 나만의지도 */
    vector: number
    /** 그리기·측정·반경 */
    tools: number
    /** 필지 강조·핀 */
    parcel: number
}

export interface GisMapConfig {
    /** 없으면 나중에 map.mount(el) */
    target?: HTMLElement | string
    host?: PartialGisMapHost
    sources?: GisMapSourcesInput
    view?: GisMapViewConfig
    theme?: GisMapTheme
    layers?: GisMapLayersConfig
    ui?: GisMapUiConfig
    /** 추가 proj4 정의. EPSG:5186, 5179, 5185, 5187, 5188은 기본 등록. false면 좌표계 등록을 전혀 안 함 */
    projections?: Record<string, string> | false
    /** 엔진이 추가하는 레이어 zIndex. 붙이기 모드에서 호스트 레이어와 겹치지 않게 조정 */
    zIndex?: Partial<GisMapZIndex>
}

/** 붙이기 모드 옵션. 뷰는 호스트 지도의 것을 그대로 쓰므로 받지 않는다 */
export type GisMapAttachOptions = Omit<GisMapConfig, 'target' | 'view'>

/**
 * 뷰 기본값. center는 특정 기관 좌표가 아니라 대한민국 대략 중앙이다.
 * 실제 서비스 중심좌표는 호스트가 config.view.center로 넘긴다.
 */
export const DEFAULT_VIEW: Readonly<Required<GisMapViewConfig>> = Object.freeze({
    center: [127.5, 36.5] as [number, number],
    zoom: 10,
    minZoom: 7,
    maxZoom: 21,
    projection: 'EPSG:3857',
})

/**
 * 테마 기본값. primary는 패키지 브랜드 색 기본값의 유일한 JS 정의(CSS 쪽 정의는 styles/gis-map.css의 --gm-primary — 둘은 같은 색이어야 한다).
 * primary는 #rrggbb(또는 #rgb — 6자리로 펼친다)로 준다(그리기 색 input[type=color]·hexToRgba·MapRoot의 CSS 변수 계산이 hex를 쓴다).
 * 그 밖의 값은 resolveTheme가 경고 후 이 기본값으로 바꾼다(lib/color normalizeHexColor)
 */
export const DEFAULT_THEME: Readonly<ResolvedGisMapTheme> = Object.freeze({
    primary: '#F26722',
    measure: Object.freeze({ distance: '#e8365d', area: '#4169e1', radius: '#7c3aed' }),
    parcel: Object.freeze({ stroke: '#2563eb', fill: 'rgba(59,130,246,0.15)' }),
})

export const DEFAULT_ZINDEX: Readonly<GisMapZIndex> = Object.freeze({
    tree: 10,
    raster: 5,
    vector: 6,
    tools: 100,
    parcel: 200,
})

export function resolveView(view?: GisMapViewConfig): Required<GisMapViewConfig> {
    return {
        center: view?.center ?? DEFAULT_VIEW.center,
        zoom: view?.zoom ?? DEFAULT_VIEW.zoom,
        minZoom: view?.minZoom ?? DEFAULT_VIEW.minZoom,
        maxZoom: view?.maxZoom ?? DEFAULT_VIEW.maxZoom,
        projection: view?.projection ?? DEFAULT_VIEW.projection,
    }
}

/** 주 색 입력 규칙(normalizeHexColor): #rgb → #rrggbb, #rrggbb는 그대로. 비었으면 기본값, 잘못된 값은 경고 후 기본값(예외 없음) */
function resolvePrimary(primary: unknown): string {
    if (primary === undefined || primary === null || primary === '') return DEFAULT_THEME.primary
    const hex = normalizeHexColor(primary)
    if (hex) return hex
    console.warn('[gis-map] theme.primary는 #rgb 또는 #rrggbb여야 한다. 기본값(' + DEFAULT_THEME.primary + ')을 쓴다:', primary)
    return DEFAULT_THEME.primary
}

export function resolveTheme(theme?: GisMapTheme): ResolvedGisMapTheme {
    return {
        primary: resolvePrimary(theme?.primary),
        measure: {
            distance: theme?.measure?.distance ?? DEFAULT_THEME.measure.distance,
            area: theme?.measure?.area ?? DEFAULT_THEME.measure.area,
            radius: theme?.measure?.radius ?? DEFAULT_THEME.measure.radius,
        },
        parcel: {
            stroke: theme?.parcel?.stroke ?? DEFAULT_THEME.parcel.stroke,
            fill: theme?.parcel?.fill ?? DEFAULT_THEME.parcel.fill,
        },
    }
}

export function resolveZIndex(zIndex?: Partial<GisMapZIndex>): GisMapZIndex {
    return {
        tree: zIndex?.tree ?? DEFAULT_ZINDEX.tree,
        raster: zIndex?.raster ?? DEFAULT_ZINDEX.raster,
        vector: zIndex?.vector ?? DEFAULT_ZINDEX.vector,
        tools: zIndex?.tools ?? DEFAULT_ZINDEX.tools,
        parcel: zIndex?.parcel ?? DEFAULT_ZINDEX.parcel,
    }
}
