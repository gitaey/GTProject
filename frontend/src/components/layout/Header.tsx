'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useTheme } from 'next-themes'
import { Sun, Moon, ChevronDown, User, Settings, LogOut, ShieldAlert, Map, Menu } from 'lucide-react'
import { useAuthStore } from '@/store/authStore'
import { useSidebarStore } from '@/store/sidebarStore'

interface HeaderProps {
    title?: string
    breadcrumb?: string[]
}

function RoleIcon({ role }: { role: string }) {
    if (role === 'SUPER_ADMIN') return <ShieldAlert size={11} />
    if (role === 'MAP_ADMIN')   return <Map size={11} />
    return <User size={11} />
}

export default function Header({ title = '대시보드', breadcrumb }: HeaderProps) {
    const router = useRouter()
    const { user, clearAuth } = useAuthStore()
    const { resolvedTheme, setTheme } = useTheme()
    const { toggle } = useSidebarStore()
    const [mounted, setMounted] = useState(false)
    const [profileOpen, setProfileOpen] = useState(false)

    useEffect(() => { setMounted(true) }, [])

    const displayName = user?.nickname ?? user?.userId ?? '사용자'
    const initial     = displayName.charAt(0).toUpperCase()

    const handleLogout = () => {
        clearAuth()
        router.push('/login')
    }

    return (
        <header
            className="h-13 flex items-center justify-between px-6 sticky top-0 z-30"
            style={{
                height: '52px',
                background: 'var(--bg-header)',
                borderBottom: '1px solid var(--border)',
            }}
        >
            {/* 모바일 햄버거 버튼 */}
            <button
                onClick={toggle}
                className="sm:hidden flex items-center justify-center w-8 h-8 rounded-lg mr-2 transition-colors"
                style={{ color: 'var(--text-secondary)' }}
                aria-label="메뉴 열기"
            >
                <Menu size={18} />
            </button>

            {/* 브레드크럼 + 타이틀 */}
            <div className="flex-1 min-w-0">
                {breadcrumb && breadcrumb.length > 0 && (
                    <div className="flex items-center gap-1.5 mb-0.5">
                        {breadcrumb.map((crumb, i) => (
                            <span key={i} className="flex items-center gap-1.5">
                                {i > 0 && <span className="text-xs" style={{ color: 'var(--text-muted)' }}>/</span>}
                                <span
                                    className="text-xs"
                                    style={{ color: i === breadcrumb.length - 1 ? 'var(--text-secondary)' : 'var(--text-muted)' }}
                                >
                                    {crumb}
                                </span>
                            </span>
                        ))}
                    </div>
                )}
                <h2 className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{title}</h2>
            </div>

            {/* 우측 영역 */}
            <div className="flex items-center gap-3">

                {/* 테마 토글 */}
                <div
                    className="flex items-center p-0.5 rounded-lg"
                    style={{ background: 'var(--bg-page)', border: '1px solid var(--border)' }}
                >
                    <button
                        onClick={() => setTheme('light')}
                        className="flex items-center justify-center w-8 h-7 rounded-md transition-all"
                        style={{
                            background: mounted && resolvedTheme === 'light' ? 'var(--bg-surface)' : 'transparent',
                            border: mounted && resolvedTheme === 'light' ? '1px solid var(--border)' : '1px solid transparent',
                            color: mounted && resolvedTheme === 'light' ? 'var(--accent)' : 'var(--text-faint)',
                        }}
                        aria-label="라이트 모드"
                    >
                        <Sun size={14} />
                    </button>
                    <button
                        onClick={() => setTheme('dark')}
                        className="flex items-center justify-center w-8 h-7 rounded-md transition-all"
                        style={{
                            background: mounted && resolvedTheme === 'dark' ? 'var(--bg-surface)' : 'transparent',
                            border: mounted && resolvedTheme === 'dark' ? '1px solid var(--border)' : '1px solid transparent',
                            color: mounted && resolvedTheme === 'dark' ? 'var(--accent)' : 'var(--text-faint)',
                        }}
                        aria-label="다크 모드"
                    >
                        <Moon size={14} />
                    </button>
                </div>

                {/* 구분선 */}
                <div className="w-px h-5" style={{ background: 'var(--border)' }} />

                {/* 프로필 드롭다운 */}
                <div className="relative">
                    <button
                        onClick={() => setProfileOpen(!profileOpen)}
                        className="flex items-center gap-2 px-2 py-1.5 rounded-lg transition-colors"
                        style={{ background: profileOpen ? 'var(--bg-hover)' : 'transparent' }}
                    >
                        <div
                            className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-medium"
                            style={{ background: 'var(--accent)' }}
                        >
                            {initial}
                        </div>
                        <div className="text-left hidden sm:block">
                            <p className="text-xs font-medium leading-none" style={{ color: 'var(--text-primary)' }}>{displayName}</p>
                            <p className="font-mono text-[10px] mt-0.5" style={{ color: 'var(--text-faint)' }}>{user?.roleLabel ?? ''}</p>
                        </div>
                        <ChevronDown size={13} style={{ color: 'var(--text-faint)' }} />
                    </button>

                    {profileOpen && (
                        <>
                            <div className="fixed inset-0 z-40" onClick={() => setProfileOpen(false)} />
                            <div
                                className="absolute right-0 mt-2 w-52 rounded-xl py-2 z-50"
                                style={{
                                    background: 'var(--bg-surface)',
                                    border: '1px solid var(--border)',
                                    boxShadow: '0 4px 20px rgba(0,0,0,0.08)',
                                }}
                            >
                                <div className="px-4 py-3" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                                    <div className="flex items-center gap-2 mb-1">
                                        <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{displayName}</p>
                                        {user?.role && (
                                            <span
                                                className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full"
                                                style={{ background: 'var(--accent-bg)', color: 'var(--accent)' }}
                                            >
                                                <RoleIcon role={user.role} />
                                                {user.roleLabel}
                                            </span>
                                        )}
                                    </div>
                                    <p className="text-xs" style={{ color: 'var(--text-faint)' }}>ID: {user?.userId}</p>
                                </div>
                                <div className="py-1">
                                    <a
                                        href="#"
                                        className="flex items-center gap-2.5 px-4 py-2 text-sm transition-colors"
                                        style={{ color: 'var(--text-secondary)' }}
                                        onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-hover)')}
                                        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                                    >
                                        <User size={14} /> 프로필
                                    </a>
                                    <a
                                        href="#"
                                        className="flex items-center gap-2.5 px-4 py-2 text-sm transition-colors"
                                        style={{ color: 'var(--text-secondary)' }}
                                        onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-hover)')}
                                        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                                    >
                                        <Settings size={14} /> 설정
                                    </a>
                                </div>
                                <div className="py-1" style={{ borderTop: '1px solid var(--border-subtle)' }}>
                                    <button
                                        onClick={handleLogout}
                                        className="w-full flex items-center gap-2.5 px-4 py-2 text-sm text-red-500 transition-colors"
                                        onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-hover)')}
                                        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                                    >
                                        <LogOut size={14} /> 로그아웃
                                    </button>
                                </div>
                            </div>
                        </>
                    )}
                </div>
            </div>
        </header>
    )
}
