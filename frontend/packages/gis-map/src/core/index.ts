// 지도 엔진(React 없음) 공개 API. import 허용: ol, ol/*, proj4, core 내부 상대 경로.

/** 패키지 버전. package.json의 version과 함께 올린다. */
export const GIS_MAP_VERSION = '0.1.0'

// 엔진
export { createGisMap, attachGisMap } from './GisMap'
export type { GisMap, GisMapEvents, GisOverlayRemoved, FlyToRequest } from './GisMap'
export type { GisMapPlugin } from './plugin'
// 화면 연동(여러 지도의 중심·축척·회전을 맞춘다 — React 없이 쓴다)
export { linkViews } from './split/linkViews'
export type { LinkViewsOptions, ViewLink } from './split/linkViews'
export { copyMapState } from './split/paneState'
export type { CopyMapStateOptions } from './split/paneState'

// 시작 화면(저장소 sources.startView · map.startView) — 순수 함수(화면 상태 읽기·적용·저장 JSON 만들기·검사)도 공개
export { captureViewState, applyViewState, buildStartView, parseStartView, START_VIEW_VERSION } from './startView/viewState'
export type { BuildStartViewSplit } from './startView/viewState'
export { startViewErrorKind, DEFAULT_START_VIEW_WAIT_MS } from './startView/StartViewController'
export type { StartViewController } from './startView/StartViewController'
export { EMPTY_START_VIEW_STATE } from './startView/types'
export type {
    GisMapViewState, GisMapStartView, StoredStartView, StartViewSource, GisMapStartViewConfig, StartViewStatus, StartViewOp,
    StartViewErrorKind, StartViewState,
} from './startView/types'
// 화면 밝기 모드
export { normalizeAppearance } from './types/appearance'
export type { GisMapAppearance } from './types/appearance'

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
export { defaultResolveLayerUrl, defaultLayerCrossOrigin, isVWorldUrl, isVWorldTileUrl } from './layers/resolveLayerUrl'
export type { LayerUrlResolver, ResolvedLayerUrl, LayerCrossOriginResolver } from './layers/resolveLayerUrl'
export { createOlLayer } from './layers/createOlLayer'
export type { CreateOlLayerOptions } from './layers/createOlLayer'
// 오버레이(GeoTIFF 타일·나만의지도 GeoJSON)와 그 목록(패널 한 번 열림 = 목록 하나, 상태 폴링)
export { EMPTY_RASTER_OVERLAY_STATE, EMPTY_GEOTIFF_CATALOG_STATE } from './overlays/RasterOverlayController'
export type { RasterOverlayController, RasterOverlayState, GeoTiffCatalog, GeoTiffCatalogState } from './overlays/RasterOverlayController'
export { EMPTY_VECTOR_OVERLAY_STATE, EMPTY_MYMAP_CATALOG_STATE, myMapStyle } from './overlays/VectorOverlayController'
export type { VectorOverlayController, VectorOverlayState, MyMapCatalog, MyMapCatalogState, MyMapFeatureHit } from './overlays/VectorOverlayController'
// 큰 나만의지도(10만 피처): 나눠 불러오기·격자 묶음 설정과 순수 함수(config.myMap)
export { DEFAULT_MYMAP_CLUSTER, DEFAULT_MYMAP_LOAD_CHUNK_MS, resolveMyMapCluster, resolveLoadChunkMs, gridCluster } from './overlays/myMapCluster'
export type { GisMapMyMapConfig, GisMapMyMapClusterConfig, ResolvedMyMapClusterConfig } from './overlays/myMapCluster'
// 나만의지도 스타일(styleConfig v1) — 순수 함수(스키마·검증·구간·팔레트·컬럼 요약)와 ol 스타일 함수
export {
    MYMAP_STYLE_VERSION, MYMAP_STYLE_MAX_BYTES, STYLE_FILL_OPACITY, STYLE_STROKE_WIDTH, STYLE_POINT_RADIUS, STYLE_POINT_STROKE_WIDTH,
    STYLE_LABEL_SIZE, STYLE_LABEL_MIN_ZOOM, STYLE_MAX_CATEGORIES, STYLE_MIN_BREAK_CLASSES, STYLE_MAX_BREAK_CLASSES, STYLE_MAX_POPUP_FIELDS, STYLE_MAX_TEXT,
    POPUP_DEFAULT_FIELD_COUNT, DEFAULT_OTHER_COLOR, DEFAULT_LABEL_SIZE, DEFAULT_LABEL_COLOR, DEFAULT_LABEL_HALO, DEFAULT_LABEL_MIN_ZOOM,
    CATEGORY_PALETTE, COLOR_RAMPS, findRamp, findRampIdByColors, rampColors, readNumberDetail, NUMBER_ABS_LIMIT, BREAK_ABS_LIMIT, defaultMyMapStyle, parseMyMapStyle, serializeMyMapStyle, sameMyMapStyle,
    isDefaultMyMapStyle, utf8Length, readNumber, categoryKey, makeClassColorFn, computeBreaks, summarizeColumns, categoryCounts,
    numericValues, buildCategorizedStyle, buildGraduatedStyle, labelFloorZoom, effectiveLabelMinZoom, displayText, popupFieldsFor,
} from './lib/mymapStyleConfig'
export type {
    ColorRamp, NumberRead, PropertyReader, CategoryCount, CategoryCounts, GraduatedRequest, GraduatedResult,
} from './lib/mymapStyleConfig'
export { createMyMapStyle, createMyMapLabelStyle, createMyMapAnchors, MYMAP_LABEL_FONT_FAMILY } from './lib/mymapStyle'
export type { MyMapAnchors } from './lib/mymapStyle'
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

// 지도 출력(PNG·PDF·인쇄) — map.print. 순수 계산·PDF 생성도 함께 공개(호스트가 자기 양식을 만들 때)
export { GisPrintError } from './print/types'
export type {
    PrintController, PrintState, PrintOptions, PrintPage, PrintElements, PrintLayoutConfig, PrintPaperSize, PrintOrientation,
    PrintWarning, PrintWarningCode, GisPrintErrorCode,
} from './print/types'
export {
    DEFAULT_PRINT_FONT_FAMILY, DEFAULT_PRINT_SCALES, DEFAULT_VWORLD_ATTRIBUTION, DEFAULT_PRINT_DPI, DEFAULT_PRINT_ELEMENTS, INITIAL_PRINT_STATE,
} from './print/PrintController'
export { PAPER_PORTRAIT_MM, paperSizeMm, paperLabel, computeLayout, clampDpi, MIN_DPI, MAX_DPI } from './print/paper'
export { scaleDenominator, framePxWidthForScale, niceBarMeters, planScaleBar, formatBarLabel, formatScaleRatio } from './print/scaleBar'
export { formatPrintDate } from './print/renderPage'
export { minimalPdf } from './lib/minimalPdf'
export { saveBlob } from './lib/saveBlob'
export { transformGeoJson } from './lib/geoJsonTransform'

// 필지 정보 카드 — map.parcelInfo. 지목 표·면적 계산도 공개(호스트가 자기 화면을 만들 때)
export { INITIAL_PARCEL_INFO_STATE } from './parcelInfo/types'
export type { ParcelInfoController, ParcelInfoState, ParcelStatus, ParcelBuildingsStatus } from './parcelInfo/types'
export { jimokName, JIMOK_NAMES } from './parcelInfo/jimok'
export { parcelAreaM2, BUILDINGS_FIRST_LIMIT, BUILDINGS_ALL_LIMIT } from './parcelInfo/ParcelInfoController'

// 영역 분석 — map.areaAnalysis. 순수 계산(판정·잘라낸 면적·집계·CSV)도 공개(호스트가 자기 화면을 만들 때)
export { DEFAULT_AREA_ANALYSIS, refKey as areaRefKey, sameRef as areaSameRef } from './areaAnalysis/types'
export type {
    AreaAnalysisController, AreaAnalysisState, AreaAnalysisArea, AreaAnalysisLayerRef, AreaAnalysisLayerItem, AreaAnalysisColumn, LayerAnalysisResult,
    NumericColumnStats, CategoryResult, CategoryRow, AreaShape, AreaDrawShape, AreaSelectMode, AreaWarningCode, GisMapAreaAnalysisConfig,
    AreaConfirm, AreaConfirmChoice, AreaResultRecord,
} from './areaAnalysis/types'
export { INITIAL_AREA_ANALYSIS_STATE } from './areaAnalysis/AreaAnalysisController'
export { signedSphericalAreaM2, polygonAreaM2, clipPolygonAreaM2, lineLengthM, EARTH_RADIUS_M } from './areaAnalysis/clip'
export { buildAreaModel, selectParts, geomParts, MAX_AREA_VERTICES } from './areaAnalysis/spatial'
export { buildCsv, csvCell } from './areaAnalysis/exportResult'

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
export { resolveSources, AreaQueryUnsupportedError } from './sources'
export type {
    GisMapSources, GisMapSourcesInput, GisMapSourcesFactory, SourceContext,
    LayerTreeSource, LayerUserSelectionSource, MyMapSource, GeoTiffSource, WindSource,
    AddressSearchSource, ParcelSource, RegionNameSource, LegendSource, WfsSource,
    ShareUser, ShareGroup, ShareDirectorySource, ShareEntryState, ShareSnapshot, ShareChange, BulkShareMode, BulkShareResult,
    ShareTargetSource, AreaQuerySource, AreaQueryLayerInfo, AreaQueryPage,
    ParcelInfo, ParcelBuilding, ParcelAddressGroup, ParcelBuildingsResult, ParcelBuildingSource,
    DataInfoSource, GisDataInfoItem,
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
    MyMapSourceKind, MyMapUploadMode, MyMapSampleKind, MyMapLimits, MyMapQuota, MyMapCoverage, MyMapConfirmResult, ExcelSuggestions, ExcelPreviewWarning,
    MyMapImportReport, MyMapImportReportRow, MyMapImportReportQuery,
    MyMapDisplay, MyMapStyleClass, MyMapCategorizedStyle, MyMapBreakMethod, MyMapGraduatedStyle, MyMapClassify, MyMapLabelStyle,
    MyMapPopupStyle, MyMapStyleConfig, MyMapColumnInfo, MyMapUpdateInput,
    MyMapExportSrid, MyMapConvertInclude, MyMapConvertInput, MyMapConvertPreview, MyMapConvertResult, MyMapExportFormat, MyMapExportOptions, MyMapExportResult,
} from './types/mymap'
export type { GeoTiffItem, GeoTiffStatus } from './types/geotiff'
export type { AddressSearchItem, VWorldLegendItem } from './types/search'
export { EMPTY_WIND_STATE } from './types/wind'
export type {
    WindField, WindState, WindFrameMeta, WindSample, WindFramesStatus, WindStaleKind,
    WindScalarVar, WindOverlayVar, WindScalarField, WindScalarSample, WindPointerValues,
} from './types/wind'
export { sampleWind, readWindGrid, windVectorToSample, windDirectionName, formatWindSample, readScalarGrid, sampleGrid } from './lib/windGrid'
export type { WindGridInfo, ScalarGridInfo } from './lib/windGrid'
export { buildWindOverlayImage } from './lib/windOverlayImage'
export { buildGridOverlayImage, buildScalarOverlayImage, buildFlatOverlayImage, gridImageExtent } from './lib/gridOverlayImage'
export type { OverlayGridGeom } from './lib/gridOverlayImage'
export {
    WX_COLOR_SCALES, WX_SCALAR_VARS, isWindScalarVar, wxScalePosition, wxScaleIndex, wxScaleColorAt, wxScalePalette, wxScaleGradientStops,
    wxTickLabel, formatScalarValue,
} from './lib/wxColorScales'
export type { WxColorScale, WxColorStop } from './lib/wxColorScales'
export { compactWindField, expandWindField } from './lib/windCompact'
export type { CompactWindField } from './lib/windCompact'
export type { WindOverlayImage } from './lib/windOverlayImage'
export { encodeIndexedPng, bytesToDataUrl } from './lib/pngIndexed'
export { cssColorLuminance } from './lib/cssColor'
export {
    normalizeWindFrames, parseUtcTime, kstParts, KST_OFFSET_HOURS, formatForecastTime, formatForecastHourShort, formatIssueTime,
    frameValidMs, currentFrameIndex, windStaleKind, formatForecastRange, windScalarVarsOf,
} from './lib/windFrames'
export type { KstParts } from './lib/windFrames'
export {
    WIND_FRAME_INTERVAL_MS, WIND_FRAME_CACHE_MIN, WIND_DENSITY_MIN, WIND_DENSITY_MAX, WIND_SPEED_MIN, WIND_SPEED_MAX, WIND_SCALE_STEP,
    WIND_MONO_COLOR_LIGHT, WIND_MONO_COLOR_DARK, WIND_POINTER_THROTTLE_MS, WIND_FRAMES_TTL_MS, WIND_STALE_CHECK_MS, WIND_STALE_PAST_MS, WIND_STALE_ISSUED_MS,
    WIND_OVERLAY_OPACITY_MIN, WIND_OVERLAY_OPACITY_MAX, WIND_OVERLAY_OPACITY_DEFAULT, WIND_OVERLAY_OPACITY_STEP, WIND_LEGEND_MAX_SPEED,
    WIND_VEIL_COLOR_DARK, WIND_VEIL_ALPHA_DARK, WIND_VEIL_COLOR_LIGHT, WIND_VEIL_ALPHA_LIGHT, WIND_PARTICLE_BRIGHT_LUMINANCE,
} from './lib/windLimits'
export type { GisFeatureId } from './types/feature'
