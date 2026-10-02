'use client'

import { useCallback, useContext, useEffect, useState, useSyncExternalStore } from 'react'
import {
    DEFAULT_HOST, EMPTY_LAYER_TREE_STATE, EMPTY_RASTER_OVERLAY_STATE, EMPTY_VECTOR_OVERLAY_STATE, EMPTY_REGION_STATE,
    EMPTY_WIND_STATE,
} from '../core'
import type {
    GeoTiffCatalog, GisFeatureId, GisMap, GisMapHost, LayerTreeState, MyMapCatalog, RasterOverlayState, ReadableStore,
    RegionState, VectorOverlayState, WindState,
} from '../core'
import type { WindPlugin } from '../core/wind'
import { GisMapContext } from './context'

/** 가장 가까운 Provider의 엔진. 생성 전(SSR/첫 렌더)이나 Provider 밖에서는 null */
export function useGisMap(): GisMap | null {
    return useContext(GisMapContext)?.map ?? null
}

/**
 * 엔진 스토어 구독. selector는 원시값이나 스토어가 가진 기존 객체를 돌려줘야 한다
 * (매번 새 객체를 만들면 렌더가 끝없이 반복된다). store가 없으면 fallback
 */
export function useStoreValue<T, S>(
    store: ReadableStore<T> | null | undefined,
    selector: (s: T) => S,
    fallback: S,
): S {
    const subscribe = useCallback(
        (onChange: () => void) => (store ? store.subscribe(() => onChange()) : () => {}),
        [store],
    )
    const getSnapshot = (): S => (store ? selector(store.getState()) : fallback)
    return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}

const selectHost = (h: GisMapHost): GisMapHost => h

/** 현재 호스트 값. 엔진 생성 전에는 Provider의 host prop + 기본값, Provider 밖이면 기본값 */
export function useGisHost(): GisMapHost {
    const ctx = useContext(GisMapContext)
    return useStoreValue(ctx?.map?.hostStore, selectHost, ctx?.host ?? DEFAULT_HOST)
}

/** permissionsReady=false면 true(권한 로딩 전엔 전부 표시 — 현행 동작) */
export function useFeatureAllowed(featureId: GisFeatureId | string): boolean {
    const host = useGisHost()
    return !host.permissionsReady || host.isFeatureAllowed(featureId)
}

/**
 * 가장 가까운 엔진의 레이어 트리 상태 한 조각(map.layers.store).
 * selector는 스토어가 가진 값(원시값·상태 안의 기존 객체)만 돌려줘야 한다 — 새 객체·배열을 만들면 렌더가 끝없이 반복된다.
 * 모듈 최상위 상수로 둔 selector를 쓰면 가장 안전하다. 엔진이 없으면 EMPTY_LAYER_TREE_STATE(얼린 상수)에 selector를 적용한 값
 */
export function useLayerTreeState<S>(selector: (s: LayerTreeState) => S): S {
    const map = useGisMap()
    return useStoreValue(map?.layers.store, selector, selector(EMPTY_LAYER_TREE_STATE))
}

/** 가장 가까운 엔진의 GeoTIFF 표시 상태 한 조각(map.raster.store). 엔진이 없으면 EMPTY_RASTER_OVERLAY_STATE에 selector를 적용한 값 */
export function useRasterOverlayState<S>(selector: (s: RasterOverlayState) => S): S {
    const map = useGisMap()
    return useStoreValue(map?.raster.store, selector, selector(EMPTY_RASTER_OVERLAY_STATE))
}

/** 가장 가까운 엔진의 나만의지도 표시 상태 한 조각(map.vector.store) */
export function useVectorOverlayState<S>(selector: (s: VectorOverlayState) => S): S {
    const map = useGisMap()
    return useStoreValue(map?.vector.store, selector, selector(EMPTY_VECTOR_OVERLAY_STATE))
}

/**
 * 목록 하나를 컴포넌트 수명 동안 연다(마운트 때 열고 load, 언마운트 때 dispose = 폴링 타이머 정리).
 * 반환값은 목록 객체(엔진이 바뀌거나 다시 마운트될 때만 바뀐다). 엔진이 없거나 열기 전이면 null
 */
// open은 모듈 상수 함수만 넘긴다(참조가 안 바뀜 → 엔진이 바뀔 때만 다시 연다)
function useCatalog<C extends { dispose(): void }>(open: ((map: GisMap) => C) | null, map: GisMap | null): C | null {
    const [catalog, setCatalog] = useState<C | null>(null)
    useEffect(() => {
        if (!map || !open) return
        const c = open(map)
        setCatalog(c)
        return () => {
            setCatalog(cur => (cur === c ? null : cur))
            c.dispose()
        }
    }, [map, open])
    return catalog
}

const openGeoTiffCatalog = (map: GisMap): GeoTiffCatalog => map.raster.openCatalog()
const openMyMapCatalog = (map: GisMap): MyMapCatalog => map.vector.openCatalog()

/** GeoTIFF 목록(패널용). 상태는 useStoreValue(catalog?.store, selector, EMPTY_GEOTIFF_CATALOG_STATE) */
export function useGeoTiffCatalog(): GeoTiffCatalog | null {
    return useCatalog(openGeoTiffCatalog, useGisMap())
}

/** 나만의지도 목록(패널용). 상태는 useStoreValue(catalog?.store, selector, EMPTY_MYMAP_CATALOG_STATE) */
export function useMyMapCatalog(): MyMapCatalog | null {
    return useCatalog(openMyMapCatalog, useGisMap())
}

const selectRegion = (s: RegionState): RegionState => s

/** 지도 중심 지역명. 마운트돼 있는 동안 map.region.watch()로 지도 이동을 지켜본다. 반환값은 스토어가 가진 상태 객체 */
export function useRegionState(): RegionState {
    const map = useGisMap()
    useEffect(() => (map ? map.region.watch() : undefined), [map])
    return useStoreValue(map?.region.store, selectRegion, EMPTY_REGION_STATE)
}

/** 설치된 바람길 플러그인(map.use(createWindPlugin())). 없으면 null. 엔진이 바뀔 때만 바뀐다 */
export function useWindPlugin(): WindPlugin | null {
    return useGisMap()?.getPlugin<WindPlugin>('wind') ?? null
}

/** 바람길 상태 한 조각. 플러그인이 없으면 EMPTY_WIND_STATE에 selector를 적용한 값 */
export function useWindState<S>(selector: (s: WindState) => S): S {
    const wind = useWindPlugin()
    return useStoreValue(wind?.store, selector, selector(EMPTY_WIND_STATE))
}
