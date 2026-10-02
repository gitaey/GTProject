'use client'

// GTProject /map 전용 지도 설정(지도 패키지 밖 — 이식하지 않는다). page.tsx는 이 값으로 조립만 한다.
// 모두 모듈 상수·모듈 함수라 렌더마다 참조가 바뀌지 않는다(Provider config는 최초 1회만 읽고, setup은 엔진마다 1번).
import { Earth, MoreHorizontal } from 'lucide-react'
import type { GisMap, GisMapConfig } from '@gtp/gis-map/core'
import { createWindPlugin } from '@gtp/gis-map/core/wind'
import { browserExpandedStorage } from '@gtp/gis-map/react'
import { restSources } from '@gtp/gis-map/adapters/rest'
import { proxySources } from '@gtp/gis-map/adapters/proxy'
import { defaultPanels } from '@gtp/gis-map/ui'
import type { MapPanelDef, MapShellBrand } from '@gtp/gis-map/ui'
import { useAuthStore } from '@/stores/authStore'
import { useMenuStore } from '@/stores/menuStore'
import EtcPanel from './EtcPanel'
import { readMapSession, rememberMapPanel, restoreMapSession } from './mapSession'

/** 앱 쪽 기억(mapSession)의 이름 — /map의 지도는 하나 */
const SESSION = 'gtp-map'

/**
 * 엔진 설정 — 세종특별자치시청 부근 중심, 줌 10(7~21), 브랜드 주 색.
 * 데이터는 sources(어댑터): 짝 백엔드 REST(레이어 트리·개인 레이어 설정·나만의지도·GeoTIFF·바람길) + 호스트 프록시(주소 검색·필지·지역명·범례·WFS).
 * 레이어 그룹 펼침 상태는 localStorage 'layer-group-expanded'(/map-admin/layer와 같은 키 → 펼침 상태 공유)
 */
export const GTP_MAP_CONFIG: Omit<GisMapConfig, 'target' | 'host'> = {
    view: { center: [127.289, 36.48], zoom: 10, minZoom: 7, maxZoom: 21 },
    theme: { primary: '#F26722' },
    sources: [restSources(), proxySources()],
    layers: { expandedStorage: browserExpandedStorage('layer-group-expanded') },
}

/** 머리줄 로고 영역 */
export const GTP_BRAND: Readonly<MapShellBrand> = Object.freeze({ title: 'SIS-Map', subtitle: 'GIS', logo: <Earth size={16} /> })

/** '기타' 패널(CSV→XLSX 변환기 — 지도 기능이 아니라 GTProject 전용, xlsx 사용) */
const ETC_PANEL: Readonly<MapPanelDef> = Object.freeze({
    id: 'etc', label: '기타', icon: MoreHorizontal, featureId: 'map.panel.etc', render: () => <EtcPanel />,
})

/** 네비 패널: 패키지 기본 3개(레이어·TIFF·나만의지도) + 기타 */
export const GTP_PANELS: readonly MapPanelDef[] = Object.freeze([...defaultPanels, ETC_PANEL])

/**
 * 기억(mapSession)의 주인 = 지금 로그인한 사용자 id(로그인 전이면 '').
 * 같은 탭에서 다른 사용자로 바뀌면 mapSession이 앞 사용자의 기억을 지운다 → 패널·그리기 스타일·도구·반경이 이어지지 않는다
 */
function sessionOwner(): string {
    return useAuthStore.getState().user?.userId ?? ''
}

/**
 * 지금 사용자가 네비에서 볼 수 있는 패널인가 — NavRail과 같은 규칙·같은 값(호스트 isFeatureAllowed·permissionsReady = menuStore):
 * GTP_PANELS에 있고, featureId가 없거나, 메뉴 권한을 아직 못 받았거나(이때 네비도 전부 보인다), 권한이 있으면 true
 */
function isGtpPanelVisible(panelId: string): boolean {
    const panel = GTP_PANELS.find(p => p.id === panelId)
    if (!panel) return false
    if (panel.featureId == null) return true
    const { loaded, isAllowed } = useMenuStore.getState()
    return !loaded || isAllowed(panel.featureId)
}

/** 엔진이 만들어질 때마다 1번(StrictMode에서 엔진을 다시 만들면 그 엔진에 다시): 바람길 플러그인 + 떠나기 전 그리기·도구 상태 되살리기 */
export function setupGtpMap(map: GisMap): void {
    map.use(createWindPlugin())
    restoreMapSession(map, SESSION, sessionOwner())
}

/**
 * 처음 열 패널(같은 사용자가 떠나기 전에 열어 둔 패널). 처음 들어오면·다른 사용자의 기억이었으면 undefined → MapShell 기본 = 첫 패널 '레이어'.
 * 기억한 패널을 지금 사용자가 볼 수 없으면(권한이 없음·목록에서 빠짐) 역시 undefined
 */
export function gtpInitialPanel(): string | null | undefined {
    const panel = readMapSession(SESSION, sessionOwner()).panel
    if (panel === undefined || panel === null) return panel
    return isGtpPanelVisible(panel) ? panel : undefined
}

/** MapShell onPanelChange */
export function rememberGtpPanel(panel: string | null): void {
    rememberMapPanel(SESSION, panel, sessionOwner())
}
