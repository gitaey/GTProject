'use client'

import { useCallback, useEffect, useState } from 'react'
import Sidebar from '@/components/layout/Sidebar'
import Header from '@/components/layout/Header'
import Pagination from '@/components/common/Pagination'
import { getToken } from '@/stores/authStore'

/* ── 타입 ── */
interface ApiResponse<T> {
    success: boolean
    message: string
    data: T
}

interface AccessLogItem {
    id: number
    userId: string
    path: string
    pageTitle: string
    accessedAt: string
}

interface AccessLogPage {
    content: AccessLogItem[]
    totalElements: number
    totalPages: number
    number: number
    size: number
}

interface AccessLogStats {
    userId: string
    visitCount: number
}

type TabType = 'logs' | 'stats'

/* ── API 헬퍼 ── */
const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8080'

async function apiFetch<T>(url: string, options?: RequestInit): Promise<T> {
    const token = getToken()
    const headers: Record<string, string> = {
        ...(options?.headers as Record<string, string> ?? {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
    }
    if (options?.body) headers['Content-Type'] = 'application/json'

    const res = await fetch(`${API}${url}`, { ...options, headers })
    if (res.status === 204) return undefined as T
    if (res.status === 401) {
        window.location.href = '/login'
        throw new Error('Unauthorized')
    }
    const json: ApiResponse<T> = await res.json()
    if (!json.success) throw new Error(json.message)
    return json.data
}

function formatDateTime(iso: string) {
    return new Date(iso).toLocaleString('ko-KR', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
    })
}

export default function AccessLogPage() {
    const [activeTab, setActiveTab] = useState<TabType>('logs')

    /* ── 전체 로그 상태 ── */
    const [logPage, setLogPage]       = useState<AccessLogPage | null>(null)
    const [logLoading, setLogLoading] = useState(false)
    const [logError, setLogError]     = useState<string | null>(null)
    const [currentPage, setCurrentPage] = useState(0)

    /* ── 유저별 통계 상태 ── */
    const [stats, setStats]           = useState<AccessLogStats[]>([])
    const [statsLoading, setStatsLoading] = useState(false)
    const [statsError, setStatsError] = useState<string | null>(null)

    /* ── 전체 로그 조회 ── */
    const loadLogs = useCallback(async () => {
        setLogLoading(true)
        setLogError(null)
        try {
            const data = await apiFetch<AccessLogPage>(
                `/api/access-log?page=${currentPage}&size=20`
            )
            setLogPage(data)
        } catch (e) {
            setLogError(e instanceof Error ? e.message : '로그를 불러오는데 실패했습니다.')
        } finally {
            setLogLoading(false)
        }
    }, [currentPage])

    /* ── 유저별 통계 조회 ── */
    const loadStats = useCallback(async () => {
        setStatsLoading(true)
        setStatsError(null)
        try {
            const data = await apiFetch<AccessLogStats[]>('/api/access-log/stats')
            setStats(data)
        } catch (e) {
            setStatsError(e instanceof Error ? e.message : '통계를 불러오는데 실패했습니다.')
        } finally {
            setStatsLoading(false)
        }
    }, [])

    useEffect(() => {
        if (activeTab === 'logs') loadLogs()
    }, [activeTab, loadLogs])

    useEffect(() => {
        if (activeTab === 'stats') loadStats()
    }, [activeTab, loadStats])

    const logs        = logPage?.content ?? []
    const totalPages  = logPage?.totalPages ?? 0

    const inputStyle: React.CSSProperties = {
        background: 'var(--bg-page)',
        border: '1px solid var(--border)',
        color: 'var(--text-primary)',
        borderRadius: '8px',
    }

    return (
        <div className="flex min-h-screen" style={{ background: 'var(--bg-page)' }}>
            <Sidebar />
            <div className="flex-1 flex flex-col min-w-0">
                <Header title="접속 로그" breadcrumb={['관리자', '접속 로그']} />

                <main className="flex-1 p-6 space-y-4">
                    {/* 탭 */}
                    <div className="flex gap-1 p-1 rounded-xl w-fit"
                        style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
                        {([
                            { key: 'logs',  label: '전체 로그' },
                            { key: 'stats', label: '유저별 통계' },
                        ] as { key: TabType; label: string }[]).map(({ key, label }) => (
                            <button
                                key={key}
                                onClick={() => setActiveTab(key)}
                                className="px-4 py-1.5 text-sm font-medium rounded-lg transition-colors"
                                style={activeTab === key
                                    ? { background: 'var(--accent)', color: '#fff' }
                                    : { color: 'var(--text-muted)' }
                                }
                            >
                                {label}
                            </button>
                        ))}
                    </div>

                    {/* ── 전체 로그 탭 ── */}
                    {activeTab === 'logs' && (
                        <div className="rounded-xl overflow-hidden"
                            style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
                            <div className="px-6 py-3 flex items-center justify-between"
                                style={{ borderBottom: '1px solid var(--border)' }}>
                                <span className="text-sm" style={{ color: 'var(--text-muted)' }}>
                                    총{' '}
                                    <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>
                                        {logPage?.totalElements ?? 0}
                                    </span>
                                    건
                                </span>
                                <button
                                    onClick={loadLogs}
                                    className="text-xs px-3 py-1.5 rounded-lg transition-colors"
                                    style={{ background: 'var(--bg-hover)', color: 'var(--text-muted)' }}
                                >
                                    새로 고침
                                </button>
                            </div>

                            {logError && (
                                <div className="mx-6 mt-4 px-4 py-3 rounded-lg text-sm"
                                    style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', color: '#ef4444' }}>
                                    {logError}
                                </div>
                            )}

                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr style={{ background: 'var(--bg-hover)', borderBottom: '1px solid var(--border)' }}>
                                            {['NO.', '사용자 ID', '페이지명', '경로', '접속 시각'].map((h) => (
                                                <th key={h}
                                                    className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wide"
                                                    style={{ color: 'var(--text-muted)' }}>
                                                    {h}
                                                </th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {logLoading ? (
                                            <tr>
                                                <td colSpan={5} className="text-center py-16">
                                                    <div className="flex flex-col items-center gap-2">
                                                        <div className="w-6 h-6 border-2 border-t-transparent rounded-full animate-spin"
                                                            style={{ borderColor: 'var(--accent)', borderTopColor: 'transparent' }} />
                                                        <span className="text-sm" style={{ color: 'var(--text-muted)' }}>불러오는 중...</span>
                                                    </div>
                                                </td>
                                            </tr>
                                        ) : logs.length === 0 ? (
                                            <tr>
                                                <td colSpan={5} className="text-center py-16 text-sm"
                                                    style={{ color: 'var(--text-faint)' }}>
                                                    접속 로그가 없습니다.
                                                </td>
                                            </tr>
                                        ) : (
                                            logs.map((log, idx) => (
                                                <tr key={log.id}
                                                    className="transition-colors hover:bg-[var(--bg-hover)]"
                                                    style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                                                    <td className="px-4 py-3 text-xs" style={{ color: 'var(--text-faint)' }}>
                                                        {currentPage * 20 + idx + 1}
                                                    </td>
                                                    <td className="px-4 py-3 font-medium" style={{ color: 'var(--text-primary)' }}>
                                                        {log.userId}
                                                    </td>
                                                    <td className="px-4 py-3" style={{ color: 'var(--text-secondary)' }}>
                                                        {log.pageTitle ?? '-'}
                                                    </td>
                                                    <td className="px-4 py-3 font-mono text-xs" style={{ color: 'var(--text-muted)' }}>
                                                        {log.path}
                                                    </td>
                                                    <td className="px-4 py-3 text-xs" style={{ color: 'var(--text-faint)' }}>
                                                        {formatDateTime(log.accessedAt)}
                                                    </td>
                                                </tr>
                                            ))
                                        )}
                                    </tbody>
                                </table>
                            </div>

                            <div className="px-6 py-4" style={{ borderTop: '1px solid var(--border)' }}>
                                <Pagination
                                    currentPage={currentPage}
                                    totalPages={totalPages}
                                    onChange={setCurrentPage}
                                />
                            </div>
                        </div>
                    )}

                    {/* ── 유저별 통계 탭 ── */}
                    {activeTab === 'stats' && (
                        <div className="rounded-xl overflow-hidden"
                            style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
                            <div className="px-6 py-3 flex items-center justify-between"
                                style={{ borderBottom: '1px solid var(--border)' }}>
                                <span className="text-sm" style={{ color: 'var(--text-muted)' }}>
                                    총{' '}
                                    <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>
                                        {stats.length}
                                    </span>
                                    명
                                </span>
                                <button
                                    onClick={loadStats}
                                    className="text-xs px-3 py-1.5 rounded-lg transition-colors"
                                    style={{ background: 'var(--bg-hover)', color: 'var(--text-muted)' }}
                                >
                                    새로 고침
                                </button>
                            </div>

                            {statsError && (
                                <div className="mx-6 mt-4 px-4 py-3 rounded-lg text-sm"
                                    style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', color: '#ef4444' }}>
                                    {statsError}
                                </div>
                            )}

                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr style={{ background: 'var(--bg-hover)', borderBottom: '1px solid var(--border)' }}>
                                            {['NO.', '사용자 ID', '방문 횟수'].map((h) => (
                                                <th key={h}
                                                    className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wide"
                                                    style={{ color: 'var(--text-muted)' }}>
                                                    {h}
                                                </th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {statsLoading ? (
                                            <tr>
                                                <td colSpan={3} className="text-center py-16">
                                                    <div className="flex flex-col items-center gap-2">
                                                        <div className="w-6 h-6 border-2 border-t-transparent rounded-full animate-spin"
                                                            style={{ borderColor: 'var(--accent)', borderTopColor: 'transparent' }} />
                                                        <span className="text-sm" style={{ color: 'var(--text-muted)' }}>불러오는 중...</span>
                                                    </div>
                                                </td>
                                            </tr>
                                        ) : stats.length === 0 ? (
                                            <tr>
                                                <td colSpan={3} className="text-center py-16 text-sm"
                                                    style={{ color: 'var(--text-faint)' }}>
                                                    통계 데이터가 없습니다.
                                                </td>
                                            </tr>
                                        ) : (
                                            stats.map((stat, idx) => (
                                                <tr key={stat.userId}
                                                    className="transition-colors hover:bg-[var(--bg-hover)]"
                                                    style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                                                    <td className="px-4 py-3 text-xs" style={{ color: 'var(--text-faint)' }}>
                                                        {idx + 1}
                                                    </td>
                                                    <td className="px-4 py-3 font-medium" style={{ color: 'var(--text-primary)' }}>
                                                        {stat.userId}
                                                    </td>
                                                    <td className="px-4 py-3">
                                                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold"
                                                            style={{ background: 'var(--accent-bg)', color: 'var(--accent)' }}>
                                                            {stat.visitCount.toLocaleString()}회
                                                        </span>
                                                    </td>
                                                </tr>
                                            ))
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                </main>
            </div>
        </div>
    )
}
