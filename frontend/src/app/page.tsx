'use client'
// test

import { useEffect, useState } from 'react'
import Link from 'next/link'
import Sidebar from '@/components/layout/Sidebar'
import Header from '@/components/layout/Header'
import { useAuthStore } from '@/stores/authStore'

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8080'

interface DailyStats {
    total: number
    successCount: number
    failCount: number
    byType: Record<string, number>
}

interface BotLogItem {
    id: number
    type: string
    room: string
    sender: string
    command: string
    detail?: string
    success: boolean
    createdAt: string
}

interface PartyInfo {
    raidName: string
    time: string
    members: string[]
}

interface UserItem {
    userId: string
    userName: string
    nickname: string
    roleLabel: string
}

interface PostItem {
    id: number
    title: string
    categoryLabel: string
    emoji: string
    createdAt: string
}

function KpiCard({ label, value, sub, color }: { label: string; value: string; sub?: string; color: string }) {
    return (
        <div className="rounded-lg p-4" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
            <p className="text-xs mb-2" style={{ color: 'var(--text-faint)' }}>{label}</p>
            <p className="text-2xl font-bold mb-1" style={{ color }}>{value}</p>
            {sub && <p className="text-xs" style={{ color: 'var(--text-faint)' }}>{sub}</p>}
        </div>
    )
}

function Widget({ title, href, linkLabel = '전체 보기 →', children }: {
    title: string; href: string; linkLabel?: string; children: React.ReactNode
}) {
    return (
        <div className="rounded-lg flex flex-col" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
            <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{title}</span>
                <Link href={href} className="text-xs" style={{ color: 'var(--accent)' }}>{linkLabel}</Link>
            </div>
            <div className="p-4">{children}</div>
        </div>
    )
}

function Empty({ text }: { text: string }) {
    return <p className="text-xs" style={{ color: 'var(--text-faint)' }}>{text}</p>
}

export default function Home() {
    const { token } = useAuthStore()

    const [stats, setStats]         = useState<DailyStats | null>(null)
    const [userTotal, setUserTotal] = useState<number>(0)
    const [logs, setLogs]           = useState<BotLogItem[]>([])
    const [parties, setParties]     = useState<PartyInfo[]>([])
    const [users, setUsers]         = useState<UserItem[]>([])
    const [posts, setPosts]         = useState<PostItem[]>([])

    useEffect(() => {
        const today = new Date().toISOString().split('T')[0]
        const auth: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {}

        fetch(`${API}/api/bot-log/stats/daily?date=${today}`)
            .then(r => r.json()).then(d => { if (d.success) setStats(d.data) }).catch(() => {})

        fetch(`${API}/api/bot-log?page=0&size=5&type=COMMAND`)
            .then(r => r.json()).then(d => { if (d.success) setLogs(d.data?.content ?? []) }).catch(() => {})

        fetch(`${API}/api/schedule/today`)
            .then(r => r.json()).then(d => { if (d.success) setParties(d.data ?? []) }).catch(() => {})

        fetch(`${API}/api/users?page=0&size=5`, { headers: auth })
            .then(r => r.json()).then(d => {
                if (d.success) {
                    setUsers(d.data?.content ?? [])
                    setUserTotal(d.data?.page?.totalElements ?? 0)
                }
            }).catch(() => {})

        fetch(`${API}/api/posts?page=0&size=3`)
            .then(r => r.json()).then(d => { if (d.success) setPosts(d.data?.content ?? []) }).catch(() => {})
    }, [token])

    const successRate = stats && stats.total > 0
        ? Math.round((stats.successCount / stats.total) * 100)
        : 0

    return (
        <div className="flex min-h-screen" style={{ background: 'var(--bg-page)' }}>
            <Sidebar />
            <div className="flex-1 flex flex-col min-w-0">
                <Header title="대시보드" />
                <main className="flex-1 p-6 space-y-4">

                    {/* KPI 카드 */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                        <KpiCard
                            label="오늘 명령어"
                            value={String(stats?.byType?.COMMAND ?? 0)}
                            sub="오늘 처리된 명령어"
                            color="var(--accent)"
                        />
                        <KpiCard
                            label="성공률"
                            value={`${successRate}%`}
                            sub={`성공 ${stats?.successCount ?? 0} / 전체 ${stats?.total ?? 0}`}
                            color="#22c55e"
                        />
                        <KpiCard
                            label="오류"
                            value={String(stats?.byType?.API_ERROR ?? 0)}
                            sub="API 오류 건수"
                            color="#ef4444"
                        />
                        <KpiCard
                            label="총 사용자"
                            value={String(userTotal)}
                            sub="등록된 사용자"
                            color="var(--text-secondary)"
                        />
                    </div>

                    {/* 중단 위젯 */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

                        <Widget title="최근 봇 로그" href="/admin/bot-log">
                            {logs.length === 0
                                ? <Empty text="오늘 명령어 로그 없음" />
                                : <ul className="space-y-2.5">
                                    {logs.map(log => (
                                        <li key={log.id} className="flex items-start gap-2 text-xs">
                                            <span
                                                className="shrink-0 rounded-full"
                                                style={{
                                                    width: 6, height: 6, marginTop: 4,
                                                    background: log.success ? '#22c55e' : '#ef4444',
                                                    flexShrink: 0,
                                                }}
                                            />
                                            <div className="min-w-0">
                                                <p className="font-mono truncate" style={{ color: 'var(--text-primary)' }}>
                                                    {log.command}{log.detail ? ` ${log.detail}` : ''}
                                                </p>
                                                <p className="truncate" style={{ color: 'var(--text-faint)' }}>
                                                    {[log.room, log.sender, log.createdAt?.slice(11, 16)].filter(Boolean).join(' · ')}
                                                </p>
                                            </div>
                                        </li>
                                    ))}
                                </ul>
                            }
                        </Widget>

                        <Widget title="오늘의 레이드" href="/admin/bot-log" linkLabel="봇 로그 →">
                            {parties.length === 0
                                ? <Empty text="오늘 등록된 레이드 없음" />
                                : <ul className="space-y-3">
                                    {parties.map((p, i) => (
                                        <li key={i}>
                                            <p className="text-xs font-semibold mb-0.5" style={{ color: 'var(--text-primary)' }}>
                                                ◆ {p.raidName}
                                                {p.time && (
                                                    <span className="ml-1 font-normal" style={{ color: 'var(--text-faint)' }}>
                                                        {p.time}
                                                    </span>
                                                )}
                                            </p>
                                            <p className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>
                                                {p.members.join(' · ')}
                                            </p>
                                        </li>
                                    ))}
                                </ul>
                            }
                        </Widget>
                    </div>

                    {/* 하단 위젯 */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">

                        <Widget title="사용자 목록" href="/admin/user" linkLabel="관리 →">
                            {users.length === 0
                                ? <Empty text="사용자 없음" />
                                : <ul className="space-y-2">
                                    {users.map(u => (
                                        <li key={u.userId} className="flex items-center justify-between text-xs">
                                            <div className="min-w-0">
                                                <span style={{ color: 'var(--text-primary)' }}>
                                                    {u.nickname || u.userName}
                                                </span>
                                                <span className="ml-1" style={{ color: 'var(--text-faint)' }}>
                                                    ({u.userId})
                                                </span>
                                            </div>
                                            <span
                                                className="shrink-0 px-1.5 py-0.5 rounded text-[10px]"
                                                style={{ background: 'var(--accent-bg)', color: 'var(--accent)' }}
                                            >
                                                {u.roleLabel}
                                            </span>
                                        </li>
                                    ))}
                                </ul>
                            }
                        </Widget>

                        <Widget title="지도" href="/map" linkLabel="바로가기 →">
                            <div className="flex flex-col gap-2">
                                <Link
                                    href="/map"
                                    className="flex items-center justify-center gap-2 rounded-md py-3 text-sm font-medium transition-colors"
                                    style={{ background: 'var(--accent-bg)', color: 'var(--accent)', border: '1px solid var(--accent-border)' }}
                                >
                                    지도 보기
                                </Link>
                                <Link
                                    href="/map-admin/layer"
                                    className="flex items-center justify-center gap-2 rounded-md py-2 text-xs transition-colors"
                                    style={{ background: 'var(--bg-page)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}
                                >
                                    레이어 관리
                                </Link>
                            </div>
                        </Widget>

                        <Widget title="최근 게시글" href="/admin/blog" linkLabel="관리 →">
                            {posts.length === 0
                                ? <Empty text="게시글 없음" />
                                : <ul className="space-y-2.5">
                                    {posts.map(post => (
                                        <li key={post.id} className="flex items-start gap-2 text-xs">
                                            {post.emoji && (
                                                <span className="shrink-0 text-sm leading-none mt-0.5">{post.emoji}</span>
                                            )}
                                            <div className="min-w-0">
                                                <p className="truncate" style={{ color: 'var(--text-primary)' }}>
                                                    {post.title}
                                                </p>
                                                <p style={{ color: 'var(--text-faint)' }}>
                                                    {post.categoryLabel} · {post.createdAt?.slice(0, 10)}
                                                </p>
                                            </div>
                                        </li>
                                    ))}
                                </ul>
                            }
                        </Widget>
                    </div>

                </main>
            </div>
        </div>
    )
}
