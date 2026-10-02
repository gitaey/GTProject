'use client'

// 좌측 아이콘 네비게이션 컴포넌트 (FE-5b-1: 옛 nav/NavLeft)
// 각 아이콘 클릭 시 오른쪽 패널 내용이 전환됨. FE-5c: 버튼 목록 = MapShell의 panels(호스트가 정한다)
// 모바일(768px 미만)에서는 숨김, 태블릿부터 표시 — gis-map-ui.css .gm-nav-rail
import { Settings } from 'lucide-react'
import { useGisHost } from '../../react'
import { cx } from '../cx'
import type { MapPanelDef } from './types'

export interface NavRailProps {
    /** 버튼 목록(순서대로). featureId가 있고 권한이 없으면 숨긴다 */
    panels: readonly MapPanelDef[]
    /** 열린 패널 id(없으면 null) */
    activePanel: string | null
    /** 같은 패널을 다시 누르면 닫힘(토글) — 상태는 지도 화면(MapShell)이 가진다 */
    togglePanel: (panelId: string) => void
}

export default function NavRail({ panels, activePanel, togglePanel }: NavRailProps) {
    // 메뉴 권한은 호스트 주입값(GisMapHost.isFeatureAllowed / permissionsReady)
    const { isFeatureAllowed: isAllowed, permissionsReady: loaded } = useGisHost()

    const visibleItems = loaded
        ? panels.filter(item => item.featureId == null || isAllowed(item.featureId))
        : panels

    return (
        // 모바일(768px 미만)에서 숨김
        <div className="gm-nav-rail">
            {visibleItems.map((item) => {
                const Icon = item.icon
                return (
                    <button
                        key={item.id}
                        onClick={() => togglePanel(item.id)}
                        className={cx('gm-nav-rail__item', activePanel === item.id && 'gm-is-active')}
                    >
                        <Icon size={20} />
                        <span>{item.label}</span>
                    </button>
                )
            })}

            <div className="gm-nav-rail__footer">
                <div className="gm-nav-rail__divider" />
                <button className="gm-nav-rail__item">
                    <Settings size={20} />
                    <span>설정</span>
                </button>
            </div>
        </div>
    )
}
