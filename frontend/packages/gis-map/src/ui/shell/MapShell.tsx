'use client'

// 지도 화면 조립 셸(FE-5c, 옛 ui/MapView): 머리줄(브랜드·검색·배경지도·사용자) + 왼쪽 네비·패널 +
// 지도(지역명·도구 모음·모바일 레이어 버튼·바람 범례) + 상태바. 무엇을 보일지와 패널 목록·브랜드·상태바 좌표계는 호스트가 정한다.
// 지도 기능은 전부 엔진(GisMapProvider)이 맡고 위젯은 가장 가까운 엔진을 직접 읽는다. 셸에는 배치와 "열린 패널"(화면 상태)만 있다.
// 열린 패널은 셸의 로컬 state(엔진·패키지 전역은 모른다): 처음 값 = defaultPanel, 바뀌면 onPanelChange로 알린다
// → 페이지를 떠났다 돌아와도 이어지게 하려면 호스트(앱)가 기억했다가 다음 마운트 때 defaultPanel로 다시 넘긴다.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Settings } from 'lucide-react'
import type { ReactNode } from 'react'
import type { GisMapAppearance, StartViewState } from '../../core'
import { GisMapSplitProvider, GisMapView, useGisMap, useGisMapSplit, useStoreValue } from '../../react'
import type { GisMapSplitCount, GisMapSplitInitialState } from '../../react'
import { cx } from '../cx'
import { defaultPanels } from '../panels/defaultPanels'
import MapStatusBar from '../statusbar/MapStatusBar'
import MapToolbar from '../toolbar/MapToolbar'
import MobileLayerButton from '../mobile/MobileLayerButton'
import RegionBadge from '../overlay/RegionBadge'
import WindLegend from '../overlay/WindLegend'
import MapSplitSelect from '../split/MapSplitSelect'
import SplitStage from '../split/SplitStage'
import SettingsPanel from '../settings/SettingsPanel'
import MapHeader from './MapHeader'
import MapRoot from './MapRoot'
import NavRail from './NavRail'
import SidePanel from './SidePanel'
import { SETTINGS_PANEL_ID } from './types'
import type { MapPanelDef, MapShellBrand, MapShellSettingsOptions, MapUserMenuItem } from './types'

/** 화면 분할 옵션(MapShell split). 전부 선택 */
export interface MapShellSplitOptions {
    /** 처음 분할 수. 기본 1. 바깥에 GisMapSplitProvider가 있으면 무시(그 Provider 값을 쓴다) */
    defaultCount?: GisMapSplitCount
    /** 분할 수가 바뀔 때(처음 값은 알리지 않음). 바깥 Provider가 있으면 무시 */
    onCountChange?: (count: GisMapSplitCount) => void
    /** 화면 연동 처음 값. 기본 true. 바깥 Provider가 있으면 무시 */
    defaultSync?: boolean
    /** 새로 만든 지도의 처음 상태. 기본 'view-basemap'(활성 지도의 시점·배경지도만 복사). 바깥 Provider가 있으면 무시 */
    initialPaneState?: GisMapSplitInitialState
    /** 셀렉트 선택지(순서대로). 기본 [1, 2, 3, 4] */
    counts?: readonly GisMapSplitCount[]
    /** 이보다 좁은 칸은 촘촘 모드(번호만·작은 배지). 기본 400 */
    compactPaneWidth?: number
    /** 이보다 좁으면 2·3분할을 가로 띠로 쌓는다. 기본 280 */
    minPaneWidth?: number
}

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
    /** 머리줄 사용자 표시를 누르면 펼쳐지는 메뉴 항목(호스트가 만든다 — 예: 대시보드로 가기·로그아웃). 없거나 비면 사용자 표시는 그대로.
     *  모바일에서도 쓸 수 있다(원 모양만 남는다). headerRight를 주면 사용자 표시가 없으므로 쓰이지 않는다 */
    userMenuItems?: readonly MapUserMenuItem[]
    /** 왼쪽 네비(태블릿 이상). 기본 true. 끄면 패널을 열 버튼이 없다 — defaultPanel={null}과 함께 쓴다 */
    showNavRail?: boolean
    /** 지도 오른쪽 위 도구 모음(줌·바람길·그리기·측정·반경·필지 정보·영역 분석·출력·초기화). 기본 true */
    showToolbar?: boolean
    /** 도구 모음의 출력(PNG·PDF·인쇄) 단추. 기본 true — 메뉴 권한 map.tool.print도 통과해야 보인다 */
    showPrint?: boolean
    /** 도구 모음의 영역 분석 단추. 기본 true — 메뉴 권한 map.tool.area-analysis도 통과해야 보인다 */
    showAreaAnalysis?: boolean
    /** 도구 모음의 필지 정보 단추(필지를 눌러 속성·건물 보기). 기본 true — 메뉴 권한 map.tool.parcel-info도 통과하고 parcel.infoAt 소스가 있어야 보인다 */
    showParcelInfo?: boolean
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
    /**
     * 화면 분할(머리줄 셀렉트 + 지도 2~4개). 기본 false = 지금과 완전히 같다. true = 기본 옵션.
     * 바깥에 GisMapSplitProvider가 있으면 새로 만들지 않고 그것을 쓴다(셸을 다시 마운트해도 분할 유지).
     * 붙이기(attachTo) 모드의 Provider 안에서는 분할을 쓸 수 없어 셀렉트도 나오지 않는다.
     * 지도를 하나 더 만들 때마다 setup이 불리므로 호스트 setup은 info.pane으로 번호를 구분한다
     */
    split?: boolean | MapShellSplitOptions
    /**
     * 설정 패널(네비 아래 '설정' 버튼): 화면 테마·시작 화면·데이터 기준 정보 카드. 기본 true. false면 버튼도 없다.
     * 객체면 카드 켜고 끄기·정적 데이터 항목·권한 기능 ID(MapShellSettingsOptions). 모양을 바꾸려면 렌더마다 새 객체를 만들지 말고 모듈 상수로 둔다
     */
    settings?: boolean | MapShellSettingsOptions
    /** 화면 밝기 모드(제어). 주면 이 값을 따르고 바꾸면 onThemeChange만 부른다. 안 주면 defaultTheme(기본 'light')에서 시작해 셸이 기억한다 */
    theme?: GisMapAppearance
    defaultTheme?: GisMapAppearance
    onThemeChange?: (value: GisMapAppearance) => void
    /** 지도 위에 더 올릴 호스트 위젯(지도 영역 안, 기본 위젯들 뒤) */
    children?: ReactNode
}

/** settings={true}일 때 쓰는 빈 옵션(얼린 상수 — 렌더마다 새 객체를 만들지 않는다) */
const EMPTY_SETTINGS: Readonly<MapShellSettingsOptions> = Object.freeze({})

const selectHolding = (s: StartViewState): boolean => s.holding

function initialPanelId(panels: readonly MapPanelDef[], defaultPanel: string | null | undefined, settingsPanel: MapPanelDef | null): string | null {
    if (defaultPanel === null) return null
    if (defaultPanel !== undefined && (panels.some(p => p.id === defaultPanel) || (settingsPanel !== null && defaultPanel === settingsPanel.id))) return defaultPanel
    return panels.length > 0 ? panels[0].id : null
}

/**
 * split을 켜면 분할 Provider 아래에서 그린다. 바깥에 이미 있으면 그것을 쓰고(새로 만들지 않는다), 없으면 여기서 만든다.
 * split을 안 주면 분할 코드는 아무것도 거치지 않는다(MapShellView를 그대로 그린다 — DOM·동작 변화 없음).
 */
export default function MapShell(props: MapShellProps) {
    const outerSplit = useGisMapSplit()
    const { split } = props
    if (!split) return <MapShellView {...props} />
    const view = <MapShellView {...props} />
    if (outerSplit) return view
    const options = typeof split === 'object' ? split : undefined
    return (
        <GisMapSplitProvider defaultCount={options?.defaultCount} onCountChange={options?.onCountChange} defaultSync={options?.defaultSync}
            initialPaneState={options?.initialPaneState}>
            {view}
        </GisMapSplitProvider>
    )
}

function MapShellView({
    className, brand, panels = defaultPanels, defaultPanel, onPanelChange,
    showHeader = true, showSearch = true, showBasemapSwitcher = true, showUser = true, headerRight, userMenuItems,
    showNavRail = true, showToolbar = true, showPrint = true, showAreaAnalysis = true, showParcelInfo = true, showRegionBadge = true, showMobileLayerButton = true, showWindLegend = true,
    showStatusBar = true, statusBarProjection, split, settings = true, theme: themeProp, defaultTheme, onThemeChange, children,
}: MapShellProps) {
    const map = useGisMap()

    // 화면 테마: 제어(theme prop) 또는 셸이 기억(defaultTheme). 서버 렌더 첫 화면은 라이트
    const [themeState, setThemeState] = useState<GisMapAppearance>(defaultTheme ?? 'light')
    const theme = themeProp ?? themeState
    const onThemeChangeRef = useRef(onThemeChange)
    onThemeChangeRef.current = onThemeChange
    const controlled = themeProp !== undefined
    const setTheme = useCallback((value: GisMapAppearance) => {
        if (!controlled) setThemeState(value)
        onThemeChangeRef.current?.(value)
    }, [controlled])

    // 설정 패널 정의(셸 안에서 만든다 — panels 목록에는 없다). 옵션·테마가 바뀔 때만 새로
    const settingsOptions = settings === false ? null : settings === true ? EMPTY_SETTINGS : settings
    const settingsPanel = useMemo<MapPanelDef | null>(() => {
        if (!settingsOptions) return null
        return {
            id: SETTINGS_PANEL_ID, label: settingsOptions.label ?? '설정', icon: Settings, featureId: settingsOptions.featureId, scope: 'shell',
            render: () => <SettingsPanel options={settingsOptions} theme={theme} onThemeChange={setTheme} />,
        }
    }, [settingsOptions, theme, setTheme])

    // 저장한 시작 화면을 기다리며 지도 그림을 미루는 동안 지도 칸에 옅은 바탕(짧게 끝나면 안 보인다)
    const startHolding = useStoreValue(map?.startView.store, selectHolding, false)

    // 화면 분할: split을 켰고 분할 Provider가 쓸 수 있을 때만(붙이기 모드·Provider 없음이면 분할 없는 셸과 같다). 칸이 2개 이상일 때만 격자
    const splitOptions = typeof split === 'object' ? split : undefined
    const splitState = useGisMapSplit()
    const splitUi = !!split && splitState !== null && splitState.available
    const splitActive = splitUi && splitState.count > 1

    // 열린 패널: 같은 패널 아이콘을 다시 누르면 닫힘(옛 panelStore.togglePanel)
    const [activePanel, setActivePanel] = useState<string | null>(() => initialPanelId(panels, defaultPanel, settingsPanel))
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
    const panel = activePanel === null ? null : panels.find(p => p.id === activePanel) ?? (settingsPanel !== null && activePanel === settingsPanel.id ? settingsPanel : null)

    return (
        <MapRoot className={cx('gm-map-view', className)} theme={theme}>
            {showHeader && (
                <MapHeader brand={brand} showSearch={showSearch} right={headerRight}
                    showBasemapSwitcher={showBasemapSwitcher} showUser={showUser} userMenuItems={userMenuItems}
                    split={splitUi ? <MapSplitSelect counts={splitOptions?.counts} /> : undefined} />
            )}

            <div className="gm-map-view__body">
                {showNavRail && <NavRail panels={panels} activePanel={activePanel} togglePanel={togglePanel} settingsPanel={settingsPanel} />}
                <SidePanel panel={panel} map={map} split={splitActive} />

                {/* 커서 안내·텍스트 입력창은 엔진(코어 DOM)이 지도 요소 안에, 측정 툴팁은 ol.Overlay로 그린다 */}
                <div className="gm-map-view__stage">
                    {/* 분할 중에는 칸마다 지도·번호 칩·(활성 칸) 지역명·바람 범례를 SplitStage가 그린다. 분할 없음 = 지금 그대로 */}
                    {splitActive
                        ? <SplitStage showRegionBadge={showRegionBadge} showWindLegend={showWindLegend}
                            compactPaneWidth={splitOptions?.compactPaneWidth} minPaneWidth={splitOptions?.minPaneWidth} />
                        : <GisMapView className="gm-map-view__map" />}
                    {startHolding && <div className="gm-map-pending" role="status" aria-label="지도를 준비하는 중" />}
                    {showRegionBadge && !splitActive && <RegionBadge />}

                    {/* 도구 모음·모바일 레이어 버튼은 무대에 하나 — 대상은 활성 지도. 활성 지도가 바뀌면 key로 새로 마운트해
                        열려 있던 그리기·출력·영역 분석 패널을 닫고 옛 지도의 틀·결과를 정리한다 */}
                    {showToolbar && (
                        <MapToolbar key={splitActive && map ? map.id : undefined}
                            targetLabel={splitActive ? '지도 ' + (splitState.activeIndex + 1) : undefined}
                            showPrint={showPrint} showAreaAnalysis={showAreaAnalysis} showParcelInfo={showParcelInfo} />
                    )}
                    {showMobileLayerButton && <MobileLayerButton />}
                    {showWindLegend && !splitActive && <WindLegend />}
                    {children}
                </div>
            </div>

            {showStatusBar && <MapStatusBar projection={statusBarProjection} />}
        </MapRoot>
    )
}
