'use client'

import { useEffect, useState, useCallback } from 'react'
import { RefreshCw, CheckCircle, XCircle, Bot, AlertTriangle, Send } from 'lucide-react'
import Sidebar from '@/components/layout/Sidebar'
import Header from '@/components/layout/Header'

type BotLogType = 'COMMAND' | 'API_ERROR' | 'AUTO_SEND'

interface BotLog {
    id: number
    type: BotLogType
    room: string
    sender: string
    command: string
    detail: string
    success: boolean
    createdAt: string
}

interface PageData {
    content: BotLog[]
    page: {
        totalElements: number
        totalPages: number
        number: number
        size: number
    }
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8080'

const TYPE_META: Record<BotLogType, { label: string; icon: React.ReactNode; color: string }> = {
    COMMAND:   { label: '명령어',   icon: <Bot size={13} />,           color: 'bg-blue-500/15 text-blue-400 border-blue-500/30' },
    API_ERROR: { label: 'API 오류', icon: <AlertTriangle size={13} />, color: 'bg-red-500/15 text-red-400 border-red-500/30' },
    AUTO_SEND: { label: '자동전송', icon: <Send size={13} />,          color: 'bg-purple-500/15 text-purple-400 border-purple-500/30' },
}

const TABS: { key: BotLogType | 'ALL'; label: string }[] = [
    { key: 'ALL',       label: '전체' },
    { key: 'COMMAND',   label: '명령어' },
    { key: 'API_ERROR', label: 'API 오류' },
    { key: 'AUTO_SEND', label: '자동전송' },
]

function formatDate(iso: string) {
    const d = new Date(iso)
    return d.toLocaleDateString('ko-KR', { month: '2-digit', day: '2-digit' })
        + ' ' + d.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

export default function BotLogPage() {
    const [tab, setTab] = useState<BotLogType | 'ALL'>('ALL')
    const [page, setPage] = useState(0)
    const [data, setData] = useState<PageData | null>(null)
    const [loading, setLoading] = useState(false)

    const fetchLogs = useCallback(async () => {
        setLoading(true)
        try {
            const typeParam = tab !== 'ALL' ? `&type=${tab}` : ''
            const res = await fetch(`${API_BASE}/api/bot-log?page=${page}&size=50${typeParam}`)
            const json = await res.json()
            if (json.success) setData(json.data)
        } finally {
            setLoading(false)
        }
    }, [tab, page])

    useEffect(() => {
        setPage(0)
    }, [tab])

    useEffect(() => {
        fetchLogs()
    }, [fetchLogs])

    const logs = data?.content ?? []

    return (
        <div className="flex min-h-screen bg-gray-50">
            <Sidebar />
            <div className="flex-1 flex flex-col min-w-0">
                <Header title="봇 로그" breadcrumb={['관리자', '봇 로그']} />
                <main className="flex-1 p-6">
                    <div className="flex items-center justify-between mb-6">
                        <p className="text-gray-500 text-sm">기빵봇 명령어 · 오류 · 자동전송 기록</p>
                        <button
                            onClick={fetchLogs}
                            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-gray-200 text-gray-600 hover:text-gray-900 hover:bg-gray-300 text-sm transition-all"
                        >
                            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
                            새로고침
                        </button>
                    </div>

                    {/* 탭 */}
                    <div className="flex gap-1 mb-4 border-b border-gray-300 pb-0">
                        {TABS.map((t) => (
                            <button
                                key={t.key}
                                onClick={() => setTab(t.key)}
                                className={`px-4 py-2 text-sm font-medium transition-all border-b-2 -mb-px
                                    ${tab === t.key
                                        ? 'border-blue-500 text-blue-600'
                                        : 'border-transparent text-gray-500 hover:text-gray-700'}`}
                            >
                                {t.label}
                            </button>
                        ))}
                        <span className="ml-auto text-gray-500 text-xs self-center pr-1">
                            총 {data?.page?.totalElements ?? 0}건
                        </span>
                    </div>

                    {/* 테이블 */}
                    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="border-b border-gray-100 bg-gray-50 text-gray-500 text-xs uppercase tracking-wide">
                                        <th className="text-left px-4 py-3 w-36">시각</th>
                                        <th className="text-left px-4 py-3 w-32">구분</th>
                                        <th className="text-left px-4 py-3 w-24">상태</th>
                                        <th className="text-left px-4 py-3 w-28">채팅방</th>
                                        <th className="text-left px-4 py-3 w-28">발신자</th>
                                        <th className="text-left px-4 py-3 w-32">명령어</th>
                                        <th className="text-left px-4 py-3">상세</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-50">
                                    {loading ? (
                                        <tr>
                                            <td colSpan={7} className="text-center py-16 text-gray-400">
                                                <RefreshCw size={20} className="animate-spin mx-auto mb-2" />
                                                불러오는 중...
                                            </td>
                                        </tr>
                                    ) : logs.length === 0 ? (
                                        <tr>
                                            <td colSpan={7} className="text-center py-16 text-gray-400 text-sm">
                                                로그가 없습니다.
                                            </td>
                                        </tr>
                                    ) : logs.map((log) => {
                                        const meta = TYPE_META[log.type]
                                        return (
                                            <tr key={log.id} className="hover:bg-gray-50/60 transition-colors">
                                                <td className="px-4 py-3 text-gray-400 text-xs whitespace-nowrap">
                                                    {formatDate(log.createdAt)}
                                                </td>
                                                <td className="px-4 py-3">
                                                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-xs font-medium ${meta.color}`}>
                                                        {meta.icon}
                                                        {meta.label}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-3">
                                                    {log.success ? (
                                                        <span className="inline-flex items-center gap-1 text-emerald-600 text-xs">
                                                            <CheckCircle size={13} /> 성공
                                                        </span>
                                                    ) : (
                                                        <span className="inline-flex items-center gap-1 text-red-500 text-xs">
                                                            <XCircle size={13} /> 실패
                                                        </span>
                                                    )}
                                                </td>
                                                <td className="px-4 py-3 text-gray-600 text-xs truncate max-w-[7rem]">
                                                    {log.room || '-'}
                                                </td>
                                                <td className="px-4 py-3 text-gray-600 text-xs truncate max-w-[7rem]">
                                                    {log.sender || '-'}
                                                </td>
                                                <td className="px-4 py-3 text-gray-800 text-xs font-mono">
                                                    {log.command || '-'}
                                                </td>
                                                <td className="px-4 py-3 text-gray-500 text-xs">
                                                    {log.detail || '-'}
                                                </td>
                                            </tr>
                                        )
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* 페이지네이션 */}
                    {(data?.page?.totalPages ?? 0) > 1 && (
                        <div className="flex items-center justify-center gap-2 mt-4">
                            <button
                                disabled={page === 0}
                                onClick={() => setPage(p => p - 1)}
                                className="px-3 py-1.5 rounded-lg bg-gray-200 text-gray-600 text-sm disabled:opacity-30 hover:bg-gray-300 transition-all"
                            >
                                이전
                            </button>
                            <span className="text-gray-500 text-sm">
                                {page + 1} / {data?.page?.totalPages}
                            </span>
                            <button
                                disabled={page + 1 === data?.page?.totalPages}
                                onClick={() => setPage(p => p + 1)}
                                className="px-3 py-1.5 rounded-lg bg-gray-200 text-gray-600 text-sm disabled:opacity-30 hover:bg-gray-300 transition-all"
                            >
                                다음
                            </button>
                        </div>
                    )}
                </main>
            </div>
        </div>
    )
}
