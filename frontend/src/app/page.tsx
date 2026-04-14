'use client'

import Link from 'next/link'
import Sidebar from '@/components/layout/Sidebar'
import Header from '@/components/layout/Header'
import { useAuthStore } from '@/store/authStore'
import {
    Map,
    BookOpen,
    Settings,
    ArrowUpRight,
    Layers,
    Activity,
    Clock,
    TrendingUp,
    Zap,
    Globe,
} from 'lucide-react'

/* 퀵 액세스 카드 데이터 */
const features = [
    {
        id: 'map',
        title: '지도',
        description: 'OpenLayers 기반 VWorld 지도. 레이어 관리, 거리/면적 측정, 도형 그리기 지원.',
        icon: <Map size={22} />,
        href: '/map',
        available: true,
        badge: '활성',
        badgeColor: 'green',
        tags: ['WMTS', 'WMS', 'OpenLayers'],
    },
    {
        id: 'blog',
        title: '블로그',
        description: '개발 경험과 학습 내용을 기록하는 공간.',
        icon: <BookOpen size={22} />,
        href: '/blog',
        available: true,
        badge: '활성',
        badgeColor: 'green',
        tags: ['기록', '개발'],
    },
    {
        id: 'admin',
        title: '관리자',
        description: '사용자, 메뉴, 권한 등 시스템 관리.',
        icon: <Settings size={22} />,
        href: '/admin',
        available: true,
        badge: '활성',
        badgeColor: 'green',
        tags: ['사용자', '권한'],
    },
]

/* 최근 활동 데이터 */
const recentActivities = [
    { id: 1, action: '지도 레이어 추가', time: '방금 전', icon: <Layers size={14} /> },
    { id: 2, action: '시스템 업데이트', time: '1시간 전', icon: <TrendingUp size={14} /> },
    { id: 3, action: '사용자 로그인', time: '2시간 전', icon: <Activity size={14} /> },
    { id: 4, action: '설정 변경', time: '어제', icon: <Settings size={14} /> },
]

/* 색상 매핑 */
const colorMap: Record<string, string> = {
    blue:    'bg-blue-50 text-blue-600',
    indigo:  'bg-indigo-50 text-indigo-600',
    violet:  'bg-violet-50 text-violet-600',
    emerald: 'bg-emerald-50 text-emerald-600',
}

export default function Home() {
    const { user } = useAuthStore()

    const now      = new Date()
    const hour     = now.getHours()
    const greeting = hour < 12 ? '좋은 아침이에요' : hour < 18 ? '안녕하세요' : '좋은 저녁이에요'
    const name     = user?.nickname ?? user?.userId ?? '사용자'

    const stats = [
        {
            label: '지도 레이어',
            value: '12',
            change: '+3',
            trend: 'up',
            icon: <Layers size={18} />,
            color: 'blue',
        },
        {
            label: '활성 기능',
            value: '4',
            change: '+1',
            trend: 'up',
            icon: <Zap size={18} />,
            color: 'indigo',
        },
        {
            label: '방문 횟수',
            value: '128',
            change: '+24',
            trend: 'up',
            icon: <Activity size={18} />,
            color: 'violet',
        },
        {
            label: '업타임',
            value: '99.9%',
            change: '안정',
            trend: 'stable',
            icon: <Globe size={18} />,
            color: 'emerald',
        },
    ]

    return (
        <div className="flex min-h-screen bg-gray-50">
            <Sidebar />

            <div className="flex-1 flex flex-col min-w-0">
                <Header title="대시보드" />

                <main className="flex-1 p-6 space-y-6">
                    {/* 웰컴 배너 */}
                    <div className="relative bg-gradient-to-r from-blue-600 via-blue-700 to-indigo-700 rounded-2xl p-6 overflow-hidden">
                        <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full -translate-y-1/2 translate-x-1/4 pointer-events-none" />
                        <div className="absolute bottom-0 right-24 w-32 h-32 bg-white/5 rounded-full translate-y-1/2 pointer-events-none" />

                        <div className="relative">
                            <p className="text-blue-200 text-sm font-medium mb-1">
                                {greeting}, <span className="text-white font-semibold">{name}</span>님 👋
                            </p>
                            <h2 className="text-white text-2xl font-bold mb-1">GT Project 대시보드</h2>
                            {user?.roleLabel && (
                                <p className="text-blue-300 text-xs mb-2">{user.roleLabel}</p>
                            )}
                            <p className="text-blue-100 text-sm max-w-md">
                                지도, 블로그, 관리자 기능을 한 곳에서 관리하세요.
                            </p>
                            <div className="flex items-center gap-2 mt-4">
                                <div className="flex items-center gap-1.5 bg-white/15 backdrop-blur-sm rounded-full px-3 py-1.5 text-white text-xs">
                                    <Clock size={12} />
                                    {now.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' })}
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* 통계 카드 */}
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                        {stats.map((stat, i) => (
                            <div
                                key={i}
                                className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm hover:shadow-md transition-shadow"
                            >
                                <div className="flex items-center justify-between mb-3">
                                    <span className="text-gray-500 text-xs font-medium">{stat.label}</span>
                                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${colorMap[stat.color]}`}>
                                        {stat.icon}
                                    </div>
                                </div>
                                <p className="text-2xl font-bold text-gray-900">{stat.value}</p>
                                <div className="flex items-center gap-1 mt-1">
                                    {stat.trend === 'up' && <TrendingUp size={12} className="text-emerald-500" />}
                                    <span className={`text-xs font-medium ${stat.trend === 'up' ? 'text-emerald-500' : 'text-gray-400'}`}>
                                        {stat.change}
                                    </span>
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* 하단 2열 레이아웃 */}
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                        {/* 퀵 액세스 */}
                        <div className="lg:col-span-2 space-y-3">
                            <h3 className="text-sm font-semibold text-gray-700">빠른 액세스</h3>
                            <div className="space-y-3">
                                {features.map((f) => (
                                    <Link
                                        key={f.id}
                                        href={f.available && f.href ? f.href : '#'}
                                        className={`group flex items-center gap-4 bg-white rounded-xl p-4 border border-gray-100 shadow-sm transition-all
                                            ${f.available ? 'hover:shadow-md hover:border-gray-200 cursor-pointer' : 'opacity-50 cursor-not-allowed pointer-events-none'}`}
                                    >
                                        <div className="w-11 h-11 bg-gray-50 group-hover:bg-blue-50 rounded-xl flex items-center justify-center text-gray-500 group-hover:text-blue-600 transition-colors shrink-0">
                                            {f.icon}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2 mb-0.5">
                                                <span className="font-semibold text-gray-800 text-sm">{f.title}</span>
                                                <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full
                                                    ${f.badgeColor === 'green' ? 'bg-emerald-100 text-emerald-600' : 'bg-gray-100 text-gray-500'}`}>
                                                    {f.badge}
                                                </span>
                                            </div>
                                            <p className="text-xs text-gray-500 truncate">{f.description}</p>
                                            <div className="flex gap-1.5 mt-2">
                                                {f.tags.map((tag) => (
                                                    <span key={tag} className="text-[10px] bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">
                                                        {tag}
                                                    </span>
                                                ))}
                                            </div>
                                        </div>
                                        <ArrowUpRight
                                            size={16}
                                            className="text-gray-300 group-hover:text-blue-500 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-all shrink-0"
                                        />
                                    </Link>
                                ))}
                            </div>
                        </div>

                        {/* 최근 활동 */}
                        <div className="space-y-3">
                            <h3 className="text-sm font-semibold text-gray-700">최근 활동</h3>
                            <div className="bg-white rounded-xl border border-gray-100 shadow-sm divide-y divide-gray-50">
                                {recentActivities.map((activity) => (
                                    <div key={activity.id} className="flex items-start gap-3 p-4">
                                        <div className="w-7 h-7 bg-gray-50 rounded-lg flex items-center justify-center text-gray-400 shrink-0 mt-0.5">
                                            {activity.icon}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm text-gray-700 font-medium">{activity.action}</p>
                                            <p className="text-xs text-gray-400 mt-0.5">{activity.time}</p>
                                        </div>
                                    </div>
                                ))}
                                <div className="p-3">
                                    <button className="w-full text-xs text-blue-500 hover:text-blue-700 font-medium py-1 hover:bg-blue-50 rounded-lg transition-colors">
                                        전체 활동 보기
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </main>
            </div>
        </div>
    )
}
