'use client'

import { useEffect, useState } from 'react'
import Sidebar from '@/components/layout/Sidebar'
import Header from '@/components/layout/Header'
import { Plus, Pencil, Trash2, X, ShieldOff, ShieldCheck } from 'lucide-react'
import { getToken } from '@/store/authStore'

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8080'

interface BotRoom {
    id: number
    roomName: string
    status: 'ALLOWED' | 'BLOCKED'
    statusLabel: string
    memo: string | null
    lastSeenAt: string
    createdAt: string
}

async function apiFetch<T>(url: string, options?: RequestInit): Promise<T> {
    const token = getToken()
    const headers: Record<string, string> = {
        ...(options?.headers as Record<string, string> ?? {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
    }
    if (options?.body) headers['Content-Type'] = 'application/json'
    const res = await fetch(`${API}${url}`, { ...options, headers })
    const json = await res.json()
    if (!json.success) throw new Error(json.message)
    return json.data
}

const EMPTY_FORM = { roomName: '', status: 'ALLOWED' as const, memo: '' }
const inputStyle: React.CSSProperties = {
    background: 'var(--bg-page)', border: '1px solid var(--border)',
    color: 'var(--text-primary)', borderRadius: '8px',
}

export default function BotRoomPage() {
    const [rooms, setRooms]       = useState<BotRoom[]>([])
    const [loading, setLoading]   = useState(false)
    const [error, setError]       = useState<string | null>(null)
    const [search, setSearch]     = useState('')
    const [filter, setFilter]     = useState<'ALL' | 'ALLOWED' | 'BLOCKED'>('ALL')

    const [modalType, setModalType] = useState<'create' | 'edit' | 'delete' | null>(null)
    const [selected, setSelected]   = useState<BotRoom | null>(null)
    const [form, setForm]           = useState(EMPTY_FORM)
    const [formError, setFormError] = useState<string | null>(null)
    const [submitting, setSubmitting] = useState(false)

    const load = async () => {
        setLoading(true)
        try { setRooms(await apiFetch<BotRoom[]>('/api/bot/rooms')) }
        catch (e) { setError(e instanceof Error ? e.message : '불러오기 실패') }
        finally { setLoading(false) }
    }

    useEffect(() => { load() }, [])

    const filtered = rooms.filter(r => {
        const matchSearch = r.roomName.includes(search) || (r.memo ?? '').includes(search)
        const matchFilter = filter === 'ALL' || r.status === filter
        return matchSearch && matchFilter
    })

    const openCreate = () => { setForm(EMPTY_FORM); setFormError(null); setModalType('create') }
    const openEdit   = (r: BotRoom) => {
        setSelected(r)
        setForm({ roomName: r.roomName, status: r.status, memo: r.memo ?? '' })
        setFormError(null); setModalType('edit')
    }
    const openDelete = (r: BotRoom) => { setSelected(r); setModalType('delete') }
    const closeModal = () => { setModalType(null); setSelected(null); setFormError(null) }

    const handleSubmit = async () => {
        setSubmitting(true); setFormError(null)
        try {
            if (modalType === 'create') {
                await apiFetch('/api/bot/rooms', { method: 'POST', body: JSON.stringify(form) })
            } else if (selected) {
                await apiFetch(`/api/bot/rooms/${selected.id}`, { method: 'PUT', body: JSON.stringify({ status: form.status, memo: form.memo }) })
            }
            closeModal(); load()
        } catch (e) { setFormError(e instanceof Error ? e.message : '처리 실패') }
        finally { setSubmitting(false) }
    }

    const handleDelete = async () => {
        if (!selected) return
        setSubmitting(true)
        try { await apiFetch(`/api/bot/rooms/${selected.id}`, { method: 'DELETE' }); closeModal(); load() }
        catch (e) { setFormError(e instanceof Error ? e.message : '삭제 실패') }
        finally { setSubmitting(false) }
    }

    const handleToggle = async (r: BotRoom) => {
        try { await apiFetch(`/api/bot/rooms/${r.id}/toggle`, { method: 'PATCH' }); load() }
        catch (e) { setError(e instanceof Error ? e.message : '처리 실패') }
    }

    const stats = { total: rooms.length, allowed: rooms.filter(r => r.status === 'ALLOWED').length, blocked: rooms.filter(r => r.status === 'BLOCKED').length }

    return (
        <div className="flex min-h-screen" style={{ background: 'var(--bg-page)' }}>
            <Sidebar />
            <div className="flex-1 flex flex-col min-w-0">
                <Header title="방 모니터링" breadcrumb={['기빵봇', '방 모니터링']} />
                <main className="flex-1 p-6 space-y-4">
                    {/* 통계 카드 */}
                    <div className="grid grid-cols-3 gap-4">
                        {[
                            { label: '전체', value: stats.total, color: 'var(--text-primary)', bg: 'var(--bg-surface)' },
                            { label: '허용', value: stats.allowed, color: '#10b981', bg: 'rgba(16,185,129,0.08)' },
                            { label: '차단', value: stats.blocked, color: '#ef4444', bg: 'rgba(239,68,68,0.08)' },
                        ].map((s) => (
                            <div key={s.label} className="rounded-xl px-5 py-4"
                                style={{ background: s.bg, border: '1px solid var(--border)' }}>
                                <p className="text-xs mb-1" style={{ color: 'var(--text-muted)' }}>{s.label}</p>
                                <p className="text-2xl font-bold" style={{ color: s.color }}>{s.value}</p>
                            </div>
                        ))}
                    </div>

                    <div className="flex items-center gap-3">
                        <input type="text" placeholder="방 이름 또는 메모 검색..." value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            className="flex-1 px-4 py-2 text-sm focus:outline-none" style={inputStyle} />
                        {(['ALL', 'ALLOWED', 'BLOCKED'] as const).map((f) => (
                            <button key={f} onClick={() => setFilter(f)}
                                className="px-3 py-2 text-xs font-medium rounded-lg transition-colors"
                                style={filter === f
                                    ? { background: 'var(--accent)', color: '#fff' }
                                    : { background: 'var(--bg-surface)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}>
                                {f === 'ALL' ? '전체' : f === 'ALLOWED' ? '허용' : '차단'}
                            </button>
                        ))}
                        <button onClick={openCreate}
                            className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg"
                            style={{ background: 'var(--accent)', color: '#fff' }}>
                            <Plus size={15} /> 방 추가
                        </button>
                    </div>

                    {error && (
                        <div className="px-4 py-3 rounded-lg text-sm flex items-center justify-between"
                            style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', color: '#ef4444' }}>
                            {error} <button onClick={() => setError(null)}><X size={14} /></button>
                        </div>
                    )}

                    <div className="rounded-xl overflow-hidden"
                        style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
                        <div className="px-6 py-3" style={{ borderBottom: '1px solid var(--border)' }}>
                            <span className="text-sm" style={{ color: 'var(--text-muted)' }}>
                                총 <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>{filtered.length}</span>개
                            </span>
                        </div>
                        <table className="w-full text-sm">
                            <thead>
                                <tr style={{ background: 'var(--bg-hover)', borderBottom: '1px solid var(--border)' }}>
                                    {['방 이름', '메모', '마지막 활동', '상태', '관리'].map((h) => (
                                        <th key={h} className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wide"
                                            style={{ color: 'var(--text-muted)' }}>{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {loading ? (
                                    <tr><td colSpan={5} className="text-center py-16">
                                        <div className="w-6 h-6 border-2 border-t-transparent rounded-full animate-spin mx-auto"
                                            style={{ borderColor: 'var(--accent)', borderTopColor: 'transparent' }} />
                                    </td></tr>
                                ) : filtered.length === 0 ? (
                                    <tr><td colSpan={5} className="text-center py-16 text-sm"
                                        style={{ color: 'var(--text-faint)' }}>등록된 방이 없습니다.</td></tr>
                                ) : filtered.map((r) => (
                                    <tr key={r.id} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                                        <td className="px-4 py-3 font-medium" style={{ color: 'var(--text-primary)' }}>{r.roomName}</td>
                                        <td className="px-4 py-3 text-xs" style={{ color: 'var(--text-muted)' }}>{r.memo ?? '-'}</td>
                                        <td className="px-4 py-3 text-xs" style={{ color: 'var(--text-faint)' }}>
                                            {new Date(r.lastSeenAt).toLocaleString('ko-KR', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
                                        </td>
                                        <td className="px-4 py-3">
                                            <button onClick={() => handleToggle(r)}
                                                className="flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded-full"
                                                style={r.status === 'ALLOWED'
                                                    ? { background: 'rgba(16,185,129,0.12)', color: '#10b981' }
                                                    : { background: 'rgba(239,68,68,0.12)', color: '#ef4444' }}>
                                                {r.status === 'ALLOWED' ? <ShieldCheck size={12} /> : <ShieldOff size={12} />}
                                                {r.statusLabel}
                                            </button>
                                        </td>
                                        <td className="px-4 py-3">
                                            <div className="flex items-center gap-1">
                                                <button onClick={() => openEdit(r)} className="p-1.5 rounded-lg" style={{ color: 'var(--text-faint)' }}>
                                                    <Pencil size={14} />
                                                </button>
                                                <button onClick={() => openDelete(r)} className="p-1.5 rounded-lg" style={{ color: 'var(--text-faint)' }}>
                                                    <Trash2 size={14} />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </main>
            </div>

            {(modalType === 'create' || modalType === 'edit') && (
                <div className="fixed inset-0 flex items-center justify-center z-50 p-4" style={{ background: 'rgba(0,0,0,0.5)' }}>
                    <div className="rounded-2xl shadow-2xl w-full max-w-sm"
                        style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
                        <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: '1px solid var(--border)' }}>
                            <h3 className="font-semibold" style={{ color: 'var(--text-primary)' }}>
                                {modalType === 'create' ? '방 추가' : '방 수정'}
                            </h3>
                            <button onClick={closeModal} style={{ color: 'var(--text-faint)' }}><X size={18} /></button>
                        </div>
                        <div className="px-6 py-5 space-y-4">
                            {formError && (
                                <div className="px-4 py-3 rounded-lg text-sm"
                                    style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', color: '#ef4444' }}>
                                    {formError}
                                </div>
                            )}
                            {modalType === 'create' && (
                                <div>
                                    <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                                        방 이름 <span style={{ color: '#ef4444' }}>*</span>
                                    </label>
                                    <input type="text" value={form.roomName} placeholder="카카오톡 방 이름"
                                        onChange={(e) => setForm({ ...form, roomName: e.target.value })}
                                        className="w-full px-3 py-2.5 text-sm focus:outline-none" style={inputStyle} />
                                </div>
                            )}
                            <div>
                                <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>상태</label>
                                <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as 'ALLOWED' | 'BLOCKED' })}
                                    className="w-full px-3 py-2.5 text-sm focus:outline-none" style={inputStyle}>
                                    <option value="ALLOWED">허용</option>
                                    <option value="BLOCKED">차단</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                                    메모 <span style={{ color: 'var(--text-faint)', fontWeight: 400 }}>(선택)</span>
                                </label>
                                <input type="text" value={form.memo} placeholder="차단 사유 등"
                                    onChange={(e) => setForm({ ...form, memo: e.target.value })}
                                    className="w-full px-3 py-2.5 text-sm focus:outline-none" style={inputStyle} />
                            </div>
                        </div>
                        <div className="flex gap-3 px-6 py-4" style={{ borderTop: '1px solid var(--border)' }}>
                            <button onClick={closeModal} className="flex-1 px-4 py-2.5 text-sm font-medium rounded-lg"
                                style={{ background: 'var(--bg-hover)', color: 'var(--text-secondary)' }}>취소</button>
                            <button onClick={handleSubmit} disabled={submitting}
                                className="flex-1 px-4 py-2.5 text-sm font-medium rounded-lg disabled:opacity-50"
                                style={{ background: 'var(--accent)', color: '#fff' }}>
                                {submitting ? '처리 중...' : modalType === 'create' ? '추가' : '저장'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {modalType === 'delete' && selected && (
                <div className="fixed inset-0 flex items-center justify-center z-50 p-4" style={{ background: 'rgba(0,0,0,0.5)' }}>
                    <div className="rounded-2xl shadow-2xl w-full max-w-sm"
                        style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
                        <div className="px-6 pt-6 pb-4 text-center">
                            <div className="w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4"
                                style={{ background: 'rgba(239,68,68,0.12)' }}>
                                <Trash2 size={22} style={{ color: '#ef4444' }} />
                            </div>
                            <h3 className="font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>방 삭제</h3>
                            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                                <span className="font-medium" style={{ color: 'var(--text-primary)' }}>{selected.roomName}</span>을 삭제하시겠습니까?
                            </p>
                            {formError && <p className="mt-3 text-xs" style={{ color: '#ef4444' }}>{formError}</p>}
                        </div>
                        <div className="flex gap-3 px-6 py-4" style={{ borderTop: '1px solid var(--border)' }}>
                            <button onClick={closeModal} className="flex-1 px-4 py-2.5 text-sm font-medium rounded-lg"
                                style={{ background: 'var(--bg-hover)', color: 'var(--text-secondary)' }}>취소</button>
                            <button onClick={handleDelete} disabled={submitting}
                                className="flex-1 px-4 py-2.5 text-sm font-medium rounded-lg disabled:opacity-50"
                                style={{ background: '#ef4444', color: '#fff' }}>
                                {submitting ? '삭제 중...' : '삭제'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
