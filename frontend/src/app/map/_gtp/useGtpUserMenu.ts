'use client'

// 머리줄 사용자 메뉴 항목(대시보드·로그아웃)을 만든다. 역할(authStore)이 바뀔 때만 새 배열 — MapShell에 매 렌더 새 값을 내려보내지 않는다
import { useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/stores/authStore'
import type { MapUserMenuItem } from '@gtp/gis-map/ui'
import { gtpUserMenuItems, runGtpLogout } from './gtpUserMenu'

export function useGtpUserMenu(): readonly MapUserMenuItem[] {
    const router = useRouter()
    const role = useAuthStore(s => s.user?.role)
    const clearAuth = useAuthStore(s => s.clearAuth)

    return useMemo(() => gtpUserMenuItems(role, {
        goDashboard: () => router.push('/'),
        logout: () => runGtpLogout({ clearAuth, push: href => router.push(href) }),
    }), [role, router, clearAuth])
}
