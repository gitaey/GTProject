'use client'

import { useEffect, useState } from 'react'
import Sidebar from '@/components/layout/Sidebar'
import Header from '@/components/layout/Header'
import { Plus, Pencil, Trash2, X, ToggleLeft, ToggleRight } from 'lucide-react'
import { getToken } from '@/store/authStore'

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8080'

interface BotSchedule {
    id: number
    title: string
    message: string
    targetRoom: string
    dayOfWeek: number | null
    dayOfWeekLabel: string
    sendTime: string
    active: boolean
    lastSentAt: string | null
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

const EMPTY_FORM = { title: '', message: '', targetRoom: '', dayOfWeek: '' as string, sendTime: '09:00', active: true }
const inputStyle: React.CSSProperties = {
    background: 'var(--bg-page)', border: '1px solid var(--border)',
    color: 'var(--text-primary)', borderRadius: '8px',
}
const DAY_OPTIONS = [
    { value: '', label: '매일' },
    { value: '1', label: '월요일' }, { value: '2', label: '화요일' },
    { value: '3', label: '수요일' }, { value: '4', label: '목요일' },
    { value: '5', label: '금요일' }, { value: '6', label: '토요일' },
    { value: '7', label: '일요일' },
]

export default function BotSchedulePage() {
    const [schedules, setSchedules] = useState<BotSchedule[]>([])
    const [loading, setLoading]     = useState(false)
    const [error, setError]         = useState<string | null>(null)

    const [modalType, setModalType] = useState<'create' | 'edit' | 'delete' | null>(null)
    const [selected, setSelected]   = useState<BotSchedule | null>(null)
    const [form, setForm]           = useState(EMPTY_FORM)
    const [formError, setFormError] = useState<string | null>(null)
    const [submitting, setSubmitting] = useState(false)

    const load = async () => {
        setLoading(true)
        try { setSchedules(await apiFetch<BotSchedule[]>('/api/bot/schedules')) }
        catch (e) { setError(e instanceof Error ? e.message : '불러오기 실패') }
        finally { setLoading(false) }
    }

    useEffect(() => { load() }, [])

    const openCreate = () => { setForm(EMPTY_FORM); setFormError(null); setModalType('create') }
    const openEdit   = (s: BotSchedule) => {
        setSelected(s)
        setForm({ title: s.title, message: s.message, targetRoom: s.targetRoom,
            dayOfWeek: s.dayOfWeek == null ? '' : String(s.dayOfWeek), sendTime: s.sendTime, active: s.active })
        setFormError(null); setModalType('edit')
    }
    const openDelete = (s: BotSchedule) => { setSelected(s); setModalType('delete') }
    const closeModal = () => { setModalType(null); setSelected(null); setFormError(null) }

    const toBody = () => ({
        ...form,
        dayOfWeek: form.dayOfWeek === '' ? null : Number(form.dayOfWeek),
    })

    const handleSubmit = async () => {
        setSubmitting(true); setFormError(null)
        try {
            if (modalType === 'create') {
                await apiFetch('/api/bot/schedules', { method: 'POST', body: JSON.stringify(toBody()) })
            } else if (selected) {
                await apiFetch(`/api/bot/schedules/${selected.id}`, { method: 'PUT', body: JSON.stringify(toBody()) })
            }
            closeModal(); load()
        } catch (e) { setFormError(e instanceof Error ? e.message : '처리 실패') }
        finally { setSubmitting(false) }
    }

    const handleDelete = async () => {
        if (!selected) return
        setSubmitting(true)
        try { await apiFetch(`/api/bot/schedules/${selected.id}`, { method: 'DELETE' }); closeModal(); load() }
        catch (e) { setFormError(e instanceof Error ? e.message : '삭제 실패') }
        finally { setSubmitting(false) }
    }

    const handleToggle = async (s: BotSchedule) => {
        try { await apiFetch(`/api/bot/schedules/${s.id}/toggle`, { method: 'PATCH' }); load() }
        catch (e) { setError(e instanceof Error ? e.message : '처리 실패') }
    }

    return (
        <div className="flex min-h-screen" style={{ background: 'var(--bg-page)' }}>
            <Sidebar />
            <div className="flex-1 flex flex-col min-w-0">
                <Header title="자동 전송 관리" breadcrumb={['기빵봇', '자동 전송 관리']} />
                <main className="flex-1 p-6 space-y-4">
                    <div className="flex justify-end">
                        <button onClick={openCreate}
                            className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg"
                            style={{ background: 'var(--accent)', color: '#fff' }}>
                            <Plus size={15} /> 일정 추가
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
                                총 <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>{schedules.length}</span>개
                            </span>
                        </div>
                        <table className="w-full text-sm">
                            <thead>
                                <tr style={{ background: 'var(--bg-hover)', borderBottom: '1px solid var(--border)' }}>
                                    {['제목', '대상 방', '주기', '전송 시각', '마지막 전송', '상태', '관리'].map((h) => (
                                        <th key={h} className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wide"
                                            style={{ color: 'var(--text-muted)' }}>{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {loading ? (
                                    <tr><td colSpan={7} className="text-center py-16">
                                        <div className="w-6 h-6 border-2 border-t-transparent rounded-full animate-spin mx-auto"
                                            style={{ borderColor: 'var(--accent)', borderTopColor: 'transparent' }} />
                                    </td></tr>
                                ) : schedules.length === 0 ? (
                                    <tr><td colSpan={7} className="text-center py-16 text-sm"
                                        style={{ color: 'var(--text-faint)' }}>등록된 일정이 없습니다.</td></tr>
                                ) : schedules.map((s) => (
                                    <tr key={s.id} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                                        <td className="px-4 py-3 font-medium" style={{ color: 'var(--text-primary)' }}>{s.title}</td>
                                        <td className="px-4 py-3 text-xs" style={{ color: 'var(--text-muted)' }}>{s.targetRoom}</td>
                                        <td className="px-4 py-3">
                                            <span className="text-xs px-2 py-0.5 rounded-full"
                                                style={{ background: 'var(--accent-bg)', color: 'var(--accent)' }}>
                                                {s.dayOfWeekLabel}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 text-xs font-mono" style={{ color: 'var(--text-secondary)' }}>{s.sendTime}</td>
                                        <td className="px-4 py-3 text-xs" style={{ color: 'var(--text-faint)' }}>
                                            {s.lastSentAt ? new Date(s.lastSentAt).toLocaleString('ko-KR', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '-'}
                                        </td>
                                        <td className="px-4 py-3">
                                            <button onClick={() => handleToggle(s)}
                                                className="flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded-full"
                                                style={s.active
                                                    ? { background: 'rgba(16,185,129,0.12)', color: '#10b981' }
                                                    : { background: 'var(--bg-hover)', color: 'var(--text-faint)' }}>
                                                {s.active ? <ToggleRight size={13} /> : <ToggleLeft size={13} />}
                                                {s.active ? '활성' : '비활성'}
                                            </button>
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
                    <div className="rounded-2xl shadow-2xl w-full max-w-md"
                        style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
                        <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: '1px solid var(--border)' }}>
                            <h3 className="font-semibold" style={{ color: 'var(--text-primary)' }}>
                                {modalType === 'create' ? '일정 추가' : '일정 수정'}
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
                            {[
                                { label: '제목', key: 'title', placeholder: '일정 이름', required: true },
                                { label: '대상 방', key: 'targetRoom', placeholder: '전송할 카카오톡 방 이름', required: true },
                            ].map(({ label, key, placeholder, required }) => (
                                <div key={key}>
                                    <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                                        {label} {required && <span style={{ color: '#ef4444' }}>*</span>}
                                    </label>
                                    <input type="text" value={form[key as keyof typeof form] as string}
                                        onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                                        placeholder={placeholder}
                                        className="w-full px-3 py-2.5 text-sm focus:outline-none" style={inputStyle} />
                                </div>
                            ))}
                            <div>
                                <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                                    메시지 내용 <span style={{ color: '#ef4444' }}>*</span>
                                </label>
                                <textarea value={form.message} placeholder="전송할 메시지 내용"
                                    onChange={(e) => setForm({ ...form, message: e.target.value })}
                                    rows={4} className="w-full px-3 py-2.5 text-sm focus:outline-none resize-none" style={inputStyle} />
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>요일</label>
                                    <select value={form.dayOfWeek} onChange={(e) => setForm({ ...form, dayOfWeek: e.target.value })}
                                        className="w-full px-3 py-2.5 text-sm focus:outline-none" style={inputStyle}>
                                        {DAY_OPTIONS.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                                        전송 시각 <span style={{ color: '#ef4444' }}>*</span>
                                    </label>
                                    <input type="time" value={form.sendTime}
                                        onChange={(e) => setForm({ ...form, sendTime: e.target.value })}
                                        className="w-full px-3 py-2.5 text-sm focus:outline-none" style={inputStyle} />
                                </div>
                            </div>
                            <label className="flex items-center gap-2 cursor-pointer">
                                <input type="checkbox" checked={form.active}
                                    onChange={(e) => setForm({ ...form, active: e.target.checked })}
                                    className="w-4 h-4 rounded cursor-pointer" />
                                <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>활성화</span>
                            </label>
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
                            <h3 className="font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>일정 삭제</h3>
                            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                                <span className="font-medium" style={{ color: 'var(--text-primary)' }}>{selected.title}</span> 일정을 삭제하시겠습니까?
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
