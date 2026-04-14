'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useAuthStore } from '@/store/authStore'
import {
    Home,
    Settings,
    Map,
    BookOpen,
    Users,
    Menu as MenuIcon,
    Shield,
    ChevronDown,
    ChevronRight,
    Layers,
    PenLine,
} from 'lucide-react'

interface SubMenuItem {
    id: string
    label: string
    href: string
    icon?: React.ReactNode
}

interface MenuItem {
    id: string
    label: string
    href?: string
    icon: React.ReactNode
    children?: SubMenuItem[]
}

const menuItems: MenuItem[] = [
    {
        id: 'home',
        label: '홈',
        href: '/',
        icon: <Home size={18} />,
    },
    {
        id: 'admin',
        label: '관리자',
        icon: <Settings size={18} />,
        children: [
            { id: 'admin-user',       label: '사용자 관리', href: '/admin/user',       icon: <Users size={15} /> },
            { id: 'admin-blog',       label: '블로그 관리', href: '/admin/blog',       icon: <PenLine size={15} /> },
            { id: 'admin-menu',       label: '메뉴 관리',   href: '/admin/menu',       icon: <MenuIcon size={15} /> },
            { id: 'admin-permission', label: '권한 관리',   href: '/admin/permission', icon: <Shield size={15} /> },
        ],
    },
    {
        id: 'map',
        label: '지도',
        href: '/map',
        icon: <Map size={18} />,
    },
    {
        id: 'blog',
        label: '블로그',
        href: '/blog',
        icon: <BookOpen size={18} />,
    },
]

export default function Sidebar() {
    const pathname = usePathname()
    const [openSubMenu, setOpenSubMenu] = useState<string | null>(null)
    const { user } = useAuthStore()

    const displayName = user?.nickname ?? user?.userId ?? '사용자'
    const initial = displayName.charAt(0).toUpperCase()
    const subLabel = user?.roleLabel ?? ''

    const isActive = (href: string) => pathname === href
    const isGroupActive = (children: SubMenuItem[]) => children.some((c) => pathname.startsWith(c.href))

    return (
        <aside className="w-64 bg-gray-950 text-white flex flex-col sticky top-0 h-screen overflow-y-auto shrink-0">
            {/* 로고 */}
            <div className="p-6 border-b border-gray-800">
                <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-lg flex items-center justify-center">
                        <Layers size={16} className="text-white" />
                    </div>
                    <div>
                        <h1 className="text-sm font-bold tracking-wide">기빵 프로젝트</h1>
                        <p className="text-gray-500 text-xs mt-0.5">대시보드</p>
                    </div>
                </div>
            </div>

            {/* 내비게이션 */}
            <nav className="flex-1 p-3">
                <p className="text-gray-600 text-[10px] uppercase tracking-widest font-semibold px-3 mb-2 mt-2">메뉴</p>
                <ul className="space-y-0.5">
                    {menuItems.map((item) => (
                        <li key={item.id}>
                            {item.children ? (
                                <>
                                    <button
                                        onClick={() => setOpenSubMenu(openSubMenu === item.id ? null : item.id)}
                                        className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg transition-all text-sm
                                            ${
                                                isGroupActive(item.children)
                                                    ? 'bg-gray-800 text-white'
                                                    : 'text-gray-400 hover:text-white hover:bg-gray-800/60'
                                            }`}
                                    >
                                        <span className="flex items-center gap-3">
                                            {item.icon}
                                            {item.label}
                                        </span>
                                        {openSubMenu === item.id ? (
                                            <ChevronDown size={14} />
                                        ) : (
                                            <ChevronRight size={14} />
                                        )}
                                    </button>
                                    {openSubMenu === item.id && (
                                        <ul className="mt-0.5 ml-4 pl-3 border-l border-gray-800 space-y-0.5">
                                            {item.children.map((sub) => (
                                                <li key={sub.id}>
                                                    <Link
                                                        href={sub.href}
                                                        className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-all
                                                            ${
                                                                isActive(sub.href)
                                                                    ? 'text-blue-400 bg-blue-500/10'
                                                                    : 'text-gray-500 hover:text-gray-200 hover:bg-gray-800/60'
                                                            }`}
                                                    >
                                                        {sub.icon}
                                                        {sub.label}
                                                    </Link>
                                                </li>
                                            ))}
                                        </ul>
                                    )}
                                </>
                            ) : (
                                <Link
                                    href={item.href!}
                                    className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all
                                        ${
                                            isActive(item.href!)
                                                ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/20'
                                                : 'text-gray-400 hover:text-white hover:bg-gray-800/60'
                                        }`}
                                >
                                    {item.icon}
                                    {item.label}
                                </Link>
                            )}
                        </li>
                    ))}
                </ul>
            </nav>

            {/* 푸터 */}
            <div className="p-4 border-t border-gray-800">
                <div className="flex items-center gap-3 px-2">
                    <div className="w-7 h-7 bg-gradient-to-br from-purple-500 to-pink-500 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0">
                        {initial}
                    </div>
                    <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-gray-300 truncate">{displayName}</p>
                        <p className="text-[10px] text-gray-600 truncate">{subLabel}</p>
                    </div>
                </div>
            </div>
        </aside>
    )
}
