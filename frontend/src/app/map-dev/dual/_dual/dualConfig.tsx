'use client'

// /map-dev/dual(FE-6a 검증용) — 지도 2개의 설정. 모두 모듈 상수·모듈 함수라 렌더마다 참조가 바뀌지 않는다.
// 두 지도는 중심좌표·테마 색·브랜드·패널 목록·처음 패널·상태바 좌표계·앱 기억 이름(mapSession)이 서로 다르고,
// 호스트 객체(인증·주소·키·권한)와 데이터 소스(어댑터, 상태 없음)는 같은 것을 함께 쓴다.
// 바람길은 쓰지 않는다: 플러그인을 설치하지 않고(setup), 툴바 버튼은 권한 값으로 숨기고(hideWindTool), 범례도 끈다(showWindLegend=false).
// (로컬 개발 서버에서 /api/wind/latest가 백엔드를 멈춘 사고가 있었다 — .claude/rules/map.md 함정)
import { Building2, MapPinned } from 'lucide-react'
import type { GisMap, GisMapConfig, GisMapSourcesInput, PartialGisMapHost } from '@gtp/gis-map/core'
import { restSources } from '@gtp/gis-map/adapters/rest'
import { proxySources } from '@gtp/gis-map/adapters/proxy'
import { defaultPanels, imagePanel, layerPanel } from '@gtp/gis-map/ui'
import type { MapPanelDef, MapShellBrand } from '@gtp/gis-map/ui'
import { readMapSession, rememberMapPanel, restoreMapSession } from '@/app/map/_gtp/mapSession'
import { useAuthStore } from '@/stores/authStore'

export type DualSide = 'A' | 'B'

/** 바람길 도구 권한 ID(MapToolbar가 이 값으로 버튼을 숨긴다) */
export const WIND_FEATURE_ID = 'map.tool.wind'

/**
 * 호스트 값에서 바람길 도구만 막는다. 나머지 권한은 원래 호스트를 따른다(권한 로딩 전이면 전부 허용 — 옛 동작).
 * permissionsReady를 true로 고정해야 권한 로딩 전에도 바람길 버튼이 숨는다(false면 위젯이 전부 표시한다).
 */
export function hideWindTool(host: PartialGisMapHost): PartialGisMapHost {
    const allowed = host.isFeatureAllowed
    const ready = host.permissionsReady ?? true
    return {
        ...host,
        permissionsReady: true,
        isFeatureAllowed: featureId => featureId !== WIND_FEATURE_ID && (!ready || !allowed || allowed(featureId)),
    }
}

/** 두 지도가 함께 쓰는 데이터 소스(어댑터는 상태가 없어 공유해도 된다 — 설계 3절) */
const SHARED_SOURCES: GisMapSourcesInput = [restSources(), proxySources()]

type EngineConfig = Omit<GisMapConfig, 'target' | 'host'>

/** 설정 객체를 얼린다(타입은 그대로 — 튜플 center가 number[]로 넓어지지 않게) */
function freezeConfig(config: EngineConfig): Readonly<EngineConfig> {
    return Object.freeze(config)
}

export interface DualSideDef {
    side: DualSide
    /** 앱 쪽 기억(mapSession) 이름 — 지도마다 달라야 서로의 기억이 섞이지 않는다 */
    session: string
    config: Readonly<EngineConfig>
    brand: Readonly<MapShellBrand>
    panels: readonly MapPanelDef[]
    statusBarProjection: string
    showUser: boolean
    showMobileLayerButton: boolean
    /** GisMapProvider setup: 앱 기억 되살리기만(바람길 플러그인 없음) */
    setup: (map: GisMap) => void
    /** 처음 열 패널(기억이 있으면 그 값, 없으면 지도별 기본값) */
    initialPanel: () => string | null
    onPanelChange: (panelId: string | null) => void
}

/** 앱 기억의 주인 = 지금 로그인한 사용자 id(/map과 같은 규칙 — 다른 사용자로 바뀌면 앞 사용자의 기억을 지운다) */
function sessionOwner(): string {
    return useAuthStore.getState().user?.userId ?? ''
}

function sideDef(d: Omit<DualSideDef, 'setup' | 'initialPanel' | 'onPanelChange'> & { firstPanel: string | null }): Readonly<DualSideDef> {
    const { firstPanel, ...rest } = d
    return Object.freeze({
        ...rest,
        setup: (map: GisMap) => restoreMapSession(map, d.session, sessionOwner()),
        initialPanel: () => {
            const saved = readMapSession(d.session, sessionOwner()).panel
            // 기억이 없거나, 기억한 패널이 이 지도의 목록에 없으면 지도별 기본 패널
            if (saved === undefined || (saved !== null && !rest.panels.some(p => p.id === saved))) return firstPanel
            return saved
        },
        onPanelChange: (panelId: string | null) => rememberMapPanel(d.session, panelId, sessionOwner()),
    })
}

/** 왼쪽: 세종·기본 주황 테마·기본 패널 3개·레이어 패널로 시작·상태바 EPSG:5186 */
export const SIDE_A = sideDef({
    side: 'A',
    session: 'dev-dual-a',
    config: freezeConfig({
        view: { center: [127.289, 36.48], zoom: 12, minZoom: 7, maxZoom: 21 },
        sources: SHARED_SOURCES,
    }),
    brand: Object.freeze({ title: '지도 A', subtitle: '세종 · 주황', logo: <MapPinned size={16} /> }),
    panels: defaultPanels,
    firstPanel: 'layer',
    statusBarProjection: 'EPSG:5186',
    showUser: true,
    showMobileLayerButton: true,
})

/** 오른쪽: 서울·파랑 테마(config.theme.primary → 이 지도 루트에만 CSS 변수)·패널 2개·TIFF 패널로 시작·상태바 EPSG:5179·사용자 표시 끔 */
export const SIDE_B = sideDef({
    side: 'B',
    session: 'dev-dual-b',
    config: freezeConfig({
        view: { center: [126.978, 37.5665], zoom: 12, minZoom: 7, maxZoom: 21 },
        theme: { primary: '#0055aa' },
        sources: SHARED_SOURCES,
    }),
    brand: Object.freeze({ title: '지도 B', subtitle: '서울 · 파랑', logo: <Building2 size={16} /> }),
    panels: Object.freeze([layerPanel, imagePanel]),
    firstPanel: 'image',
    statusBarProjection: 'EPSG:5179',
    showUser: false,
    showMobileLayerButton: false,
})
