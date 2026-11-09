'use client'

// 공개 데모(/demo/map) 지도 설정 — 브랜드·패널·사용자 메뉴·엔진 설정·배경지도(VWorld ↔ OSM) 도우미. 지도 패키지 밖(앱 쪽)이라 이식하지 않는다.
// 상수는 모듈 상수(얼림), 설정은 데모 한 벌(bundle)마다 한 번만 만든다(Provider config는 최초 1회만 읽는다).
import { Earth, Info, LogIn } from 'lucide-react'
import type { GisMap, GisMapConfig, LayerDef, LayerGroupDef, LayerTree, LayerTreeState } from '@gtp/gis-map/core'
import { createWindPlugin } from '@gtp/gis-map/core/wind'
import { useLayerTreeState } from '@gtp/gis-map/react'
import type { GisMapSetupInfo, GisMapSplitCount } from '@gtp/gis-map/react'
import { browserStartViewSource } from '@gtp/gis-map/adapters/memory'
import { layerPanel, myMapPanel, windPanel } from '@gtp/gis-map/ui'
import type { MapPanelDef, MapShellBrand, MapShellSettingsOptions, MapShellSplitOptions, MapUserMenuItem } from '@gtp/gis-map/ui'
import { demoCrossOrigin } from './demoSources'
import type { DemoBundle } from './demoSources'

export const DEMO_BRAND: Readonly<MapShellBrand> = Object.freeze({ title: 'GIS 데모', subtitle: '샘플 데이터', logo: <Earth size={16} /> })

/** 네비 패널: 레이어·나만의지도·바람지도(TIFF·기타는 없다) */
export const DEMO_PANELS: readonly MapPanelDef[] = Object.freeze([layerPanel, myMapPanel, windPanel])

/** 설정 패널: 시작 화면(이 브라우저에 저장 — 백엔드가 없다)만. 테마 카드는 2단계(다크 모드 색 치환)가 끝날 때까지 숨긴다 */
export const DEMO_SETTINGS: Readonly<MapShellSettingsOptions> = Object.freeze({ theme: false })

/** 영역 분석 상한을 낮춘다 — 우리 GeoServer에 익명 부하를 주지 않게(한 번에 한 레이어·1,000건·10㎢ 경고) */
export const DEMO_AREA_ANALYSIS = Object.freeze({ maxFeaturesPerLayer: 1000, areaWarnKm2: 10, maxConcurrent: 1 })

/** 머리줄 사용자 메뉴: 소개로·로그인(페이지 이동은 앱이 한다 — 패키지는 모른다) */
export const DEMO_USER_MENU: readonly MapUserMenuItem[] = Object.freeze([
    { id: 'intro', label: '소개로', icon: <Info size={14} />, onSelect: () => { window.location.assign('/demo') } },
    { id: 'login', label: '로그인', icon: <LogIn size={14} />, onSelect: () => { window.location.assign('/login') } },
])

/** 엔진 설정 — 합성 구역 중심, 브랜드 주 색, 데모 소스, 출력 고지(샘플 데이터). 레이어 그룹 펼침은 저장하지 않는다(expandedStorage 없음) */
export function buildDemoConfig(bundle: DemoBundle): Omit<GisMapConfig, 'target' | 'host'> {
    const { demo } = bundle
    return {
        view: { center: demo.view.center, zoom: demo.view.zoom, minZoom: 7, maxZoom: 21 },
        theme: { primary: '#F26722' },
        sources: [bundle.sources, { startView: browserStartViewSource('gtp-demo-start-view') }],
        layers: { crossOrigin: demoCrossOrigin },
        print: { organization: 'GIS 데모', attributions: demo.config.print?.attributions },
        areaAnalysis: { ...DEMO_AREA_ANALYSIS },
    }
}

/**
 * 화면 분할 UI 옵션(모듈 상수). 분할 Provider는 페이지(demo/map/page.tsx)가 바깥에 두므로 처음 개수·연동 값은 거기서 정하고, 여기는 셀렉트 선택지만 쓴다.
 * 1~4분할 전부 허용(칸이 좁아지는 처리는 패키지가 한다)
 */
export const DEMO_SPLIT: Readonly<MapShellSplitOptions> = Object.freeze({ counts: Object.freeze<GisMapSplitCount[]>([1, 2, 3, 4]) })

/**
 * 엔진이 만들어질 때마다 1번: 바람길 플러그인(가상 바람 소스를 읽는다).
 * 분할로 더 만든 지도(info.pane 1~3)에는 깔지 않는다 — 바람은 1번 지도만(칸마다 프레임을 만들면 느리다)
 */
export function setupDemoMap(map: GisMap, info: GisMapSetupInfo): void {
    if (info.pane !== 0) return
    map.use(createWindPlugin())
}

// ── 배경지도: VWorld(일반·위성) ↔ OpenStreetMap ──
// 데모 트리의 OSM 레이어는 layerName 'osm'(배경 모드 목록 밖 — 보통 레이어처럼 켜고 끈다). OSM을 고르면 배경 모드를 '없음'으로 두고 OSM을 켠다.

export const OSM_LAYER_NAME = 'osm'

function flattenGroups(groups: readonly LayerGroupDef[], out: LayerDef[]): LayerDef[] {
    for (const g of groups) {
        for (const l of g.layers) out.push(l)
        flattenGroups(g.children, out)
    }
    return out
}

export function osmLayerOf(tree: LayerTree | null): LayerDef | null {
    if (!tree) return null
    const all = flattenGroups(tree.groups, [...tree.ungroupedLayers])
    return all.find(l => l.layerName === OSM_LAYER_NAME) ?? null
}

/** OSM 레이어가 켜져 있나(트리가 없거나 OSM 레이어가 없으면 false) — 이 값이 true면 머리줄 일반/위성 단추는 숨긴다 */
export const selectOsmOn = (s: LayerTreeState): boolean => {
    const osm = osmLayerOf(s.tree)
    return osm ? (s.visible[osm.id] ?? osm.visible) : false
}

export function useOsmOn(): boolean {
    return useLayerTreeState(selectOsmOn)
}

export type DemoBasemapKind = 'vworld' | 'osm'

export function chooseDemoBasemap(map: GisMap, kind: DemoBasemapKind): void {
    const osm = osmLayerOf(map.layers.store.getState().tree)
    if (!osm) return
    const on = map.layers.isVisible(osm)
    if (kind === 'osm') {
        map.layers.setBasemapMode('none')
        if (!on) map.layers.toggleLayer(osm.id)
    } else {
        if (on) map.layers.toggleLayer(osm.id)
        map.layers.setBasemapMode('normal')
    }
}
