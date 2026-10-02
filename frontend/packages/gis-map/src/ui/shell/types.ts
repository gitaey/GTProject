// 셸(MapShell)이 호스트에게서 받는 값의 타입 — 패널 정의·브랜드
import type { ComponentType, ReactNode } from 'react'
import type { GisFeatureId, GisMap } from '../../core'

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
