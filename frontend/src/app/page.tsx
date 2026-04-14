'use client'

import Sidebar from '@/components/layout/Sidebar'
import Header from '@/components/layout/Header'

const features = [
    {
        id: 'blog',
        title: '블로그',
        description: '개발 경험과 학습 내용을 기록하는 공간',
        icon: '✍️',
        href: '/blog',
        available: true,
    },
    {
        id: 'admin',
        title: '관리자',
        description: '사용자, 메뉴, 권한 등 시스템 관리',
        icon: '⚙️',
        href: '/admin',
        available: true,
    },
    {
        id: 'coming-soon',
        title: '추후 추가 예정',
        description: '새로운 기능이 추가될 예정입니다',
        icon: '🚧',
        href: null,
        available: false,
    },
]

export default function Home() {
    return (
        <div className="flex min-h-screen bg-gray-50">
            <Sidebar />

            <div className="flex-1 flex flex-col">
                <Header title="대시보드" />

                <main className="flex-1 p-8">
                    {/* Feature Cards */}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                        {features.map((f) => (
                            <div
                                key={f.id}
                                className={`bg-white rounded-xl p-6 border border-gray-100 shadow-sm transition-shadow ${
                                    f.available ? 'hover:shadow-md cursor-pointer' : 'opacity-50 cursor-not-allowed'
                                }`}
                                onClick={() => f.available && f.href && (location.href = f.href)}
                            >
                                <div className="text-3xl mb-3">{f.icon}</div>
                                <h3 className="text-lg font-semibold text-gray-800 mb-1">{f.title}</h3>
                                <p className="text-sm text-gray-500">{f.description}</p>
                            </div>
                        ))}
                    </div>
                </main>
            </div>
        </div>
    )
}
