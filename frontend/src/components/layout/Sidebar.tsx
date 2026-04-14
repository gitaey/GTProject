'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

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
    { id: 'home', label: '홈', href: '/' },
    {
        id: 'admin',
        label: '관리자',
        children: [
            { id: 'admin-user', label: '사용자 관리', href: '/admin/user' },
            { id: 'admin-menu', label: '메뉴 관리', href: '/admin/menu' },
            { id: 'admin-permission', label: '권한 관리', href: '/admin/permission' },
        ],
    },
    { id: 'map', label: '지도', href: '/map' },
    { id: 'blog', label: '블로그', href: '/blog' },
]

export default function Sidebar() {
    const pathname = usePathname()
    const [openSubMenu, setOpenSubMenu] = useState<string | null>(null)

    const isActive = (href: string) => pathname === href
    const isGroupActive = (children: SubMenuItem[]) => children.some((c) => pathname.startsWith(c.href))

    return (
        <aside className="w-64 bg-gray-900 text-white min-h-screen flex flex-col">
            {/* Logo */}
            <div className="p-6 border-b border-gray-700">
                <h1 className="text-xl font-bold">GT Project</h1>
                <p className="text-gray-400 text-sm mt-1">Dashboard</p>
            </div>

            {/* Navigation */}
            <nav className="flex-1 p-4">
                <ul className="space-y-1">
                    {menuItems.map((item) => (
                        <li key={item.id}>
                            {item.children ? (
                                <>
                                    <button
                                        onClick={() => setOpenSubMenu(openSubMenu === item.id ? null : item.id)}
                                        className={`w-full flex items-center justify-between py-2 transition-colors
                      ${isGroupActive(item.children) ? 'text-white' : 'text-gray-400 hover:text-white'}`}
                                    >
                                        <span>{item.label}</span>
                                        <span
                                            className={`text-xs transition-transform ${openSubMenu === item.id ? 'rotate-180' : ''}`}
                                        >
                                            ▼
                                        </span>
                                    </button>
                                    {openSubMenu === item.id && (
                                        <ul className="mt-1 ml-4 space-y-1">
                                            {item.children.map((sub) => (
                                                <li key={sub.id}>
                                                    <Link
                                                        href={sub.href}
                                                        className={`block py-2 transition-colors
                              ${isActive(sub.href) ? 'text-white' : 'text-gray-500 hover:text-gray-200'}`}
                                                    >
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
                                    className={`block py-2 transition-colors
                    ${isActive(item.href!) ? 'text-white' : 'text-gray-400 hover:text-white'}`}
                                >
                                    {item.label}
                                </Link>
                            )}
                        </li>
                    ))}
                </ul>
            </nav>

            {/* Footer */}
            <div className="p-4 border-t border-gray-700">
                <p className="text-gray-500 text-xs text-center">v1.0.0</p>
            </div>
        </aside>
    )
}
