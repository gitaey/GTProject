'use client'

import Counter from '@/components/Counter'
import UserProfile from '@/components/UserProfile'
import TodoList from '@/components/TodoList'

export default function Home() {
  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-6xl mx-auto">
        {/* 🎯 메인 타이틀 */}
        <header className="text-center mb-12">
          <h1 className="text-4xl font-bold text-gray-800 mb-4">
            🚀 Next.js + React + OpenLayers + Zustand
          </h1>
          <p className="text-xl text-gray-600">
            처음부터 차근차근 배워보는 웹 개발 스택!
          </p>
        </header>

        {/* 📚 학습 진행 상황 */}
        <div className="mb-8 p-6 bg-white rounded-lg shadow-md">
          <h2 className="text-2xl font-semibold mb-4 text-gray-800">학습 로드맵</h2>
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="p-4 bg-green-100 rounded-lg border-l-4 border-green-500">
              <div className="flex items-center mb-2">
                <span className="w-3 h-3 bg-green-500 rounded-full mr-2"></span>
                <span className="font-semibold">1단계: React 기초</span>
              </div>
              <p className="text-sm text-gray-600">컴포넌트, State, Props</p>
            </div>

            <div className="p-4 bg-yellow-100 rounded-lg border-l-4 border-yellow-500">
              <div className="flex items-center mb-2">
                <span className="w-3 h-3 bg-yellow-500 rounded-full mr-2"></span>
                <span className="font-semibold">2단계: Next.js</span>
              </div>
              <p className="text-sm text-gray-600">App Router, 라우팅</p>
            </div>

            <div className="p-4 bg-blue-100 rounded-lg border-l-4 border-blue-500">
              <div className="flex items-center mb-2">
                <span className="w-3 h-3 bg-blue-500 rounded-full mr-2"></span>
                <span className="font-semibold">3단계: Zustand</span>
              </div>
              <p className="text-sm text-gray-600">상태 관리</p>
            </div>

            <div className="p-4 bg-purple-100 rounded-lg border-l-4 border-purple-500">
              <div className="flex items-center mb-2">
                <span className="w-3 h-3 bg-purple-500 rounded-full mr-2"></span>
                <span className="font-semibold">4단계: OpenLayers</span>
              </div>
              <p className="text-sm text-gray-600">지도 통합</p>
            </div>
          </div>
        </div>

        {/* 🎯 React 기초 실습 */}
        <div className="mb-8">
          <h2 className="text-2xl font-semibold mb-6 text-gray-800">
            🎯 1단계: React 기초 실습
          </h2>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {/* React 컴포넌트들이 여기 들어갑니다 */}
            <Counter />
            <UserProfile />
            <TodoList />
          </div>
        </div>

        {/* 📖 학습 안내 */}
        <div className="p-6 bg-gradient-to-r from-blue-50 to-purple-50 rounded-lg">
          <h3 className="text-xl font-semibold mb-3 text-gray-800">🧠 지금 배우고 있는 것들</h3>
          <div className="grid md:grid-cols-3 gap-4">
            <div>
              <h4 className="font-semibold text-green-600 mb-2">⚛️ React 핵심</h4>
              <ul className="text-sm text-gray-600 space-y-1">
                <li>• 컴포넌트 만들기</li>
                <li>• useState로 상태 관리</li>
                <li>• Props로 데이터 전달</li>
                <li>• 이벤트 핸들링</li>
              </ul>
            </div>

            <div>
              <h4 className="font-semibold text-blue-600 mb-2">🚀 Next.js 특징</h4>
              <ul className="text-sm text-gray-600 space-y-1">
                <li>• 'use client' 지시어</li>
                <li>• 컴포넌트 기반 구조</li>
                <li>• TypeScript 지원</li>
                <li>• Tailwind CSS 스타일링</li>
              </ul>
            </div>

            <div>
              <h4 className="font-semibold text-purple-600 mb-2">🎨 개발 도구</h4>
              <ul className="text-sm text-gray-600 space-y-1">
                <li>• IntelliJ IDEA</li>
                <li>• Hot Reload</li>
                <li>• ESLint</li>
                <li>• TypeScript</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
