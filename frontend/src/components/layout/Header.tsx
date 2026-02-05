'use client'

import { useState } from 'react'

interface HeaderProps {
  title?: string
}

export default function Header({ title = '대시보드' }: HeaderProps) {
  const [isProfileOpen, setIsProfileOpen] = useState(false)

  return (
    <header className="h-16 bg-white border-b border-gray-200 flex items-center justify-between px-6">
      {/* Page Title */}
      <div>
        <h2 className="text-xl font-semibold text-gray-800">{title}</h2>
      </div>

      {/* Right Section */}
      <div className="flex items-center gap-4">
        {/* Search */}
        <div className="relative">
          <input
            type="text"
            placeholder="검색..."
            className="w-64 px-4 py-2 pl-10 bg-gray-100 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-colors"
          />
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
            🔍
          </span>
        </div>

        {/* Notifications */}
        <button className="relative p-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">
          <span className="text-xl">🔔</span>
          <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full"></span>
        </button>

        {/* Profile */}
        <div className="relative">
          <button
            onClick={() => setIsProfileOpen(!isProfileOpen)}
            className="flex items-center gap-2 p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center text-white font-semibold">
              U
            </div>
            <span className="text-gray-700">사용자</span>
          </button>

          {/* Dropdown */}
          {isProfileOpen && (
            <div className="absolute right-0 mt-2 w-48 bg-white border border-gray-200 rounded-lg shadow-lg py-2 z-50">
              <a href="#" className="block px-4 py-2 text-gray-700 hover:bg-gray-100">
                프로필
              </a>
              <a href="#" className="block px-4 py-2 text-gray-700 hover:bg-gray-100">
                설정
              </a>
              <hr className="my-2" />
              <a href="#" className="block px-4 py-2 text-red-600 hover:bg-gray-100">
                로그아웃
              </a>
            </div>
          )}
        </div>
      </div>
    </header>
  )
}
