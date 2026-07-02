'use client'

import { useEffect, useState } from 'react'
import Sidebar from '@/components/layout/Sidebar'
import Header from '@/components/layout/Header'
import { Plus, Pencil, Trash2, X, ToggleLeft, ToggleRight } from 'lucide-react'
import { getToken } from '@/stores/authStore'

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8080'

interface BotCommand {
    id: number
    keyword: string
    description: string | null
    response: string | null
    active: boolean
    createdAt: string
    updatedAt: string
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

const EMPTY_FORM = { keyword: '', description: '', response: '', active: true }
const inputStyle: React.CSSProperties = {
    background: 'var(--bg-page)', border: '1px solid var(--border)',
    color: 'var(--text-primary)', borderRadius: '8px',
}

export default function BotCommandPage() {
    const [commands, setCommands] = useState<BotCommand[]>([])
    const [loading, setLoading]   = useState(false)
    const [error, setError]       = useState<string | null>(null)
    const [search, setSearch]     = useState('')

    const [modalType, setModalType] = useState<'create' | 'edit' | 'delete' | null>(null)
    const [selected, setSelected]   = useState<BotCommand | null>(null)
    const [form, setForm]           = useState(EMPTY_FORM)
    const [formError, setFormError] = useState<string | null>(null)
    const [submitting, setSubmitting] = useState(false)

    const load = async () => {
        setLoading(true)
        try { setCommands(await apiFetch<BotCommand[]>('/api/bot/commands')) }
        catch (e) { setError(e instanceof Error ? e.message : '불러오기 실패') }
        finally { setLoading(false) }
    }

    useEffect(() => { load() }, [])

    const filtered = commands.filter(c =>
        c.keyword.includes(search) || (c.description ?? '').includes(search)
    )

    const openCreate = () => { setForm(EMPTY_FORM); setFormError(null); setModalType('create') }
    const openEdit   = (c: BotCommand) => {
        setSelected(c)
        setForm({ keyword: c.keyword, description: c.description ?? '', response: c.response ?? '', active: c.active })
        setFormError(null); setModalType('edit')
    }
    const openDelete = (c: BotCommand) => { setSelected(c); setModalType('delete') }
    const closeModal = () => { setModalType(null); setSelected(null); setFormError(null) }

    const handleSubmit = async () => {
        setSubmitting(true); setFormError(null)
        try {
            if (modalType === 'create') {
                await apiFetch('/api/bot/commands', { method: 'POST', body: JSON.stringify(form) })
            } else if (selected) {
                await apiFetch(`/api/bot/commands/${selected.id}`, { method: 'PUT', body: JSON.stringify(form) })
            }
            closeModal(); load()
        } catch (e) { setFormError(e instanceof Error ? e.message : '처리 실패') }
        finally { setSubmitting(false) }
    }

    const handleDelete = async () => {
        if (!selected) return
        setSubmitting(true)
        try { await apiFetch(`/api/bot/commands/${selected.id}`, { method: 'DELETE' }); closeModal(); load() }
        catch (e) { setFormError(e instanceof Error ? e.message : '삭제 실패') }
        finally { setSubmitting(false) }
    }

    const handleToggle = async (c: BotCommand) => {
        try { await apiFetch(`/api/bot/commands/${c.id}/toggle`, { method: 'PATCH' }); load() }
        catch (e) { setError(e instanceof Error ? e.message : '처리 실패') }
    }

    return (
        <div className="flex min-h-screen" style={{ background: 'var(--bg-page)' }}>
            <Sidebar />
            <div className="flex-1 flex flex-col min-w-0">
                <Header title="명령어 관리" breadcrumb={['기빵봇', '명령어 관리']} />
                <main className="flex-1 p-6 space-y-4">
                    <div className="flex items-center gap-3">
                        <input type="text" placeholder="명령어 또는 설명 검색..." value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            className="flex-1 px-4 py-2 text-sm focus:outline-none" style={inputStyle} />
                        <button onClick={openCreate}
                            className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg"
                            style={{ background: 'var(--accent)', color: '#fff' }}>
                            <Plus size={15} /> 명령어 추가
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
                                    {['명령어', '설명', '응답 내용', '상태', '수정일', '관리'].map((h) => (
                                        <th key={h} className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wide"
                                            style={{ color: 'var(--text-muted)' }}>{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {loading ? (
                                    <tr><td colSpan={6} className="text-center py-16">
                                        <div className="w-6 h-6 border-2 border-t-transparent rounded-full animate-spin mx-auto"
                                            style={{ borderColor: 'var(--accent)', borderTopColor: 'transparent' }} />
                                    </td></tr>
                                ) : filtered.length === 0 ? (
                                    <tr><td colSpan={6} className="text-center py-16 text-sm"
                                        style={{ color: 'var(--text-faint)' }}>등록된 명령어가 없습니다.</td></tr>
                                ) : filtered.map((c) => (
                                    <tr key={c.id} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                                        <td className="px-4 py-3">
                                            <code className="text-xs font-mono px-2 py-0.5 rounded"
                                                style={{ background: 'var(--accent-bg)', color: 'var(--accent)' }}>
                                                {c.keyword}
                                            </code>
                                        </td>
                                        <td className="px-4 py-3 text-xs max-w-xs truncate"
                                            style={{ color: 'var(--text-muted)' }}>{c.description ?? '-'}</td>
                                        <td className="px-4 py-3 text-xs max-w-xs truncate"
                                            style={{ color: 'var(--text-faint)' }}>{c.response ?? '-'}</td>
                                        <td className="px-4 py-3">
                                            <button onClick={() => handleToggle(c)}
                                                className="flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded-full transition-colors"
                                                style={c.active
                                                    ? { background: 'rgba(16,185,129,0.12)', color: '#10b981' }
                                                    : { background: 'var(--bg-hover)', color: 'var(--text-faint)' }}>
                                                {c.active
                                                    ? <ToggleRight size={13} />
                                                    : <ToggleLeft size={13} />
                                                }
                                                {c.active ? '활성' : '비활성'}
                                            </button>
                                        </td>
                                        <td className="px-4 py-3 text-xs" style={{ color: 'var(--text-faint)' }}>
                                            {new Date(c.updatedAt).toLocaleDateString('ko-KR')}
                                        </td>
                                        <td className="px-4 py-3">
                                            <div className="flex items-center gap-1">
                                                <button onClick={() => openEdit(c)}
                                                    className="p-1.5 rounded-lg transition-colors"
                                                    style={{ color: 'var(--text-faint)' }}>
                                                    <Pencil size={14} />
                                                </button>
                                                <button onClick={() => openDelete(c)}
                                                    className="p-1.5 rounded-lg transition-colors"
                                                    style={{ color: 'var(--text-faint)' }}>
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

            {/* 생성/수정 모달 */}
            {(modalType === 'create' || modalType === 'edit') && (
                <div className="fixed inset-0 flex items-center justify-center z-50 p-4"
                    style={{ background: 'rgba(0,0,0,0.5)' }}>
                    <div className="rounded-2xl shadow-2xl w-full max-w-md"
                        style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
                        <div className="flex items-center justify-between px-6 py-4"
                            style={{ borderBottom: '1px solid var(--border)' }}>
                            <h3 className="font-semibold" style={{ color: 'var(--text-primary)' }}>
                                {modalType === 'create' ? '명령어 추가' : '명령어 수정'}
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
                            <div>
                                <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                                    명령어 키워드 <span style={{ color: '#ef4444' }}>*</span>
                                </label>
                                <input type="text" value={form.keyword} placeholder="예: !도움말"
                                    onChange={(e) => setForm({ ...form, keyword: e.target.value })}
                                    className="w-full px-3 py-2.5 text-sm font-mono focus:outline-none" style={inputStyle} />
                            </div>
                            <div>
                                <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                                    설명 <span style={{ color: 'var(--text-faint)', fontWeight: 400 }}>(선택)</span>
                                </label>
                                <input type="text" value={form.description} placeholder="명령어 설명"
                                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                                    className="w-full px-3 py-2.5 text-sm focus:outline-none" style={inputStyle} />
                            </div>
                            <div>
                                <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                                    응답 내용 <span style={{ color: 'var(--text-faint)', fontWeight: 400 }}>(선택)</span>
                                </label>
                                <textarea value={form.response} placeholder="봇이 응답할 내용 (비어있으면 코드에서 처리)"
                                    onChange={(e) => setForm({ ...form, response: e.target.value })}
                                    rows={3} className="w-full px-3 py-2.5 text-sm focus:outline-none resize-none" style={inputStyle} />
                            </div>
                            <label className="flex items-center gap-2 cursor-pointer">
                                <input type="checkbox" checked={form.active}
                                    onChange={(e) => setForm({ ...form, active: e.target.checked })}
                                    className="w-4 h-4 rounded cursor-pointer" />
                                <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>활성화</span>
                            </label>
                        </div>
                        <div className="flex gap-3 px-6 py-4" style={{ borderTop: '1px solid var(--border)' }}>
                            <button onClick={closeModal}
                                className="flex-1 px-4 py-2.5 text-sm font-medium rounded-lg"
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

            {/* 삭제 모달 */}
            {modalType === 'delete' && selected && (
                <div className="fixed inset-0 flex items-center justify-center z-50 p-4"
                    style={{ background: 'rgba(0,0,0,0.5)' }}>
                    <div className="rounded-2xl shadow-2xl w-full max-w-sm"
                        style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
                        <div className="px-6 pt-6 pb-4 text-center">
                            <div className="w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4"
                                style={{ background: 'rgba(239,68,68,0.12)' }}>
                                <Trash2 size={22} style={{ color: '#ef4444' }} />
                            </div>
                            <h3 className="font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>명령어 삭제</h3>
                            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                                <code className="font-mono" style={{ color: 'var(--accent)' }}>{selected.keyword}</code> 명령어를
                                <br />정말 삭제하시겠습니까?
                            </p>
                            {formError && <p className="mt-3 text-xs" style={{ color: '#ef4444' }}>{formError}</p>}
                        </div>
                        <div className="flex gap-3 px-6 py-4" style={{ borderTop: '1px solid var(--border)' }}>
                            <button onClick={closeModal}
                                className="flex-1 px-4 py-2.5 text-sm font-medium rounded-lg"
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
