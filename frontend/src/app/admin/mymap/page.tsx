'use client'

import { useCallback, useEffect, useState } from 'react'
import Sidebar from '@/components/layout/Sidebar'
import Header from '@/components/layout/Header'
import { getToken } from '@/stores/authStore'

interface ApiResponse<T> {
    success: boolean
    message: string
    data: T
}

interface UserMapAdminItem {
    id: number
    name: string
    description?: string | null
    sourceType: string
    geomType?: string | null
    status: string
    visible: boolean
    featureCount: number
    createdAt: string
}

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8080'

async function apiFetch<T>(url: string, options?: RequestInit): Promise<T> {
    const token = getToken()
    const headers: Record<string, string> = {
        ...(options?.headers as Record<string, string> ?? {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
    }
    if (options?.body) headers['Content-Type'] = 'application/json'
    const res = await fetch(`${API}${url}`, { ...options, headers })
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
        year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
    })
}

function statusBadge(status: string) {
    const map: Record<string, [string, string]> = {
        READY: ['var(--accent-bg)', 'var(--accent)'],
        PROCESSING: ['rgba(245,158,11,0.12)', '#f59e0b'],
        FAILED: ['rgba(239,68,68,0.12)', '#ef4444'],
    }
    const [bg, color] = map[status] ?? ['var(--bg-hover)', 'var(--text-muted)']
    return (
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold" style={{ background: bg, color }}>
            {status}
        </span>
    )
}

export default function AdminMyMapPage() {
    const [items, setItems] = useState<UserMapAdminItem[]>([])
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const load = useCallback(async () => {
        setLoading(true)
        setError(null)
        try {
            const data = await apiFetch<UserMapAdminItem[]>('/api/admin/mymap')
            setItems(data)
        } catch (e) {
            setError(e instanceof Error ? e.message : '목록을 불러오는데 실패했습니다.')
        } finally {
            setLoading(false)
        }
    }, [])

    useEffect(() => { load() }, [load])

    const handleDelete = async (id: number, name: string) => {
        if (!confirm(`"${name}" 나만의지도를 강제 삭제할까요? 소유자 동의 없이 삭제됩니다.`)) return
        await apiFetch(`/api/admin/mymap/${id}`, { method: 'DELETE' })
        setItems(prev => prev.filter(i => i.id !== id))
    }

    return (
        <div className="flex min-h-screen" style={{ background: 'var(--bg-page)' }}>
            <Sidebar />
            <div className="flex-1 flex flex-col min-w-0">
                <Header title="나만의지도 관리" breadcrumb={['관리자', '나만의지도']} />

                <main className="flex-1 p-6 space-y-4">
                    <div className="rounded-xl overflow-hidden" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
                        <div className="px-6 py-3 flex items-center justify-between" style={{ borderBottom: '1px solid var(--border)' }}>
                            <span className="text-sm" style={{ color: 'var(--text-muted)' }}>
                                총 <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>{items.length}</span>개
                            </span>
                            <button onClick={load} className="text-xs px-3 py-1.5 rounded-lg transition-colors" style={{ background: 'var(--bg-hover)', color: 'var(--text-muted)' }}>
                                새로 고침
                            </button>
                        </div>

                        {error && (
                            <div className="mx-6 mt-4 px-4 py-3 rounded-lg text-sm" style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', color: '#ef4444' }}>
                                {error}
                            </div>
                        )}

                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr style={{ background: 'var(--bg-hover)', borderBottom: '1px solid var(--border)' }}>
                                        {['NO.', '이름', '유형', '지오메트리', '피처 수', '상태', '생성일', ''].map(h => (
                                            <th key={h} className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>{h}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {loading ? (
                                        <tr><td colSpan={8} className="text-center py-16">
                                            <div className="flex flex-col items-center gap-2">
                                                <div className="w-6 h-6 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: 'var(--accent)', borderTopColor: 'transparent' }} />
                                                <span className="text-sm" style={{ color: 'var(--text-muted)' }}>불러오는 중...</span>
                                            </div>
                                        </td></tr>
                                    ) : items.length === 0 ? (
                                        <tr><td colSpan={8} className="text-center py-16 text-sm" style={{ color: 'var(--text-faint)' }}>등록된 나만의지도가 없습니다.</td></tr>
                                    ) : (
                                        items.map((item, idx) => (
                                            <tr key={item.id} className="transition-colors hover:bg-[var(--bg-hover)]" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                                                <td className="px-4 py-3 text-xs" style={{ color: 'var(--text-faint)' }}>{idx + 1}</td>
                                                <td className="px-4 py-3 font-medium" style={{ color: 'var(--text-primary)' }}>{item.name}</td>
                                                <td className="px-4 py-3" style={{ color: 'var(--text-secondary)' }}>{item.sourceType}</td>
                                                <td className="px-4 py-3" style={{ color: 'var(--text-secondary)' }}>{item.geomType ?? '-'}</td>
                                                <td className="px-4 py-3" style={{ color: 'var(--text-secondary)' }}>{item.featureCount.toLocaleString()}</td>
                                                <td className="px-4 py-3">{statusBadge(item.status)}</td>
                                                <td className="px-4 py-3 text-xs" style={{ color: 'var(--text-faint)' }}>{formatDateTime(item.createdAt)}</td>
                                                <td className="px-4 py-3">
                                                    <button onClick={() => handleDelete(item.id, item.name)} className="text-xs px-2.5 py-1 rounded-lg" style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444' }}>
                                                        강제 삭제
                                                    </button>
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </main>
            </div>
        </div>
    )
}
