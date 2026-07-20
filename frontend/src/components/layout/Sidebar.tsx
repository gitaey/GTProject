'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useAuthStore } from '@/stores/authStore'
import { useSidebarStore } from '@/stores/sidebarStore'
import { ChevronDown, ChevronRight } from 'lucide-react'

interface SubMenuItem {
    id: string
    label: string
    href: string
}

interface MenuItem {
    id: string
    label: string
    href?: string
    children?: SubMenuItem[]
}

const menuItems: MenuItem[] = [
    { id: 'home', label: '대시보드', href: '/' },
    {
        id: 'map-admin',
        label: '지도',
        children: [
            { id: 'map-view',       label: '지도 보기',            href: '/map' },
            { id: 'map-layer',      label: '레이어 관리',          href: '/map-admin/layer' },
            { id: 'map-layer-perm', label: '사용자별 레이어 권한', href: '/map-admin/layer-perm' },
            { id: 'map-menu',       label: '메뉴 관리',            href: '/map-admin/menu' },
            { id: 'map-permission', label: '권한 관리',            href: '/map-admin/permission' },
        ],
    },
    {
        id: 'blog',
        label: '블로그',
        children: [
            { id: 'blog-view',     label: '블로그 보기',  href: '/blog' },
            { id: 'blog-admin',    label: '포스트 관리',  href: '/admin/blog' },
            { id: 'blog-category', label: '카테고리 관리', href: '/admin/blog/category' },
        ],
    },
    {
        id: 'bot',
        label: '기빵봇',
        children: [
            { id: 'bot-log',      label: '봇 로그',       href: '/admin/bot-log' },
            { id: 'bot-command',  label: '명령어 관리',   href: '/admin/bot/command' },
            { id: 'bot-schedule', label: '자동 전송 관리', href: '/admin/bot/schedule' },
            { id: 'bot-room',     label: '방 모니터링',   href: '/admin/bot/room' },
        ],
    },
    {
        id: 'system',
        label: '시스템',
        children: [
            { id: 'system-user', label: '사용자 관리', href: '/admin/user' },
        ],
    },
]

const ADMIN_ONLY_IDS = new Set(['map-admin', 'bot', 'system'])

export default function Sidebar() {
    const pathname        = usePathname()
    const { user }        = useAuthStore()
    const { isOpen, close } = useSidebarStore()

    const isSuperAdmin = user?.role === 'SUPER_ADMIN'
    const visibleMenus = menuItems.filter(m => m.id === 'home' || isSuperAdmin || !ADMIN_ONLY_IDS.has(m.id))

    const findActiveGroup = () => {
        for (const m of visibleMenus) {
            if (m.children?.some(c => pathname.startsWith(c.href))) return m.id
        }
        return null
    }

    const [open, setOpen] = useState<string | null>(findActiveGroup)

    // 페이지 이동 시 모바일 사이드바 닫기
    useEffect(() => { close() }, [pathname, close])

    const displayName = user?.nickname ?? user?.userId ?? '사용자'
    const initial     = displayName.charAt(0).toUpperCase()
    const roleLabel   = user?.roleLabel ?? ''

    const isActive = (href: string) => pathname === href

    const sidebarContent = (
        <aside
            className={[
                'fixed inset-y-0 left-0 z-40 w-52 flex flex-col overflow-y-auto shrink-0',
                'transition-transform duration-200 ease-in-out',
                'sm:sticky sm:top-0 sm:h-screen sm:translate-x-0',
                isOpen ? 'translate-x-0' : '-translate-x-full',
            ].join(' ')}
            style={{ background: 'var(--bg-sidebar)', borderRight: '1px solid var(--border)' }}
        >
            {/* 로고 */}
            <div className="px-4 py-4 flex items-center gap-2.5" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                <div className="w-2 h-2 rounded-full shrink-0" style={{ background: 'var(--accent)' }} />
                <span className="text-sm font-medium tracking-tight" style={{ color: 'var(--text-primary)' }}>
                    기빵 프로젝트
                </span>
            </div>

            {/* 네비게이션 */}
            <nav className="flex-1 py-3 overflow-y-auto">
                {visibleMenus.map((item) => {
                    if (!item.children) {
                        return (
                            <Link
                                key={item.id}
                                href={item.href!}
                                className="block px-4 py-1.5 text-sm font-medium transition-colors"
                                style={{
                                    color: isActive(item.href!) ? 'var(--accent)' : 'var(--text-muted)',
                                    borderLeft: '2px solid transparent',
                                }}
                            >
                                {item.label}
                            </Link>
                        )
                    }

                    const isGroupActive = item.children.some(c => pathname.startsWith(c.href))
                    const isGroupOpen   = open === item.id

                    return (
                        <div key={item.id} className="mt-1">
                            <button
                                onClick={() => setOpen(isGroupOpen ? null : item.id)}
                                className="w-full flex items-center justify-between px-4 py-2 text-sm font-medium transition-colors text-left"
                                style={{ color: isGroupActive ? 'var(--accent)' : 'var(--text-primary)' }}
                            >
                                <span>{item.label}</span>
                                {isGroupOpen
                                    ? <ChevronDown size={13} style={{ color: 'var(--text-faint)' }} />
                                    : <ChevronRight size={13} style={{ color: 'var(--text-faint)' }} />
                                }
                            </button>

                            {isGroupOpen && (
                                <ul
                                    className="ml-4 pl-3 mb-1"
                                    style={{ borderLeft: `1.5px solid var(--accent-border)` }}
                                >
                                    {item.children.map((sub) => (
                                        <li key={sub.id}>
                                            <Link
                                                href={sub.href}
                                                className="block px-2.5 py-1.5 text-xs rounded transition-colors"
                                                style={{
                                                    color: isActive(sub.href) ? 'var(--accent)' : 'var(--text-muted)',
                                                    background: isActive(sub.href) ? 'var(--accent-bg)' : 'transparent',
                                                }}
                                            >
                                                {sub.label}
                                            </Link>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>
                    )
                })}
            </nav>

            {/* 푸터 */}
            <div className="px-4 py-3 flex items-center gap-2.5" style={{ borderTop: '1px solid var(--border-subtle)' }}>
                <div
                    className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-medium shrink-0"
                    style={{ background: 'var(--accent)' }}
                >
                    {initial}
                </div>
                <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium truncate" style={{ color: 'var(--text-secondary)' }}>{displayName}</p>
                    <p className="font-mono text-[10px] truncate" style={{ color: 'var(--text-faint)' }}>{roleLabel}</p>
                </div>
            </div>
        </aside>
    )

    return (
        <>
            {/* 모바일 백드롭 */}
            {isOpen && (
                <div
                    className="fixed inset-0 z-30 bg-black/50 sm:hidden"
                    onClick={close}
                />
            )}
            {sidebarContent}
        </>
    )
}
