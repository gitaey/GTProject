// React 바인딩(GisMapProvider, GisMapView, 훅) 공개 API.

export { GisMapProvider } from './GisMapProvider'
export type { GisMapProviderProps } from './GisMapProvider'
export { GisMapView } from './GisMapView'
export type { GisMapViewProps } from './GisMapView'
// 화면 분할(2~4번 지도 소유 Provider·칸·훅). 셀렉트·격자 위젯은 ui의 MapShell split
export { GisMapSplitProvider } from './split/GisMapSplitProvider'
export type { GisMapSplitProviderProps } from './split/GisMapSplitProvider'
export { GisMapPane } from './split/GisMapPane'
export type { GisMapPaneProps } from './split/GisMapPane'
export { useGisMapSplit, useGisMapPaneIndex } from './split/hooks'
export type { GisMapSetupInfo, GisMapSplitCount, GisMapSplitInitialState, GisMapSplitState } from './split/context'
export {
    useGisMap, useStoreValue, useGisHost, useFeatureAllowed, useLayerTreeState,
    useRasterOverlayState, useVectorOverlayState, useGeoTiffCatalog, useMyMapCatalog, useRegionState, useWindPlugin, useWindState,
    useWindPointerSample, useWindPointerValues,
} from './hooks'
export { usePersistentExpanded, browserExpandedStorage } from './usePersistentExpanded'
export type { PersistentExpanded } from './usePersistentExpanded'
