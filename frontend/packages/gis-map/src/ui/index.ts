// 선택형 UI 위젯 공개 API (+ react, lucide-react).
// FE-5a: 옛 frontend/src/components/map 위젯을 옮겼다. FE-5b-1·5b-2: 위젯 전부가 Tailwind 없이 패키지 자체 gm- CSS를 쓴다.
// FE-5c: 조립 셸 MapShell(설정 가능) + 기본 패널 + 개별 위젯 공개.
//
// 쓰는 법
//   · 스타일: 호스트가 패키지 CSS 두 개를 이 순서로 불러온다 — styles/gis-map.css(리셋·--gm-* 변수·코어 DOM) → styles/gis-map-ui.css(위젯)
//   · 위젯은 전부 <GisMapProvider>(@gtp/gis-map/react) 안에서 가장 가까운 엔진을 읽는다
//   · 화면 전체: <MapShell brand={…} panels={[...defaultPanels, 호스트 패널]} />
//   · 위젯을 따로 조립할 때: 위젯들을 <MapRoot>로 감싼다(또는 감싸는 요소에 class "gm-root"). gm-root 밖에서는 --gm-* 변수가 풀리지 않아
//     색·크기가 빠진다. 지도 div는 <GisMapView>(react), 지도 위 위젯(MapToolbar·RegionBadge·WindLegend·MobileLayerButton)은
//     position: relative인 지도 영역 안에 둔다(MapShell의 gm-map-view__stage와 같은 배치)
//   · 브랜드 색: config.theme.primary(#rgb·#rrggbb — 그 밖의 값은 기본색) 또는 CSS .gm-root { --gm-primary: … } (파생 변수는 styles/gis-map.css 주석)

// 셸·패널
export { default as MapShell } from './shell/MapShell'
export type { MapShellProps } from './shell/MapShell'
export type { MapPanelDef, MapShellBrand } from './shell/types'
export { default as MapRoot } from './shell/MapRoot'
export type { MapRootProps } from './shell/MapRoot'
export { primaryThemeVars } from './shell/themeVars'
export { defaultPanels, layerPanel, imagePanel, myMapPanel } from './panels/defaultPanels'

// 개별 위젯
export { default as MapHeader, DEFAULT_MAP_BRAND } from './shell/MapHeader'
export type { MapHeaderProps } from './shell/MapHeader'
export { default as SearchBar } from './search/SearchBar'
export { default as BasemapSwitcher } from './search/BasemapSwitcher'
export { default as MapToolbar } from './toolbar/MapToolbar'
export { default as LayerPanel } from './layer/LayerPanel'
export { default as ImagePanel } from './panels/ImagePanel'
export { default as MyMapPanel } from './panels/MyMapPanel'
export { default as MapStatusBar, DEFAULT_STATUS_BAR_PROJECTION } from './statusbar/MapStatusBar'
export type { MapStatusBarProps } from './statusbar/MapStatusBar'
export { default as RegionBadge } from './overlay/RegionBadge'
export { default as WindLegend } from './overlay/WindLegend'
export { default as MobileLayerButton } from './mobile/MobileLayerButton'
