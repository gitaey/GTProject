'use client'

// 지도 화면 조립 셸(FE-5c, 옛 ui/MapView): 머리줄(브랜드·검색·배경지도·사용자) + 왼쪽 네비·패널 +
// 지도(지역명·도구 모음·모바일 레이어 버튼·바람 범례) + 상태바. 무엇을 보일지와 패널 목록·브랜드·상태바 좌표계는 호스트가 정한다.
// 지도 기능은 전부 엔진(GisMapProvider)이 맡고 위젯은 가장 가까운 엔진을 직접 읽는다. 셸에는 배치와 "열린 패널"(화면 상태)만 있다.
// 열린 패널은 셸의 로컬 state(엔진·패키지 전역은 모른다): 처음 값 = defaultPanel, 바뀌면 onPanelChange로 알린다
// → 페이지를 떠났다 돌아와도 이어지게 하려면 호스트(앱)가 기억했다가 다음 마운트 때 defaultPanel로 다시 넘긴다.
import { useCallback, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { GisMapView, useGisMap } from '../../react'
import { cx } from '../cx'
import { defaultPanels } from '../panels/defaultPanels'
import MapStatusBar from '../statusbar/MapStatusBar'
import MapToolbar from '../toolbar/MapToolbar'
import MobileLayerButton from '../mobile/MobileLayerButton'
import RegionBadge from '../overlay/RegionBadge'
import WindLegend from '../overlay/WindLegend'
import MapHeader from './MapHeader'
import MapRoot from './MapRoot'
import NavRail from './NavRail'
import SidePanel from './SidePanel'
import type { MapPanelDef, MapShellBrand } from './types'

export interface MapShellProps {
    /** 루트(gm-root gm-map-view)에 더할 class */
    className?: string
    /** 머리줄 로고 영역. false면 숨김. 기본: 중립 로고(DEFAULT_MAP_BRAND) */
    brand?: MapShellBrand | false
    /** 왼쪽 네비 버튼·패널 목록(순서대로). 기본 defaultPanels(레이어·TIFF·나만의지도). 호스트 패널은 이 배열에 더한다 */
    panels?: readonly MapPanelDef[]
    /** 처음 열 패널 id. null이면 닫힌 채. 기본: 첫 패널. panels에 없는 id(기억한 값이 낡은 경우 등)도 첫 패널. 마운트 때 한 번만 읽는다.
     *  권한은 보지 않는다 — 권한 없는 패널 id를 넘기지 않는 것은 호스트 몫(NavRail만 featureId로 버튼을 거른다) */
    defaultPanel?: string | null
    /** 열린 패널이 바뀔 때(닫으면 null). 호스트가 기억했다가 다음 마운트의 defaultPanel로 넘기면 이어서 열린다 */
    onPanelChange?: (panelId: string | null) => void
    /** 머리줄 전체. 기본 true */
    showHeader?: boolean
    /** 머리줄 통합 검색창. 기본 true */
    showSearch?: boolean
    /** 머리줄 오른쪽 배경지도 전환. 기본 true */
    showBasemapSwitcher?: boolean
    /** 머리줄 오른쪽 사용자 표시. 기본 true */
    showUser?: boolean
    /** 머리줄 오른쪽 내용 교체(주면 배경지도 전환·사용자 표시 대신) */
    headerRight?: ReactNode
    /** 왼쪽 네비(태블릿 이상). 기본 true. 끄면 패널을 열 버튼이 없다 — defaultPanel={null}과 함께 쓴다 */
    showNavRail?: boolean
    /** 지도 오른쪽 위 도구 모음(줌·바람길·그리기·측정·반경·초기화). 기본 true */
    showToolbar?: boolean
    /** 지도 위 가운데 지역명 배지. 기본 true */
    showRegionBadge?: boolean
    /** 모바일(768px 미만) 레이어 버튼·시트. 기본 true */
    showMobileLayerButton?: boolean
    /** 바람길 범례(바람길이 켜졌을 때). 기본 true */
    showWindLegend?: boolean
    /** 아래 상태바(경위도·표시 좌표계·축척·줌). 기본 true */
    showStatusBar?: boolean
    /** 상태바의 두 번째 좌표계. 기본 'EPSG:5186' */
    statusBarProjection?: string
    /** 지도 위에 더 올릴 호스트 위젯(지도 영역 안, 기본 위젯들 뒤) */
    children?: ReactNode
}

function initialPanelId(panels: readonly MapPanelDef[], defaultPanel: string | null | undefined): string | null {
    if (defaultPanel === null) return null
    if (defaultPanel !== undefined && panels.some(p => p.id === defaultPanel)) return defaultPanel
    return panels.length > 0 ? panels[0].id : null
}

export default function MapShell({
    className, brand, panels = defaultPanels, defaultPanel, onPanelChange,
    showHeader = true, showSearch = true, showBasemapSwitcher = true, showUser = true, headerRight,
    showNavRail = true, showToolbar = true, showRegionBadge = true, showMobileLayerButton = true, showWindLegend = true,
    showStatusBar = true, statusBarProjection, children,
}: MapShellProps) {
    const map = useGisMap()

    // 열린 패널: 같은 패널 아이콘을 다시 누르면 닫힘(옛 panelStore.togglePanel)
    const [activePanel, setActivePanel] = useState<string | null>(() => initialPanelId(panels, defaultPanel))
    const togglePanel = useCallback((panelId: string) => {
        setActivePanel(cur => (cur === panelId ? null : panelId))
    }, [])

    // 바뀐 값만 알린다(처음 값은 알리지 않음). 콜백은 ref로 들고 있어 매 렌더 새 함수를 받아도 effect가 다시 돌지 않는다
    const onPanelChangeRef = useRef(onPanelChange)
    onPanelChangeRef.current = onPanelChange
    const notifiedRef = useRef(activePanel)
    useEffect(() => {
        if (notifiedRef.current === activePanel) return
        notifiedRef.current = activePanel
        onPanelChangeRef.current?.(activePanel)
    }, [activePanel])

    // 마운트 뒤 호스트가 panels에서 열린 패널을 빼면 패널을 그리지 않는다(처음 값의 방어는 initialPanelId)
    const panel = activePanel === null ? null : panels.find(p => p.id === activePanel) ?? null

    return (
        <MapRoot className={cx('gm-map-view', className)}>
            {showHeader && (
                <MapHeader brand={brand} showSearch={showSearch} right={headerRight}
                    showBasemapSwitcher={showBasemapSwitcher} showUser={showUser} />
            )}

            <div className="gm-map-view__body">
                {showNavRail && <NavRail panels={panels} activePanel={activePanel} togglePanel={togglePanel} />}
                <SidePanel panel={panel} map={map} />

                {/* 커서 안내·텍스트 입력창은 엔진(코어 DOM)이 지도 요소 안에, 측정 툴팁은 ol.Overlay로 그린다 */}
                <div className="gm-map-view__stage">
                    <GisMapView className="gm-map-view__map" />
                    {showRegionBadge && <RegionBadge />}

                    {showToolbar && <MapToolbar />}
                    {showMobileLayerButton && <MobileLayerButton />}
                    {showWindLegend && <WindLegend />}
                    {children}
                </div>
            </div>

            {showStatusBar && <MapStatusBar projection={statusBarProjection} />}
        </MapRoot>
    )
}
