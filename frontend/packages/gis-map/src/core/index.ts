// 지도 엔진(React 없음) 공개 API. import 허용: ol, ol/*, proj4, core 내부 상대 경로.

/** 패키지 버전. package.json의 version과 함께 올린다. */
export const GIS_MAP_VERSION = '0.1.0'

// 엔진
export { createGisMap, attachGisMap } from './GisMap'
export type { GisMap, GisMapEvents, FlyToRequest } from './GisMap'
export type { GisMapPlugin } from './plugin'

// 도구(도구 관리자·그리기·커서 안내)
export { DEFAULT_DRAW_STYLE } from './tools/DrawController'
export type { DrawController, DrawState } from './tools/DrawController'
export type { ToolManager, ToolState } from './tools/ToolManager'
export { DEFAULT_TOOL_HINTS, resolveToolHints } from './tools/toolHint'
export type { ToolHints } from './tools/toolHint'
// 레이어 트리(컨트롤러·순수 함수·OL 레이어 생성)
export { EMPTY_LAYER_TREE_STATE } from './layers/LayerTreeController'
export type { LayerTreeController, LayerTreeState, LayerExpandedStorage } from './layers/LayerTreeController'
export { flattenGroupLayers, allTreeLayers, filterTreeByIds, getLayerVisible, getLayerOpacity } from './layers/treeUtils'
export { DEFAULT_BASEMAP_MODES, resolveBasemapModes, isBasemapLayer, getBasemapVisibility, deriveBasemapMode } from './layers/basemap'
export type { BasemapModeNames } from './layers/basemap'
export { defaultResolveLayerUrl, isVWorldUrl } from './layers/resolveLayerUrl'
export type { LayerUrlResolver, ResolvedLayerUrl } from './layers/resolveLayerUrl'
export { createOlLayer } from './layers/createOlLayer'
export type { CreateOlLayerOptions } from './layers/createOlLayer'
// 오버레이(GeoTIFF 타일·나만의지도 GeoJSON)와 그 목록(패널 한 번 열림 = 목록 하나, 상태 폴링)
export { EMPTY_RASTER_OVERLAY_STATE, EMPTY_GEOTIFF_CATALOG_STATE } from './overlays/RasterOverlayController'
export type { RasterOverlayController, RasterOverlayState, GeoTiffCatalog, GeoTiffCatalogState } from './overlays/RasterOverlayController'
export { EMPTY_VECTOR_OVERLAY_STATE, EMPTY_MYMAP_CATALOG_STATE, myMapStyle } from './overlays/VectorOverlayController'
export type { VectorOverlayController, VectorOverlayState, MyMapCatalog, MyMapCatalogState } from './overlays/VectorOverlayController'
export { CATALOG_POLL_INTERVAL_MS } from './overlays/catalog'
export type { Catalog, CatalogState } from './overlays/catalog'
// 필지 강조·지역명
export { pinSvg, makePinStyle, makeParcelStyle } from './features/ParcelHighlighter'
export type { ParcelHighlighter } from './features/ParcelHighlighter'
export { EMPTY_REGION_STATE } from './features/RegionWatcher'
export type { RegionWatcher, RegionState } from './features/RegionWatcher'
// 옛 패널의 '서버 실패 응답은 보지 않는다' 동작 도우미
export { isNetworkError, ignoreServerFailure } from './lib/serverFailure'
// 바람길 색(범례와 플러그인이 같은 색). 플러그인 자체는 './wind'(ol-wind 필요)
export { WIND_COLOR_STOPS, windSpeedColor } from './lib/windColorScale'
export type { WindColorStop } from './lib/windColorScale'
// 측정값 표기(거리·면적·반경 — 툴팁과 같은 글자)
export { formatLength, formatArea, formatRadius } from './lib/format'
// 색 입력 규칙(#rgb·#rrggbb → #rrggbb, 그 밖은 null) — config.theme.primary와 ui 테마 CSS 변수가 같이 쓴다
export { normalizeHexColor, parseHexColor } from './lib/color'

// 설정
export { DEFAULT_VIEW, DEFAULT_THEME, DEFAULT_ZINDEX, resolveView, resolveTheme, resolveZIndex } from './config'
export type {
    GisMapConfig, GisMapAttachOptions, GisMapViewConfig, GisMapTheme, ResolvedGisMapTheme,
    GisMapLayersConfig, GisMapUiConfig, TextInputRequest, GisMapZIndex,
} from './config'

// 호스트 주입 / HTTP
export { DEFAULT_HOST, mergeHost } from './host'
export type { GisMapHost, PartialGisMapHost, GisMapUser, GisMapHttpOptions, GisMapEndpoints } from './host'
export { createHttpClient, GisHttpError } from './http'
export type { HttpClient } from './http'

// 데이터 소스
export { resolveSources } from './sources'
export type {
    GisMapSources, GisMapSourcesInput, GisMapSourcesFactory, SourceContext,
    LayerTreeSource, LayerUserSelectionSource, MyMapSource, GeoTiffSource, WindSource,
    AddressSearchSource, ParcelSource, RegionNameSource, LegendSource, WfsSource,
} from './sources'

// 상태 저장소 / 이벤트
export { createStore } from './store'
export type { ReadableStore, WritableStore } from './store'
export { createEmitter } from './events'
export type { Emitter } from './events'

// 좌표계 / ol 호환
export { registerProjections, DEFAULT_PROJ4_DEFS } from './projection'
export { REQUIRED_OL_API, OPTIONAL_OL_API, MIN_OL_VERSION, TESTED_OL_MAX, checkOlCompat, GisOlCompatError } from './olCompat'
export type { OlCompatReport } from './olCompat'

// 타입
export type { LayerKind, LayerSourceKind, LayerDef, LayerGroupDef, LayerTree, BasemapMode } from './types/layer'
export type { MapTool, DrawStyle } from './types/draw'
export type { GeoJsonObject } from './types/geojson'
export type {
    UserMapListItem, UserMapStatus, ExcelPreviewResponse, ShpUploadInput, ExcelConfirmInput, UserMapShare,
} from './types/mymap'
export type { GeoTiffItem, GeoTiffStatus } from './types/geotiff'
export type { AddressSearchItem, VWorldLegendItem } from './types/search'
export { EMPTY_WIND_STATE } from './types/wind'
export type { WindField, WindState } from './types/wind'
export type { GisFeatureId } from './types/feature'
