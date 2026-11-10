'use client'

// GTProject /map 전용 지도 설정(지도 패키지 밖 — 이식하지 않는다). page.tsx는 이 값으로 조립만 한다.
// 모두 모듈 상수·모듈 함수라 렌더마다 참조가 바뀌지 않는다(Provider config는 최초 1회만 읽고, setup은 엔진마다 1번).
import { Earth, MoreHorizontal } from 'lucide-react'
import { defaultLayerCrossOrigin, isVWorldUrl } from '@gtp/gis-map/core'
import type { GisDataInfoItem, GisMap, GisMapConfig, LayerCrossOriginResolver } from '@gtp/gis-map/core'
import { createWindPlugin } from '@gtp/gis-map/core/wind'
import { browserExpandedStorage } from '@gtp/gis-map/react'
import type { GisMapSetupInfo } from '@gtp/gis-map/react'
import { restSources } from '@gtp/gis-map/adapters/rest'
import { proxySources } from '@gtp/gis-map/adapters/proxy'
import { ImagePanel, SETTINGS_PANEL_ID, imagePanel, myMapPanel, windPanel } from '@gtp/gis-map/ui'
import type { MapPanelDef, MapShellBrand, MapShellLayerFloatOptions, MapShellSettingsOptions, MapShellSplitOptions } from '@gtp/gis-map/ui'
import { useAuthStore } from '@/stores/authStore'
import { useMenuStore } from '@/stores/menuStore'
import EtcPanel from './EtcPanel'
import {
    GTP_BRAND_PRIMARY,
    GTP_VIEW_CENTER,
    GTP_VIEW_MAX_ZOOM,
    GTP_VIEW_MIN_ZOOM,
    GTP_VIEW_ZOOM,
} from './gtpView'
import { readMapSession, rememberMapLayerFloat, rememberMapPanel, restoreMapSession } from './mapSession'

/** 앱 쪽 기억(mapSession)의 이름 — /map의 지도는 하나 */
const SESSION = 'gtp-map'

/**
 * GeoServer WMS 중 CORS(Access-Control-Allow-Origin)를 허용하는 것을 확인한 출처(2026-10-30 GetCapabilities·preflight 확인).
 * 지도 출력(PNG·PDF 저장)은 이 출처의 레이어에 crossOrigin 'anonymous'를 줘야 캔버스 저장이 된다.
 * 허용하지 않는 출처(예: 로컬 localhost:8600)에 켜면 그 레이어가 안 보이므로 목록에 있는 출처만 적용한다.
 */
const CORS_GEOSERVER_ORIGINS: readonly string[] = Object.freeze(['https://geo.gitaey-dev.com'])

/** 기본 규칙(VWorld 타일) + CORS를 확인한 GeoServer WMS. VWorld WMS는 CORS 미확인이라 끈다 */
const gtpLayerCrossOrigin: LayerCrossOriginResolver = (layer, url) => {
    const base = defaultLayerCrossOrigin(layer, url)
    if (base) return base
    if (layer.type === 'WMS' && !isVWorldUrl(url) && CORS_GEOSERVER_ORIGINS.some(o => url.startsWith(o + '/'))) return 'anonymous'
    return null
}

/**
 * 엔진 설정 — 세종특별자치시청 부근 중심, 줌 10(7~21), 브랜드 주 색.
 * 데이터는 sources(어댑터): 짝 백엔드 REST(레이어 트리·개인 레이어 설정·나만의지도·GeoTIFF·바람길) + 호스트 프록시(주소 검색·필지·지역명·범례·WFS).
 * 레이어 그룹 펼침 상태는 localStorage 'layer-group-expanded'(/map-admin/layer와 같은 키 → 펼침 상태 공유)
 */
export const GTP_MAP_CONFIG: Omit<GisMapConfig, 'target' | 'host'> = {
    view: {
        center: [GTP_VIEW_CENTER[0], GTP_VIEW_CENTER[1]],
        zoom: GTP_VIEW_ZOOM,
        minZoom: GTP_VIEW_MIN_ZOOM,
        maxZoom: GTP_VIEW_MAX_ZOOM,
    },
    theme: { primary: GTP_BRAND_PRIMARY },
    sources: [restSources(), proxySources()],
    layers: { expandedStorage: browserExpandedStorage('layer-group-expanded'), crossOrigin: gtpLayerCrossOrigin },
    // 지도 출력: 머리줄 기관명. 출처는 켜진 레이어에 vworld.kr이 있으면 기본 문구('배경지도: 브이월드(국토교통부)')가 자동으로 붙는다
    print: { organization: 'SIS-Map' },
}

/** 머리줄 로고 영역 */
export const GTP_BRAND: Readonly<MapShellBrand> = Object.freeze({ title: 'SIS-Map', subtitle: 'GIS', logo: <Earth size={16} /> })

/** '기타' 패널(CSV→XLSX 변환기 — 지도 기능이 아니라 GTProject 전용, xlsx 사용) */
const ETC_PANEL: Readonly<MapPanelDef> = Object.freeze({
    id: 'etc', label: '기타', icon: MoreHorizontal, featureId: 'map.panel.etc', render: () => <EtcPanel />,
})

/**
 * TIFF 업로드 안내 값. 최대 2GB = 백엔드 spring.servlet.multipart.max-file-size(application.yml). 운영 nginx의 client_max_body_size가
 * 이보다 작으면 그 값이 실제 한도다(서버 설정 — 저장소 밖). 500MB는 실측이 아니라 "오래 걸릴 수 있다"는 안내 기준
 */
const TIFF_MAX_UPLOAD_BYTES = 2 * 1024 * 1024 * 1024
const TIFF_SLOW_UPLOAD_BYTES = 500 * 1024 * 1024

/** 패키지 기본 TIFF 패널에 용량 안내를 더한 호스트용 패널(id·권한·아이콘은 그대로) */
const GTP_IMAGE_PANEL: Readonly<MapPanelDef> = Object.freeze({
    ...imagePanel,
    render: () => <ImagePanel maxUploadBytes={TIFF_MAX_UPLOAD_BYTES} slowUploadBytes={TIFF_SLOW_UPLOAD_BYTES} />,
})

/**
 * 네비 패널(위에서 아래 순서): 나만의지도·TIFF(패키지 기본 중 둘) + 바람지도(바람길 플러그인을 setupGtpMap에서 설치하므로) + 기타.
 * 레이어는 네비가 아니라 지도 오른쪽 위 "레이어 목록" 플로팅 패널이다(GTP_LAYER_FLOAT) — 여기서 뺀다
 */
export const GTP_PANELS: readonly MapPanelDef[] = Object.freeze([myMapPanel, GTP_IMAGE_PANEL, windPanel, ETC_PANEL])

/** 레이어 목록 플로팅 패널(모듈 상수). 권한은 기본 map.panel.layer(기존 레이어 메뉴와 같은 ID) */
export const GTP_LAYER_FLOAT: Readonly<MapShellLayerFloatOptions> = Object.freeze({})

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
    // 설정 패널은 셸이 만든다(GTP_PANELS에 없다). 메뉴 권한 ID가 없어 로그인한 누구나 보인다
    if (panelId === SETTINGS_PANEL_ID) return true
    const panel = GTP_PANELS.find(p => p.id === panelId)
    if (!panel) return false
    if (panel.featureId == null) return true
    const { loaded, isAllowed } = useMenuStore.getState()
    return !loaded || isAllowed(panel.featureId)
}

/** 데이터 기준 정보 끝에 붙는 배경지도 안내 한 줄(요청 없는 정적 항목 — VWorld는 기준일 API가 없다) */
const VWORLD_INFO: Readonly<GisDataInfoItem> = Object.freeze({
    id: 'vworld-basemap', label: '배경지도·위성영상', source: '브이월드(국토교통부 공간정보 오픈플랫폼)', version: null,
    baseDate: null, loadedAt: null, updateCycle: '제공처 수시 갱신', status: 'ready', stale: false, note: '기준일은 브이월드 공지를 따릅니다',
})

/**
 * 설정 패널 설정(모듈 상수). 시작 화면은 restSources()에 자동 포함된 계정 저장(restStartView)을 그대로 쓴다 — 추가 코드 없음.
 * 메뉴 권한 ID는 만들지 않는다(settings.featureId를 안 준다 → 로그인한 누구나). 화면 테마 카드는 켠다(theme 생략 = 노출).
 * 선택값은 page.tsx의 useGtpMapTheme(_gtp/gtpTheme.ts)가 대시보드와 따로 기억한다
 */
export const GTP_SETTINGS: Readonly<MapShellSettingsOptions> = Object.freeze({
    theme: true,
    staticDataInfo: Object.freeze([VWORLD_INFO]),
})

/**
 * 화면 분할 설정(모듈 상수 — MapShell이 참조로 비교하지 않아도 렌더마다 새 객체를 만들지 않는다). 처음엔 분할 없음, 화면 연동 켬.
 * 분할 상태는 기억하지 않는다(새로고침·페이지 이동 뒤에는 분할 없음)
 */
export const GTP_SPLIT: Readonly<MapShellSplitOptions> = Object.freeze({ defaultCount: 1, defaultSync: true })

/**
 * 엔진이 만들어질 때마다 1번(StrictMode에서 엔진을 다시 만들면 그 엔진에 다시): 바람길 플러그인 + 떠나기 전 그리기·도구 상태 되살리기.
 * 분할로 더 만든 지도(info.pane 1~3)에는 둘 다 하지 않는다 — 바람길은 1번 지도만(칸마다 프레임을 받으면 느리다),
 * 앱 기억(mapSession)은 이름 하나(SESSION)에 지도 하나분이라 1번만 기억한다(2~4번이 덮어쓰지 않게)
 */
export function setupGtpMap(map: GisMap, info: GisMapSetupInfo): void {
    if (info.pane !== 0) return
    map.use(createWindPlugin())
    restoreMapSession(map, SESSION, sessionOwner())
}

/** 처음 들어왔을 때 열어 두는 왼쪽 패널 */
const DEFAULT_PANEL_ID = 'mymap'

/**
 * 처음 열 패널. 같은 사용자가 떠나기 전에 열어 둔 패널이 있으면 그것(닫아 두고 떠났으면 닫힘 null).
 * 처음 들어오면·다른 사용자의 기억이면, 또 기억한 패널을 지금 사용자가 볼 수 없으면(권한이 없음·목록에서 빠짐 —
 * 예전에 기억한 'layer' 포함) 나만의지도(DEFAULT_PANEL_ID). 그것도 볼 수 없으면 닫힘
 */
export function gtpInitialPanel(): string | null {
    const panel = readMapSession(SESSION, sessionOwner()).panel
    if (panel === null) return null
    if (panel !== undefined && isGtpPanelVisible(panel)) return panel
    return isGtpPanelVisible(DEFAULT_PANEL_ID) ? DEFAULT_PANEL_ID : null
}

/** MapShell onPanelChange */
export function rememberGtpPanel(panel: string | null): void {
    rememberMapPanel(SESSION, panel, sessionOwner())
}

/** 레이어 목록 처음 열림 여부(같은 사용자의 떠나기 전 값). 처음 들어오면 닫힘(지도 패키지 기본은 열림이지만 이 화면은 닫아 둔다) */
export function gtpInitialLayerFloatOpen(): boolean {
    return readMapSession(SESSION, sessionOwner()).layerFloatOpen ?? false
}

/** MapShell onLayerFloatOpenChange */
export function rememberGtpLayerFloat(open: boolean): void {
    rememberMapLayerFloat(SESSION, open, sessionOwner())
}
