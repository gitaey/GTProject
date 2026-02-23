'use client'

import { useState } from 'react'

interface SubMenuItem {
  id: string
  label: string
  href?: string
}

interface MenuItem {
  id: string
  label: string
  href?: string
  onClick?: () => void
  children?: SubMenuItem[]
}

interface SidebarProps {
  onMapOpen?: () => void
}

export default function Sidebar({ onMapOpen }: SidebarProps) {
  const [activeMenu, setActiveMenu] = useState('home')
  const [openSubMenu, setOpenSubMenu] = useState<string | null>(null)

  const menuItems: MenuItem[] = [
    { id: 'home', label: '홈' },
    {
      id: 'admin',
      label: '관리자',
      children: [
        { id: 'admin-user', label: '사용자 관리' },
        { id: 'admin-menu', label: '메뉴 관리' },
        { id: 'admin-permission', label: '권한 관리' },
      ],
    },
    { id: 'map', label: '지도', onClick: onMapOpen },
    { id: 'blog', label: '블로그' },
  ]

  const handleMenuClick = (item: MenuItem) => {
    if (item.children) {
      setOpenSubMenu(openSubMenu === item.id ? null : item.id)
    } else {
      setActiveMenu(item.id)
      if (item.onClick) {
        item.onClick()
      }
    }
  }

  const handleSubMenuClick = (subItem: SubMenuItem) => {
    setActiveMenu(subItem.id)
  }

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
              <button
                onClick={() => handleMenuClick(item)}
                className={`w-full flex items-center justify-between px-4 py-3 rounded-lg transition-colors ${
                  activeMenu === item.id || (item.children && openSubMenu === item.id)
                    ? 'bg-blue-600 text-white'
                    : 'text-gray-300 hover:bg-gray-800'
                }`}
              >
                <span>{item.label}</span>
                {item.children && (
                  <span className={`transition-transform ${openSubMenu === item.id ? 'rotate-180' : ''}`}>
                    ▼
                  </span>
                )}
              </button>

              {/* Submenu */}
              {item.children && openSubMenu === item.id && (
                <ul className="mt-1 ml-4 space-y-1">
                  {item.children.map((subItem) => (
                    <li key={subItem.id}>
                      <button
                        onClick={() => handleSubMenuClick(subItem)}
                        className={`w-full text-left px-4 py-2 rounded-lg transition-colors ${
                          activeMenu === subItem.id
                            ? 'bg-gray-700 text-white'
                            : 'text-gray-400 hover:bg-gray-800 hover:text-gray-200'
                        }`}
                      >
                        {subItem.label}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      </nav>

      {/* Footer */}
      <div className="p-4 border-t border-gray-700">
        <p className="text-gray-500 text-xs text-center">
          v1.0.0
        </p>
      </div>
    </aside>
  )
}
