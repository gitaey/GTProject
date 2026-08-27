'use client'

import { useEffect, useRef } from 'react'
import { usePathname } from 'next/navigation'
import { useAccessLog } from '@/hooks/useAccessLog'

const PAGE_TITLES: Record<string, string> = {
    '/': '대시보드',
    '/map': '지도',
    '/blog': '블로그',
    '/admin/user': '사용자 관리',
    '/admin/blog': '블로그 관리',
    '/admin/blog/category': '카테고리 관리',
    '/admin/bot-log': '봇 로그',
    '/admin/bot/command': '명령어 관리',
    '/admin/bot/room': '방 모니터링',
    '/admin/bot/schedule': '자동 전송 관리',
    '/admin/geoserver/publish': 'GeoServer 발행',
    '/admin/geoserver/styles': 'GeoServer 스타일',
    '/admin/access-log': '접속 로그',
    '/map-admin/layer': '레이어 관리',
}

export default function AccessLogTracker() {
    const pathname = usePathname()
    const { logAccess } = useAccessLog()
    const prevPathRef = useRef<string | null>(null)

    useEffect(() => {
        if (prevPathRef.current === pathname) return
        prevPathRef.current = pathname

        const pageTitle = PAGE_TITLES[pathname] ?? pathname
        logAccess(pathname, pageTitle)
    }, [pathname, logAccess])

    return null
}
