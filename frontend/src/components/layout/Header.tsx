'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Bell, Search, ChevronDown, Settings, User, LogOut, ShieldAlert, Gamepad2 } from 'lucide-react'
import { useAuthStore } from '@/store/authStore'

interface HeaderProps {
    title?: string
    breadcrumb?: string[]
}

function RoleIcon({ role }: { role: string }) {
    if (role === 'SUPER_ADMIN') return <ShieldAlert size={11} />
    if (role === 'LOSTARK')    return <Gamepad2 size={11} />
    return <User size={11} />
}

export default function Header({ title = '대시보드', breadcrumb }: HeaderProps) {
    const router = useRouter()
    const { user, clearAuth } = useAuthStore()
    const [isProfileOpen, setIsProfileOpen] = useState(false)

    const displayName = user?.nickname ?? user?.userId ?? '사용자'
    const initial     = displayName.charAt(0).toUpperCase()

    const handleLogout = () => {
        clearAuth()
        router.push('/login')
    }

    return (
        <header className="h-16 bg-white border-b border-gray-100 flex items-center justify-between px-6 sticky top-0 z-30">
            {/* 페이지 타이틀 & Breadcrumb */}
            <div>
                {breadcrumb && breadcrumb.length > 0 && (
                    <div className="flex items-center gap-1.5 text-xs text-gray-400 mb-0.5">
                        {breadcrumb.map((crumb, i) => (
                            <span key={i} className="flex items-center gap-1.5">
                                {i > 0 && <span>/</span>}
                                <span className={i === breadcrumb.length - 1 ? 'text-gray-600' : ''}>{crumb}</span>
                            </span>
                        ))}
                    </div>
                )}
                <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
            </div>

            {/* 우측 영역 */}
            <div className="flex items-center gap-2">
                {/* 검색 */}
                <div className="relative">
                    <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                        type="text"
                        placeholder="검색..."
                        className="w-56 pl-9 pr-4 py-2 text-sm bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 focus:bg-white transition-all"
                    />
                </div>

                {/* 알림 */}
                <button className="relative p-2 text-gray-500 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition-colors">
                    <Bell size={18} />
                    <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 bg-red-500 rounded-full ring-2 ring-white" />
                </button>

                {/* 설정 */}
                <button className="p-2 text-gray-500 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition-colors">
                    <Settings size={18} />
                </button>

                {/* 구분선 */}
                <div className="w-px h-6 bg-gray-200 mx-1" />

                {/* 프로필 */}
                <div className="relative">
                    <button
                        onClick={() => setIsProfileOpen(!isProfileOpen)}
                        className="flex items-center gap-2.5 pl-2 pr-3 py-1.5 hover:bg-gray-100 rounded-lg transition-colors"
                    >
                        <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-full flex items-center justify-center text-white text-sm font-semibold shadow-sm">
                            {initial}
                        </div>
                        <div className="text-left hidden sm:block">
                            <p className="text-sm font-medium text-gray-800 leading-none">{displayName}</p>
                            <p className="text-[10px] text-gray-400 mt-0.5">{user?.roleLabel ?? ''}</p>
                        </div>
                        <ChevronDown size={14} className="text-gray-400" />
                    </button>

                    {/* 드롭다운 */}
                    {isProfileOpen && (
                        <>
                            {/* 외부 클릭 닫기 */}
                            <div
                                className="fixed inset-0 z-40"
                                onClick={() => setIsProfileOpen(false)}
                            />
                            <div className="absolute right-0 mt-2 w-56 bg-white border border-gray-100 rounded-xl shadow-xl shadow-gray-200/60 py-2 z-50">
                                {/* 사용자 정보 */}
                                <div className="px-4 py-3 border-b border-gray-100">
                                    <div className="flex items-center gap-2 mb-1">
                                        <p className="text-sm font-semibold text-gray-800">{displayName}</p>
                                        {user?.role && (
                                            <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-600 font-medium">
                                                <RoleIcon role={user.role} />
                                                {user.roleLabel}
                                            </span>
                                        )}
                                    </div>
                                    <p className="text-xs text-gray-400">ID: {user?.userId}</p>
                                    {user?.userName && (
                                        <p className="text-xs text-gray-400 mt-0.5">{user.userName}</p>
                                    )}
                                </div>
                                <div className="py-1">
                                    <a href="#" className="flex items-center gap-2.5 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 hover:text-gray-900 transition-colors">
                                        <User size={15} />
                                        프로필
                                    </a>
                                    <a href="#" className="flex items-center gap-2.5 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 hover:text-gray-900 transition-colors">
                                        <Settings size={15} />
                                        설정
                                    </a>
                                </div>
                                <div className="border-t border-gray-100 py-1">
                                    <button
                                        onClick={handleLogout}
                                        className="w-full flex items-center gap-2.5 px-4 py-2 text-sm text-red-500 hover:bg-red-50 transition-colors"
                                    >
                                        <LogOut size={15} />
                                        로그아웃
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
