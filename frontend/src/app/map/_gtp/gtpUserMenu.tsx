// GTProject /map 머리줄 사용자 메뉴 항목(지도 패키지 밖 — 이식하지 않는다). 지도 패키지는 페이지 이동·로그아웃 방식을 모르므로
// 항목과 그 동작은 앱이 만들어 MapShell userMenuItems로 넘긴다. 이 파일은 React 훅·스토어 없이 값만 만든다(시험하기 쉽게) —
// 훅 연결은 useGtpUserMenu.ts
import { LayoutDashboard, LogOut } from 'lucide-react'
import type { MapUserMenuItem } from '@gtp/gis-map/ui'

/** MAP_USER는 middleware.ts가 `/`(대시보드)를 `/map`으로 되돌리므로 대시보드 항목을 숨긴다 */
export const GTP_MAP_ONLY_ROLE = 'MAP_USER'

export interface GtpUserMenuActions {
    /** 대시보드(`/`)로 이동(Next router) */
    goDashboard: () => void
    /** 로그아웃 — components/layout/Header.tsx handleLogout과 같은 동작(clearAuth + `/login` 이동) */
    logout: () => void
}

/** 로그아웃: components/layout/Header.tsx handleLogout과 같은 순서 — 저장소·쿠키를 지운 뒤 로그인 화면으로 */
export function runGtpLogout(deps: { clearAuth: () => void; push: (href: string) => void }): void {
    deps.clearAuth()
    deps.push('/login')
}

export function gtpUserMenuItems(role: string | null | undefined, actions: GtpUserMenuActions): readonly MapUserMenuItem[] {
    const items: MapUserMenuItem[] = []
    if (role !== GTP_MAP_ONLY_ROLE) {
        items.push({ id: 'dashboard', label: '대시보드', icon: <LayoutDashboard size={14} />, onSelect: actions.goDashboard })
    }
    items.push({ id: 'logout', label: '로그아웃', icon: <LogOut size={14} />, onSelect: actions.logout })
    return items
}
