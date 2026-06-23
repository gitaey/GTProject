'use client'

import { useEffect, useState } from 'react'
import Sidebar from '@/components/layout/Sidebar'
import Header from '@/components/layout/Header'
import { Plus, Pencil, Trash2, X } from 'lucide-react'
import { getToken } from '@/store/authStore'

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8080'

type SenderRole = 'NORMAL' | 'BLOCKED' | 'ADMIN'

interface BotSender {
    id: number
    senderName: string
    senderRole: SenderRole
    senderRoleLabel: string
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

const EMPTY_FORM = { senderName: '', senderRole: 'NORMAL' as SenderRole, memo: '' }
const inputStyle: React.CSSProperties = {
    background: 'var(--bg-page)', border: '1px solid var(--border)',
    color: 'var(--text-primary)', borderRadius: '8px',
}

const ROLE_STYLE: Record<SenderRole, { bg: string; color: string }> = {
    ADMIN:   { bg: 'rgba(249,115,22,0.12)',  color: '#f97316' },
    BLOCKED: { bg: 'rgba(239,68,68,0.12)',   color: '#ef4444' },
    NORMAL:  { bg: 'var(--bg-hover)',        color: 'var(--text-muted)' },
}

export default function BotSenderPage() {
    const [senders, setSenders]   = useState<BotSender[]>([])
    const [loading, setLoading]   = useState(false)
    const [error, setError]       = useState<string | null>(null)
    const [search, setSearch]     = useState('')
    const [filter, setFilter]     = useState<'ALL' | SenderRole>('ALL')

    const [modalType, setModalType] = useState<'create' | 'edit' | 'delete' | null>(null)
    const [selected, setSelected]   = useState<BotSender | null>(null)
    const [form, setForm]           = useState(EMPTY_FORM)
    const [formError, setFormError] = useState<string | null>(null)
    const [submitting, setSubmitting] = useState(false)

    const load = async () => {
        setLoading(true)
        try { setSenders(await apiFetch<BotSender[]>('/api/bot/senders')) }
        catch (e) { setError(e instanceof Error ? e.message : '불러오기 실패') }
        finally { setLoading(false) }
    }

    useEffect(() => { load() }, [])

    const filtered = senders.filter(s => {
        const matchSearch = s.senderName.includes(search) || (s.memo ?? '').includes(search)
        const matchFilter = filter === 'ALL' || s.senderRole === filter
        return matchSearch && matchFilter
    })

    const stats = {
        total:   senders.length,
        admin:   senders.filter(s => s.senderRole === 'ADMIN').length,
        blocked: senders.filter(s => s.senderRole === 'BLOCKED').length,
        normal:  senders.filter(s => s.senderRole === 'NORMAL').length,
    }

    const openCreate = () => { setForm(EMPTY_FORM); setFormError(null); setModalType('create') }
    const openEdit   = (s: BotSender) => {
        setSelected(s)
        setForm({ senderName: s.senderName, senderRole: s.senderRole, memo: s.memo ?? '' })
        setFormError(null); setModalType('edit')
    }
    const openDelete = (s: BotSender) => { setSelected(s); setModalType('delete') }
    const closeModal = () => { setModalType(null); setSelected(null); setFormError(null) }

    const handleSubmit = async () => {
        setSubmitting(true); setFormError(null)
        try {
            if (modalType === 'create') {
                await apiFetch('/api/bot/senders', { method: 'POST', body: JSON.stringify(form) })
            } else if (selected) {
                await apiFetch(`/api/bot/senders/${selected.id}`, { method: 'PUT', body: JSON.stringify({ senderRole: form.senderRole, memo: form.memo }) })
            }
            closeModal(); load()
        } catch (e) { setFormError(e instanceof Error ? e.message : '처리 실패') }
        finally { setSubmitting(false) }
    }

    const handleDelete = async () => {
        if (!selected) return
        setSubmitting(true)
        try { await apiFetch(`/api/bot/senders/${selected.id}`, { method: 'DELETE' }); closeModal(); load() }
        catch (e) { setFormError(e instanceof Error ? e.message : '삭제 실패') }
        finally { setSubmitting(false) }
    }

    return (
        <div className="flex min-h-screen" style={{ background: 'var(--bg-page)' }}>
            <Sidebar />
            <div className="flex-1 flex flex-col min-w-0">
                <Header title="사용자 관리" breadcrumb={['기빵봇', '사용자 관리']} />
                <main className="flex-1 p-6 space-y-4">
                    {/* 통계 카드 */}
                    <div className="grid grid-cols-4 gap-4">
                        {[
                            { label: '전체', value: stats.total, color: 'var(--text-primary)', bg: 'var(--bg-surface)' },
                            { label: '관리자', value: stats.admin, color: '#f97316', bg: 'rgba(249,115,22,0.08)' },
                            { label: '일반', value: stats.normal, color: 'var(--text-muted)', bg: 'var(--bg-surface)' },
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
                        <input type="text" placeholder="사용자 이름 또는 메모 검색..." value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            className="flex-1 px-4 py-2 text-sm focus:outline-none" style={inputStyle} />
                        {(['ALL', 'ADMIN', 'NORMAL', 'BLOCKED'] as const).map((f) => (
                            <button key={f} onClick={() => setFilter(f)}
                                className="px-3 py-2 text-xs font-medium rounded-lg transition-colors"
                                style={filter === f
                                    ? { background: 'var(--accent)', color: '#fff' }
                                    : { background: 'var(--bg-surface)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}>
                                {f === 'ALL' ? '전체' : f === 'ADMIN' ? '관리자' : f === 'NORMAL' ? '일반' : '차단'}
                            </button>
                        ))}
                        <button onClick={openCreate}
                            className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg"
                            style={{ background: 'var(--accent)', color: '#fff' }}>
                            <Plus size={15} /> 사용자 추가
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
                                총 <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>{filtered.length}</span>명
                            </span>
                        </div>
                        <table className="w-full text-sm">
                            <thead>
                                <tr style={{ background: 'var(--bg-hover)', borderBottom: '1px solid var(--border)' }}>
                                    {['사용자 이름', '역할', '메모', '마지막 활동', '관리'].map((h) => (
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
                                        style={{ color: 'var(--text-faint)' }}>등록된 사용자가 없습니다.</td></tr>
                                ) : filtered.map((s) => (
                                    <tr key={s.id} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                                        <td className="px-4 py-3 font-medium" style={{ color: 'var(--text-primary)' }}>{s.senderName}</td>
                                        <td className="px-4 py-3">
                                            <span className="text-xs font-medium px-2 py-0.5 rounded-full"
                                                style={ROLE_STYLE[s.senderRole]}>
                                                {s.senderRoleLabel}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 text-xs" style={{ color: 'var(--text-muted)' }}>{s.memo ?? '-'}</td>
                                        <td className="px-4 py-3 text-xs" style={{ color: 'var(--text-faint)' }}>
                                            {new Date(s.lastSeenAt).toLocaleString('ko-KR', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
                                        </td>
                                        <td className="px-4 py-3">
                                            <div className="flex items-center gap-1">
                                                <button onClick={() => openEdit(s)} className="p-1.5 rounded-lg" style={{ color: 'var(--text-faint)' }}>
                                                    <Pencil size={14} />
                                                </button>
                                                <button onClick={() => openDelete(s)} className="p-1.5 rounded-lg" style={{ color: 'var(--text-faint)' }}>
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
                                {modalType === 'create' ? '사용자 추가' : '사용자 수정'}
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
                                        사용자 이름 <span style={{ color: '#ef4444' }}>*</span>
                                    </label>
                                    <input type="text" value={form.senderName} placeholder="카카오톡 닉네임"
                                        onChange={(e) => setForm({ ...form, senderName: e.target.value })}
                                        className="w-full px-3 py-2.5 text-sm focus:outline-none" style={inputStyle} />
                                </div>
                            )}
                            <div>
                                <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>역할</label>
                                <select value={form.senderRole} onChange={(e) => setForm({ ...form, senderRole: e.target.value as SenderRole })}
                                    className="w-full px-3 py-2.5 text-sm focus:outline-none" style={inputStyle}>
                                    <option value="NORMAL">일반</option>
                                    <option value="ADMIN">관리자</option>
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
                            <h3 className="font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>사용자 삭제</h3>
                            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                                <span className="font-medium" style={{ color: 'var(--text-primary)' }}>{selected.senderName}</span>을 삭제하시겠습니까?
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
