'use client'

import Sidebar from '@/components/layout/Sidebar'
import Header from '@/components/layout/Header'

export default function Home() {
    return (
        <div className="flex min-h-screen" style={{ background: 'var(--bg-page)' }}>
            <Sidebar />
            <div className="flex-1 flex flex-col min-w-0">
                <Header title="대시보드" />
                <main className="flex-1 p-6" />
            </div>
        </div>
    )
}
