'use client'

import { useState } from 'react'

interface MenuItem {
  id: string
  label: string
  icon: string
  href?: string
  onClick?: () => void
}

interface SidebarProps {
  onMapOpen?: () => void
}

export default function Sidebar({ onMapOpen }: SidebarProps) {
  const [activeMenu, setActiveMenu] = useState('home')

  const menuItems: MenuItem[] = [
    { id: 'home', label: '홈', icon: '🏠' },
    { id: 'map', label: '지도', icon: '🗺️', onClick: onMapOpen },
    { id: 'data', label: '데이터', icon: '📊' },
    { id: 'settings', label: '설정', icon: '⚙️' },
  ]

  const handleMenuClick = (item: MenuItem) => {
    setActiveMenu(item.id)
    if (item.onClick) {
      item.onClick()
    }
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
        <ul className="space-y-2">
          {menuItems.map((item) => (
            <li key={item.id}>
              <button
                onClick={() => handleMenuClick(item)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                  activeMenu === item.id
                    ? 'bg-blue-600 text-white'
                    : 'text-gray-300 hover:bg-gray-800'
                }`}
              >
                <span className="text-xl">{item.icon}</span>
                <span>{item.label}</span>
              </button>
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
