// 셸(MapShell)이 호스트에게서 받는 값의 타입 — 패널 정의·브랜드
import type { ComponentType, ReactNode } from 'react'
import type { GisDataInfoItem, GisFeatureId, GisMap } from '../../core'

/** 왼쪽 네비 버튼 하나 + 그 버튼이 여는 패널 내용 */
export interface MapPanelDef {
    /** 패널 id(열린 패널 기억·defaultPanel에 쓴다). 패널 목록 안에서 겹치면 안 된다 */
    id: string
    /** 네비 버튼 글자 */
    label: string
    /** 네비 버튼 아이콘(lucide 아이콘 컴포넌트 등). size={20}으로 그린다 */
    icon: ComponentType<{ size?: number }>
    /** 권한 기능 ID. host.isFeatureAllowed가 false면 네비에서 숨긴다(권한 로딩 전엔 보임). 없으면 항상 보임 */
    featureId?: GisFeatureId | string
    /** 패널 내용. 패널이 열려 있는 동안 렌더마다 부른다 — 컴포넌트 요소를 돌려주면 된다(예: () => <LayerPanel />) */
    render: (map: GisMap | null) => ReactNode
    /** 'shell' = 화면 전체에 걸린 패널(설정 등). 화면 분할 중에도 위에 "대상 지도" 탭을 그리지 않고 지도가 바뀌어도 다시 마운트하지 않는다. 기본 'map' */
    scope?: 'map' | 'shell'
}

/** 레이어 목록 플로팅 패널 내용 교체(render)에 넘기는 값 */
export interface LayerFloatRenderContext {
    /** 패널 닫기(호스트 render가 자기 닫기 단추를 그릴 때) */
    close: () => void
}

/** 레이어 목록 플로팅 패널(오른쪽 끝 드로어) 옵션(MapShell layerFloat). 전부 선택. 모듈 상수로 둔다(렌더마다 새 객체 금지) */
export interface MapShellLayerFloatOptions {
    /** 권한 기능 ID. 기본 'map.panel.layer'(왼쪽 레이어 메뉴와 같은 ID — 새 메뉴 ID를 만들지 않는다). null이면 검사 안 함 */
    featureId?: GisFeatureId | string | null
    /** 단추 글자·패널 접근 이름. 기본 '레이어 목록' */
    label?: string
    /** 패널 내용 교체. 기본 (map, { close }) => <LayerPanel onClose={close} /> */
    render?: (map: GisMap | null, ctx: LayerFloatRenderContext) => ReactNode
    /** panels 안의 패키지 기본 레이어 패널(layerPanel 객체, === 비교)을 왼쪽 네비에서 뺀다. 기본 true */
    removeFromPanels?: boolean
}

/** 셸이 만드는 설정 패널의 id(열린 패널 기억·defaultPanel에 쓴다 — panels 목록에는 없다) */
export const SETTINGS_PANEL_ID = 'gm-settings'

/** 설정 패널 옵션(MapShell settings). 전부 선택 */
export interface MapShellSettingsOptions {
    /** 이 권한 기능 ID가 막으면 네비의 설정 버튼이 숨는다. 기본 없음(로그인한 누구나 — 새 메뉴 ID를 만들면 메뉴 설정이 저장된 역할에서 안 보이는 함정이 생긴다) */
    featureId?: GisFeatureId | string
    /** 네비 버튼·패널 제목. 기본 '설정' */
    label?: string
    /** 화면 테마 카드. 기본 true */
    theme?: boolean
    /** 시작 화면 카드. 기본 true — sources.startView가 있고 서버가 이 기능을 알며 엔진이 지도를 만든 경우에만 보인다 */
    startView?: boolean
    /** 데이터 기준 정보 카드. 기본 true — sources.dataInfo가 있거나 staticDataInfo가 있을 때만 보인다 */
    dataInfo?: boolean
    /** 요청 없이 데이터 기준 정보 끝에 붙는 항목(예: 배경지도 제공처 안내) */
    staticDataInfo?: readonly GisDataInfoItem[]
    /** 카드 아래에 더 그릴 호스트 내용 */
    children?: ReactNode
}

/**
 * 머리줄 사용자 표시를 눌렀을 때 펼쳐지는 메뉴의 항목 하나 — 호스트가 만든다.
 * 패키지는 페이지 이동·로그아웃 방식을 모른다: 무엇을 할지는 전부 onSelect(호스트 코드)다
 */
export interface MapUserMenuItem {
    /** 항목 id(목록 안에서 겹치면 안 된다 — React key) */
    id: string
    /** 항목 글자 */
    label: string
    /** 글자 앞 아이콘(예: lucide 아이콘 요소 `<LogOut size={14} />`) */
    icon?: ReactNode
    /** 항목을 고르면 메뉴를 닫고 부른다 */
    onSelect: () => void
}

/** 머리줄 왼쪽 로고 영역 */
export interface MapShellBrand {
    /** 이름(굵은 글자) */
    title: string
    /** 이름 옆 작은 회색 글자 */
    subtitle?: string
    /** 주 색 사각형 안에 들어갈 아이콘(16px 권장). 없으면 사각형도 그리지 않는다 */
    logo?: ReactNode
}
