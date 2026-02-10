'use client'

import {useState} from 'react'
import Sidebar from '@/components/layout/Sidebar'
import Header from '@/components/layout/Header'
import StatCard from '@/components/dashboard/StatCard'

export default function Home() {
    const [isMapOpen, setIsMapOpen] = useState(false)

    const handleMapOpen = () => {
        setIsMapOpen(true)
        // TODO: 지도 팝업 구현
        console.log('지도 팝업 열기')
    }

    return (
        <div className="flex min-h-screen bg-gray-50">
            {/* Sidebar */}
            <Sidebar onMapOpen={handleMapOpen}/>

            {/* Main Content */}
            <div className="flex-1 flex flex-col">
                {/* Header */}
                <Header title="대시보드"/>

                {/* Content */}
                <main className="flex-1 p-6">
                    {/* Stats Grid */}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
                        <StatCard
                            title="총 마커"
                            value="128"
                            icon="📍"
                            color="blue"
                            change={{value: 12, isPositive: true}}
                        />
                        <StatCard
                            title="저장된 위치"
                            value="45"
                            icon="⭐"
                            color="yellow"
                            change={{value: 8, isPositive: true}}
                        />
                        <StatCard
                            title="레이어"
                            value="7"
                            icon="🗂️"
                            color="purple"
                        />
                        <StatCard
                            title="공유됨"
                            value="23"
                            icon="🔗"
                            color="green"
                            change={{value: 3, isPositive: false}}
                        />
                    </div>

                    {/* Main Content Area */}
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                        {/* Recent Activity */}
                        <div className="lg:col-span-2 bg-white rounded-xl p-6 shadow-sm border border-gray-100">
                            <h3 className="text-lg font-semibold text-gray-800 mb-4">최근 활동</h3>
                            <div className="space-y-4">
                                {[
                                    {action: '새 마커 추가', location: '서울시 강남구', time: '5분 전', icon: '📍'},
                                    {action: '레이어 생성', location: '교통 레이어', time: '1시간 전', icon: '🗂️'},
                                    {action: '위치 저장', location: '부산시 해운대구', time: '2시간 전', icon: '⭐'},
                                    {action: '지도 공유', location: '프로젝트 A', time: '어제', icon: '🔗'},
                                ].map((item, index) => (
                                    <div key={index}
                                         className="flex items-center gap-4 p-3 hover:bg-gray-50 rounded-lg transition-colors">
                                        <div
                                            className="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center text-xl">
                                            {item.icon}
                                        </div>
                                        <div className="flex-1">
                                            <p className="font-medium text-gray-800">{item.action}</p>
                                            <p className="text-sm text-gray-500">{item.location}</p>
                                        </div>
                                        <span className="text-sm text-gray-400">{item.time}</span>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Quick Actions */}
                        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
                            <h3 className="text-lg font-semibold text-gray-800 mb-4">빠른 실행</h3>
                            <div className="space-y-3">
                                <button
                                    onClick={handleMapOpen}
                                    className="w-full flex items-center gap-3 p-4 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg transition-colors"
                                >
                                    <span className="text-2xl">🗺️</span>
                                    <span className="font-medium">지도 열기</span>
                                </button>
                                <button
                                    className="w-full flex items-center gap-3 p-4 bg-green-50 hover:bg-green-100 text-green-700 rounded-lg transition-colors">
                                    <span className="text-2xl">📍</span>
                                    <span className="font-medium">새 마커 추가</span>
                                </button>
                                <button
                                    className="w-full flex items-center gap-3 p-4 bg-purple-50 hover:bg-purple-100 text-purple-700 rounded-lg transition-colors">
                                    <span className="text-2xl">🗂️</span>
                                    <span className="font-medium">레이어 관리</span>
                                </button>
                                <button
                                    className="w-full flex items-center gap-3 p-4 bg-yellow-50 hover:bg-yellow-100 text-yellow-700 rounded-lg transition-colors">
                                    <span className="text-2xl">📤</span>
                                    <span className="font-medium">데이터 내보내기</span>
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Map Preview Placeholder */}
                    <div className="mt-6 bg-white rounded-xl p-6 shadow-sm border border-gray-100">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-lg font-semibold text-gray-800">지도 미리보기</h3>
                            <button
                                onClick={handleMapOpen}
                                className="text-blue-600 hover:text-blue-700 font-medium text-sm"
                            >
                                전체 화면으로 보기 →
                            </button>
                        </div>
                        <div className="h-64 bg-gray-100 rounded-lg flex items-center justify-center text-gray-400">
                            <div className="text-center">
                                <span className="text-4xl block mb-2">🗺️</span>
                                <p>지도를 불러오려면 클릭하세요</p>
                            </div>
                        </div>
                    </div>
                </main>
            </div>
        </div>
    )
}
