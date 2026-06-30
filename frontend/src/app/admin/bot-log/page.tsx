'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { RefreshCw, CheckCircle, XCircle, Bot, AlertTriangle, Send, BarChart2, Table } from 'lucide-react'
import Sidebar from '@/components/layout/Sidebar'
import Header from '@/components/layout/Header'
import {
    ResponsiveContainer,
    PieChart, Pie, Cell, Tooltip,
    BarChart, Bar, XAxis, YAxis, CartesianGrid,
} from 'recharts'

type BotLogType = 'COMMAND' | 'API_ERROR' | 'AUTO_SEND'
type PeriodMode = 'daily' | 'monthly'

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
    page: { totalElements: number; totalPages: number; number: number; size: number }
}

interface DayStat  { date: string; total: number; success: number; fail: number }
interface HourStat { hour: number; total: number; success: number; fail: number }

interface StatsData {
    total: number
    successCount: number
    failCount: number
    byType: Record<string, number>
    byDay: DayStat[]
    byHour: HourStat[]
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8080'

const TYPE_META: Record<BotLogType, { label: string; icon: React.ReactNode; color: string; chartColor: string }> = {
    COMMAND:   { label: '명령어',   icon: <Bot size={13} />,           color: 'bg-blue-500/15 text-blue-400 border-blue-500/30',       chartColor: '#3B82F6' },
    API_ERROR: { label: 'API 오류', icon: <AlertTriangle size={13} />, color: 'bg-red-500/15 text-red-400 border-red-500/30',         chartColor: '#EF4444' },
    AUTO_SEND: { label: '자동전송', icon: <Send size={13} />,          color: 'bg-purple-500/15 text-purple-400 border-purple-500/30', chartColor: '#A855F7' },
}

const TABS: { key: BotLogType | 'ALL'; label: string }[] = [
    { key: 'ALL',       label: '전체' },
    { key: 'COMMAND',   label: '명령어' },
    { key: 'API_ERROR', label: 'API 오류' },
    { key: 'AUTO_SEND', label: '자동전송' },
]

function toToday()     { return new Date().toISOString().slice(0, 10) }
function toThisMonth() { return new Date().toISOString().slice(0, 7) }

function formatDate(iso: string) {
    const d = new Date(iso)
    return d.toLocaleDateString('ko-KR', { month: '2-digit', day: '2-digit' })
        + ' ' + d.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

export default function BotLogPage() {
    const [tab,        setTab]        = useState<BotLogType | 'ALL'>('ALL')
    const [page,       setPage]       = useState(0)
    const [data,       setData]       = useState<PageData | null>(null)
    const [loading,    setLoading]    = useState(false)
    const [view,       setView]       = useState<'table' | 'chart'>('table')
    const [period,     setPeriod]     = useState<PeriodMode>('daily')
    const [dateVal,    setDateVal]    = useState(toToday)
    const [monthVal,   setMonthVal]   = useState(toThisMonth)
    const [stats,      setStats]      = useState<StatsData | null>(null)
    const [statsLoad,  setStatsLoad]  = useState(false)

    /* ── 테이블 데이터 fetch ── */
    const fetchLogs = useCallback(async () => {
        setLoading(true)
        try {
            const typeParam = tab !== 'ALL' ? `&type=${tab}` : ''
            const res  = await fetch(`${API_BASE}/api/bot-log?page=${page}&size=10${typeParam}`)
            const json = await res.json()
            if (json.success) setData(json.data)
        } finally {
            setLoading(false)
        }
    }, [tab, page])

    /* ── 차트 통계 fetch ── */
    const fetchStats = useCallback(async () => {
        setStatsLoad(true)
        try {
            const typeParam = tab !== 'ALL' ? `&type=${tab}` : ''
            const endpoint  = period === 'daily'
                ? `/api/bot-log/stats/daily?date=${dateVal}${typeParam}`
                : `/api/bot-log/stats/monthly?month=${monthVal}${typeParam}`
            const res  = await fetch(`${API_BASE}${endpoint}`)
            const json = await res.json()
            if (json.success) setStats(json.data)
        } finally {
            setStatsLoad(false)
        }
    }, [tab, period, dateVal, monthVal])

    useEffect(() => { setPage(0) }, [tab])
    useEffect(() => { fetchLogs() }, [fetchLogs])
    useEffect(() => { if (view === 'chart') fetchStats() }, [view, fetchStats])

    const logs = data?.content ?? []
    const successRate = stats ? Math.round(stats.successCount / (stats.total || 1) * 100) : 0

    const typeDistData = useMemo(() => {
        if (!stats) return []
        return (Object.entries(TYPE_META) as [BotLogType, typeof TYPE_META[BotLogType]][]).map(([key, m]) => ({
            name: m.label,
            value: stats.byType[key] ?? 0,
            color: m.chartColor,
        }))
    }, [stats])

    const successPieData = useMemo(() => stats ? [
        { name: '성공', value: stats.successCount, color: '#10B981' },
        { name: '실패', value: stats.failCount,    color: '#EF4444' },
    ] : [], [stats])

    const barData = useMemo(() => {
        if (!stats) return []
        if (period === 'daily') {
            return stats.byHour.map(h => ({
                label: `${String(h.hour).padStart(2, '0')}시`,
                성공: h.success,
                실패: h.fail,
            }))
        }
        return stats.byDay.map(d => ({
            label: d.date.slice(5),
            성공: d.success,
            실패: d.fail,
        }))
    }, [stats, period])

    const tooltipStyle = {
        backgroundColor: 'var(--bg-card)',
        border: '1px solid var(--border)',
        borderRadius: '8px',
        fontSize: '12px',
        color: 'var(--text-primary)',
    }

    return (
        <div className="flex min-h-screen" style={{ background: 'var(--bg-page)' }}>
            <Sidebar />
            <div className="flex-1 flex flex-col min-w-0">
                <Header title="봇 로그" breadcrumb={['기빵봇', '봇 로그']} />
                <main className="flex-1 p-3 sm:p-6 space-y-4 sm:space-y-5">

                    {/* 툴바 */}
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <p className="text-sm hidden sm:block" style={{ color: 'var(--text-muted)' }}>기빵봇 명령어 · 오류 · 자동전송 기록</p>
                        <div className="flex items-center gap-2 justify-end">
                            <div className="flex items-center p-0.5 rounded-lg" style={{ background: 'var(--bg-page)', border: '1px solid var(--border)' }}>
                                {(['table', 'chart'] as const).map((v) => (
                                    <button
                                        key={v}
                                        onClick={() => setView(v)}
                                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all"
                                        style={{
                                            background: view === v ? 'var(--bg-surface)' : 'transparent',
                                            border: view === v ? '1px solid var(--border)' : '1px solid transparent',
                                            color: view === v ? 'var(--accent)' : 'var(--text-faint)',
                                        }}
                                    >
                                        {v === 'table' ? <><Table size={13} /> 테이블</> : <><BarChart2 size={13} /> 차트</>}
                                    </button>
                                ))}
                            </div>
                            <button
                                onClick={view === 'chart' ? fetchStats : fetchLogs}
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
                                style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}
                            >
                                <RefreshCw size={13} className={(loading || statsLoad) ? 'animate-spin' : ''} />
                                새로고침
                            </button>
                        </div>
                    </div>

                    {/* 탭 */}
                    <div className="flex items-end justify-between" style={{ borderBottom: '1px solid var(--border)' }}>
                        <div className="flex gap-0.5 overflow-x-auto [&::-webkit-scrollbar]:hidden" style={{ scrollbarWidth: 'none' }}>
                            {TABS.map((t) => (
                                <button
                                    key={t.key}
                                    onClick={() => setTab(t.key)}
                                    className="px-3 py-2 sm:px-4 text-xs sm:text-sm font-medium transition-all border-b-2 -mb-px whitespace-nowrap shrink-0"
                                    style={{
                                        borderBottomColor: tab === t.key ? 'var(--accent)' : 'transparent',
                                        color: tab === t.key ? 'var(--accent)' : 'var(--text-muted)',
                                    }}
                                >
                                    {t.label}
                                </button>
                            ))}
                        </div>
                        <span className="text-xs pb-2 pr-1 shrink-0" style={{ color: 'var(--text-faint)' }}>
                            총 {data?.page?.totalElements ?? 0}건
                        </span>
                    </div>

                    {/* ── 차트 뷰 ── */}
                    {view === 'chart' && (
                        <div className="space-y-5">
                            {/* 기간 선택 */}
                            <div className="flex items-center gap-3">
                                <div className="flex items-center p-0.5 rounded-lg" style={{ background: 'var(--bg-page)', border: '1px solid var(--border)' }}>
                                    {(['daily', 'monthly'] as const).map((m) => (
                                        <button
                                            key={m}
                                            onClick={() => setPeriod(m)}
                                            className="px-3 py-1.5 rounded-md text-xs font-medium transition-all"
                                            style={{
                                                background: period === m ? 'var(--bg-surface)' : 'transparent',
                                                border: period === m ? '1px solid var(--border)' : '1px solid transparent',
                                                color: period === m ? 'var(--text-primary)' : 'var(--text-faint)',
                                            }}
                                        >
                                            {m === 'daily' ? '일별' : '월별'}
                                        </button>
                                    ))}
                                </div>

                                {period === 'daily' ? (
                                    <input
                                        type="date"
                                        value={dateVal}
                                        onChange={e => setDateVal(e.target.value)}
                                        className="px-3 py-1.5 rounded-lg text-xs transition-colors"
                                        style={{
                                            background: 'var(--bg-card)',
                                            border: '1px solid var(--border)',
                                            color: 'var(--text-primary)',
                                        }}
                                    />
                                ) : (
                                    <input
                                        type="month"
                                        value={monthVal}
                                        onChange={e => setMonthVal(e.target.value)}
                                        className="px-3 py-1.5 rounded-lg text-xs transition-colors"
                                        style={{
                                            background: 'var(--bg-card)',
                                            border: '1px solid var(--border)',
                                            color: 'var(--text-primary)',
                                        }}
                                    />
                                )}

                                <button
                                    onClick={fetchStats}
                                    className="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
                                    style={{ background: 'var(--accent)', color: '#fff' }}
                                >
                                    조회
                                </button>
                            </div>

                            {statsLoad ? (
                                <div className="flex items-center justify-center py-20" style={{ color: 'var(--text-faint)' }}>
                                    <RefreshCw size={20} className="animate-spin mr-2" /> 불러오는 중...
                                </div>
                            ) : !stats ? null : (
                                <>
                                    {/* 요약 카드 */}
                                    <div className="grid grid-cols-3 gap-4">
                                        {[
                                            { label: '전체 로그',  value: stats.total,        sub: `${period === 'daily' ? dateVal : monthVal} 기준` },
                                            { label: '성공률',     value: `${successRate}%`,  sub: `${stats.successCount}건 성공`, accent: true },
                                            { label: '실패',       value: stats.failCount,    sub: `${stats.byType['API_ERROR'] ?? 0}건 API 오류` },
                                        ].map((s, i) => (
                                            <div key={i} className="rounded-xl p-4" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
                                                <p className="text-xs font-medium mb-2" style={{ color: 'var(--text-muted)' }}>{s.label}</p>
                                                <p className="font-mono text-2xl font-medium tracking-tight" style={{ color: s.accent ? 'var(--accent)' : 'var(--text-primary)' }}>{s.value}</p>
                                                <p className="text-xs mt-1" style={{ color: 'var(--text-faint)' }}>{s.sub}</p>
                                            </div>
                                        ))}
                                    </div>

                                    {/* 도넛 차트 2개 */}
                                    <div className="grid grid-cols-2 gap-4">
                                        {[
                                            { title: '유형별 분포', items: typeDistData },
                                            { title: '성공 / 실패',  items: successPieData },
                                        ].map(({ title, items }) => (
                                            <div key={title} className="rounded-xl p-5" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
                                                <p className="text-sm font-medium mb-4" style={{ color: 'var(--text-secondary)' }}>{title}</p>
                                                <div className="flex items-center gap-6">
                                                    <ResponsiveContainer width={140} height={140}>
                                                        <PieChart>
                                                            <Pie data={items} cx="50%" cy="50%" innerRadius={38} outerRadius={60} paddingAngle={3} dataKey="value">
                                                                {items.map((e, i) => <Cell key={i} fill={e.color} />)}
                                                            </Pie>
                                                            <Tooltip contentStyle={tooltipStyle} />
                                                        </PieChart>
                                                    </ResponsiveContainer>
                                                    <div className="space-y-2">
                                                        {items.map(d => (
                                                            <div key={d.name} className="flex items-center gap-2">
                                                                <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: d.color }} />
                                                                <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{d.name}</span>
                                                                <span className="font-mono text-xs font-medium ml-auto" style={{ color: 'var(--text-primary)' }}>{d.value}</span>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>

                                    {/* 시간대별 / 일별 바 차트 */}
                                    <div className="rounded-xl p-5" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
                                        <p className="text-sm font-medium mb-4" style={{ color: 'var(--text-secondary)' }}>
                                            {period === 'daily' ? '시간대별 로그 현황' : '일별 로그 현황'}
                                        </p>
                                        <ResponsiveContainer width="100%" height={220}>
                                            <BarChart data={barData} barSize={period === 'daily' ? 12 : 8} barGap={2}>
                                                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                                                <XAxis dataKey="label" tick={{ fontSize: 10, fill: 'var(--text-faint)' }} axisLine={false} tickLine={false} interval={period === 'daily' ? 1 : 0} />
                                                <YAxis tick={{ fontSize: 10, fill: 'var(--text-faint)' }} axisLine={false} tickLine={false} width={24} allowDecimals={false} />
                                                <Tooltip contentStyle={tooltipStyle} cursor={{ fill: 'var(--bg-hover)' }} />
                                                <Bar dataKey="성공" fill="#10B981" radius={[3, 3, 0, 0]} stackId="a" />
                                                <Bar dataKey="실패" fill="#EF4444" radius={[3, 3, 0, 0]} stackId="a" />
                                            </BarChart>
                                        </ResponsiveContainer>
                                    </div>
                                </>
                            )}
                        </div>
                    )}

                    {/* ── 테이블 뷰 ── */}
                    {view === 'table' && (
                        <>
                            {/* 모바일: 카드형 */}
                            <div className="flex flex-col gap-3 sm:hidden">
                                {loading ? (
                                    <div className="flex items-center justify-center py-16" style={{ color: 'var(--text-faint)' }}>
                                        <RefreshCw size={20} className="animate-spin mr-2" /> 불러오는 중...
                                    </div>
                                ) : logs.length === 0 ? (
                                    <div className="text-center py-16 text-sm" style={{ color: 'var(--text-faint)' }}>로그가 없습니다.</div>
                                ) : logs.map((log, idx) => {
                                    const meta = TYPE_META[log.type]
                                    const seq = (data?.page.number ?? 0) * (data?.page.size ?? 10) + idx + 1
                                    return (
                                        <div key={log.id} className="rounded-xl p-3.5" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
                                            <div className="flex items-center justify-between mb-2.5">
                                                <div className="flex items-center gap-2">
                                                    <span className="text-xs font-mono" style={{ color: 'var(--text-faint)' }}>#{seq}</span>
                                                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-xs font-medium ${meta.color}`}>
                                                        {meta.icon}{meta.label}
                                                    </span>
                                                </div>
                                                {log.success
                                                    ? <span className="inline-flex items-center gap-1 text-emerald-500 text-xs"><CheckCircle size={12} /> 성공</span>
                                                    : <span className="inline-flex items-center gap-1 text-red-500 text-xs"><XCircle size={12} /> 실패</span>
                                                }
                                            </div>
                                            <div className="grid grid-cols-2 gap-y-1.5 text-xs mb-2.5">
                                                <span style={{ color: 'var(--text-faint)' }}>명령어</span>
                                                <span className="font-mono text-right" style={{ color: 'var(--text-primary)' }}>{log.command || '-'}</span>
                                                <span style={{ color: 'var(--text-faint)' }}>발신자</span>
                                                <span className="text-right truncate" style={{ color: 'var(--text-muted)' }}>{log.sender || '-'}</span>
                                                <span style={{ color: 'var(--text-faint)' }}>채팅방</span>
                                                <span className="text-right truncate" style={{ color: 'var(--text-muted)' }}>{log.room || '-'}</span>
                                                {log.detail && <>
                                                    <span style={{ color: 'var(--text-faint)' }}>상세</span>
                                                    <span className="text-right truncate" style={{ color: 'var(--text-muted)' }}>{log.detail}</span>
                                                </>}
                                            </div>
                                            <div className="text-xs font-mono pt-2" style={{ color: 'var(--text-faint)', borderTop: '1px solid var(--border-subtle)' }}>
                                                {formatDate(log.createdAt)}
                                            </div>
                                        </div>
                                    )
                                })}
                            </div>

                            {/* 태블릿 이상: 테이블 */}
                            <div className="hidden sm:block rounded-xl overflow-hidden" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
                                <div className="overflow-x-auto">
                                    <table className="text-sm" style={{ minWidth: '580px', width: '100%' }}>
                                        <thead>
                                            <tr className="text-xs" style={{ borderBottom: '1px solid var(--border)', color: 'var(--text-faint)', background: 'var(--bg-page)' }}>
                                                <th className="text-left px-3 py-3 w-10 whitespace-nowrap">순번</th>
                                                <th className="text-left px-3 py-3 w-24 whitespace-nowrap">구분</th>
                                                <th className="text-left px-3 py-3 w-16 whitespace-nowrap">상태</th>
                                                <th className="text-left px-3 py-3 whitespace-nowrap lg:hidden">발신자 · 방</th>
                                                <th className="text-left px-3 py-3 w-24 whitespace-nowrap hidden lg:table-cell">채팅방</th>
                                                <th className="text-left px-3 py-3 w-24 whitespace-nowrap hidden lg:table-cell">발신자</th>
                                                <th className="text-left px-3 py-3 w-28 whitespace-nowrap">명령어</th>
                                                <th className="text-left px-3 py-3 whitespace-nowrap hidden lg:table-cell">상세</th>
                                                <th className="text-left px-3 py-3 w-36 whitespace-nowrap">시각</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {loading ? (
                                                <tr>
                                                    <td colSpan={8} className="text-center py-16" style={{ color: 'var(--text-faint)' }}>
                                                        <RefreshCw size={20} className="animate-spin mx-auto mb-2" />
                                                        불러오는 중...
                                                    </td>
                                                </tr>
                                            ) : logs.length === 0 ? (
                                                <tr>
                                                    <td colSpan={8} className="text-center py-16 text-sm" style={{ color: 'var(--text-faint)' }}>로그가 없습니다.</td>
                                                </tr>
                                            ) : logs.map((log, idx) => {
                                                const meta = TYPE_META[log.type]
                                                const seq = (data?.page.number ?? 0) * (data?.page.size ?? 10) + idx + 1
                                                return (
                                                    <tr key={log.id} className="transition-colors" style={{ borderBottom: '1px solid var(--border-subtle)' }}
                                                        onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-hover)')}
                                                        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                                                    >
                                                        <td className="px-3 py-3 text-xs font-mono whitespace-nowrap" style={{ color: 'var(--text-faint)' }}>{seq}</td>
                                                        <td className="px-3 py-3 whitespace-nowrap">
                                                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-xs font-medium whitespace-nowrap ${meta.color}`}>
                                                                {meta.icon}{meta.label}
                                                            </span>
                                                        </td>
                                                        <td className="px-3 py-3 whitespace-nowrap">
                                                            {log.success
                                                                ? <span className="inline-flex items-center gap-1 text-emerald-500 text-xs whitespace-nowrap"><CheckCircle size={13} /> 성공</span>
                                                                : <span className="inline-flex items-center gap-1 text-red-500 text-xs whitespace-nowrap"><XCircle size={13} /> 실패</span>
                                                            }
                                                        </td>
                                                        {/* 태블릿: 발신자·방 병합 셀 */}
                                                        <td className="px-3 py-3 text-xs whitespace-nowrap lg:hidden" style={{ color: 'var(--text-muted)' }}>
                                                            <span>{log.sender || '-'}</span>
                                                            {log.room && <span style={{ color: 'var(--text-faint)' }}> · {log.room}</span>}
                                                        </td>
                                                        {/* 데스크톱: 분리 셀 */}
                                                        <td className="px-3 py-3 text-xs whitespace-nowrap hidden lg:table-cell" style={{ color: 'var(--text-muted)', maxWidth: '7rem', overflow: 'hidden', textOverflow: 'ellipsis' }}>{log.room || '-'}</td>
                                                        <td className="px-3 py-3 text-xs whitespace-nowrap hidden lg:table-cell" style={{ color: 'var(--text-muted)', maxWidth: '7rem', overflow: 'hidden', textOverflow: 'ellipsis' }}>{log.sender || '-'}</td>
                                                        <td className="px-3 py-3 text-xs font-mono whitespace-nowrap" style={{ color: 'var(--text-primary)' }}>{log.command || '-'}</td>
                                                        <td className="px-3 py-3 text-xs whitespace-nowrap hidden lg:table-cell" style={{ color: 'var(--text-muted)' }}>{log.detail || '-'}</td>
                                                        <td className="px-3 py-3 text-xs whitespace-nowrap font-mono" style={{ color: 'var(--text-faint)' }}>{formatDate(log.createdAt)}</td>
                                                    </tr>
                                                )
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            </div>

                            {(data?.page?.totalPages ?? 0) > 1 && (
                                <div className="flex items-center justify-center gap-2 mt-4">
                                    <button disabled={page === 0} onClick={() => setPage(p => p - 1)}
                                        className="px-3 py-1.5 rounded-lg text-sm disabled:opacity-30 transition-colors"
                                        style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}>
                                        이전
                                    </button>
                                    <span className="text-sm" style={{ color: 'var(--text-muted)' }}>{page + 1} / {data?.page?.totalPages}</span>
                                    <button disabled={page + 1 === data?.page?.totalPages} onClick={() => setPage(p => p + 1)}
                                        className="px-3 py-1.5 rounded-lg text-sm disabled:opacity-30 transition-colors"
                                        style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}>
                                        다음
                                    </button>
                                </div>
                            )}
                        </>
                    )}
                </main>
            </div>
        </div>
    )
}
