'use client'

import { useCallback, useEffect, useState } from 'react'
import Sidebar from '@/components/layout/Sidebar'
import Header from '@/components/layout/Header'
import { Pencil, Trash2, X, Plus, GripVertical } from 'lucide-react'
import type { Category } from '@/types/post'
import { getToken } from '@/stores/authStore'

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
    if (res.status === 401) { window.location.href = '/login'; throw new Error('Unauthorized') }
    const json = await res.json()
    if (!json.success) throw new Error(json.message)
    return json.data
}

interface CategoryForm {
    code: string
    label: string
    sortOrder: number
}

const EMPTY_FORM: CategoryForm = { code: '', label: '', sortOrder: 0 }

const inputStyle: React.CSSProperties = {
    background: 'var(--bg-page)',
    border: '1px solid var(--border)',
    color: 'var(--text-primary)',
    borderRadius: '8px',
}

const BADGE_COLORS = [
    { bg: 'rgba(59,130,246,0.12)',  color: '#3b82f6' },
    { bg: 'rgba(236,72,153,0.12)',  color: '#ec4899' },
    { bg: 'rgba(245,158,11,0.12)',  color: '#f59e0b' },
    { bg: 'rgba(16,185,129,0.12)',  color: '#10b981' },
    { bg: 'rgba(168,85,247,0.12)',  color: '#a855f7' },
]

export default function CategoryPage() {
    const [categories, setCategories] = useState<Category[]>([])
    const [loading, setLoading]       = useState(false)
    const [error, setError]           = useState<string | null>(null)

    const [modalType, setModalType]   = useState<'create' | 'edit' | 'delete' | null>(null)
    const [selected, setSelected]     = useState<Category | null>(null)
    const [form, setForm]             = useState<CategoryForm>(EMPTY_FORM)
    const [formError, setFormError]   = useState<string | null>(null)
    const [submitting, setSubmitting] = useState(false)

    const load = useCallback(async () => {
        setLoading(true); setError(null)
        try {
            setCategories(await apiFetch<Category[]>('/api/categories'))
        } catch {
            setError('카테고리 목록을 불러오지 못했습니다.')
        } finally { setLoading(false) }
    }, [])

    useEffect(() => { load() }, [load])

    const openCreate = () => { setForm(EMPTY_FORM); setFormError(null); setModalType('create') }
    const openEdit   = (c: Category) => {
        setSelected(c)
        setForm({ code: c.code, label: c.label, sortOrder: c.sortOrder })
        setFormError(null)
        setModalType('edit')
    }
    const openDelete = (c: Category) => { setSelected(c); setModalType('delete') }
    const closeModal = () => { setModalType(null); setSelected(null); setFormError(null) }

    const handleCreate = async () => {
        setSubmitting(true); setFormError(null)
        try {
            await apiFetch('/api/categories', { method: 'POST', body: JSON.stringify(form) })
            closeModal(); load()
        } catch (e) { setFormError(e instanceof Error ? e.message : '생성에 실패했습니다.') }
        finally { setSubmitting(false) }
    }

    const handleUpdate = async () => {
        if (!selected) return
        setSubmitting(true); setFormError(null)
        try {
            await apiFetch(`/api/categories/${selected.code}`, { method: 'PUT', body: JSON.stringify(form) })
            closeModal(); load()
        } catch (e) { setFormError(e instanceof Error ? e.message : '수정에 실패했습니다.') }
        finally { setSubmitting(false) }
    }

    const handleDelete = async () => {
        if (!selected) return
        setSubmitting(true)
        try {
            await apiFetch(`/api/categories/${selected.code}`, { method: 'DELETE' })
            closeModal(); load()
        } catch (e) { setFormError(e instanceof Error ? e.message : '삭제에 실패했습니다.') }
        finally { setSubmitting(false) }
    }

    return (
        <div className="flex min-h-screen" style={{ background: 'var(--bg-page)' }}>
            <Sidebar />
            <div className="flex-1 flex flex-col min-w-0">
                <Header title="카테고리 관리" breadcrumb={['관리자', '블로그', '카테고리 관리']} />

                <main className="flex-1 p-6 space-y-4">
                    <div className="flex items-center justify-between">
                        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                            포스트에 사용되는 카테고리를 관리합니다.
                        </p>
                        <button onClick={openCreate}
                            className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg cursor-pointer"
                            style={{ background: 'var(--accent)', color: '#fff' }}>
                            <Plus size={15} /> 카테고리 추가
                        </button>
                    </div>

                    {error && (
                        <div className="px-4 py-3 rounded-lg text-sm flex items-center justify-between"
                            style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', color: '#ef4444' }}>
                            {error} <button onClick={() => setError(null)} className="cursor-pointer"><X size={14} /></button>
                        </div>
                    )}

                    <div className="rounded-xl overflow-hidden"
                        style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
                        {loading ? (
                            <div className="flex items-center justify-center py-16">
                                <div className="w-6 h-6 border-2 border-t-transparent rounded-full animate-spin"
                                    style={{ borderColor: 'var(--accent)', borderTopColor: 'transparent' }} />
                            </div>
                        ) : categories.length === 0 ? (
                            <p className="text-center py-16 text-sm" style={{ color: 'var(--text-faint)' }}>
                                카테고리가 없습니다.
                            </p>
                        ) : (
                            <ul>
                                {categories.map((c, idx) => (
                                    <li key={c.code}
                                        className="flex items-center gap-4 px-5 py-4"
                                        style={{ borderBottom: idx < categories.length - 1 ? '1px solid var(--border-subtle)' : 'none' }}>
                                        <GripVertical size={16} style={{ color: 'var(--text-faint)', flexShrink: 0 }} />
                                        <span className="text-xs font-semibold px-2.5 py-1 rounded-full"
                                            style={BADGE_COLORS[idx % BADGE_COLORS.length]}>
                                            {c.label}
                                        </span>
                                        <span className="font-mono text-xs flex-1" style={{ color: 'var(--text-faint)' }}>
                                            {c.code}
                                        </span>
                                        <span className="text-xs" style={{ color: 'var(--text-faint)' }}>
                                            순서 {c.sortOrder}
                                        </span>
                                        <div className="flex items-center gap-1">
                                            <button onClick={() => openEdit(c)}
                                                className="p-1.5 rounded-lg transition-colors cursor-pointer"
                                                style={{ color: 'var(--text-faint)' }}>
                                                <Pencil size={14} />
                                            </button>
                                            <button onClick={() => openDelete(c)}
                                                className="p-1.5 rounded-lg transition-colors cursor-pointer"
                                                style={{ color: 'var(--text-faint)' }}>
                                                <Trash2 size={14} />
                                            </button>
                                        </div>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
                </main>
            </div>

            {/* 추가/수정 모달 */}
            {(modalType === 'create' || modalType === 'edit') && (
                <div className="fixed inset-0 flex items-center justify-center z-50 p-4"
                    style={{ background: 'rgba(0,0,0,0.5)' }}>
                    <div className="rounded-2xl shadow-2xl w-full max-w-sm"
                        style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
                        <div className="flex items-center justify-between px-6 py-4"
                            style={{ borderBottom: '1px solid var(--border)' }}>
                            <h3 className="font-semibold" style={{ color: 'var(--text-primary)' }}>
                                {modalType === 'edit' ? '카테고리 수정' : '카테고리 추가'}
                            </h3>
                            <button onClick={closeModal} className="cursor-pointer" style={{ color: 'var(--text-faint)' }}>
                                <X size={18} />
                            </button>
                        </div>

                        <div className="px-6 py-5 space-y-4">
                            {modalType === 'create' && (
                                <div>
                                    <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                                        코드 <span style={{ color: '#ef4444' }}>*</span>
                                        <span className="ml-1 font-normal" style={{ color: 'var(--text-faint)' }}>(영문 대문자, 숫자, 언더스코어)</span>
                                    </label>
                                    <input type="text" value={form.code}
                                        onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, '') })}
                                        placeholder="예: MY_CATEGORY"
                                        className="w-full px-3 py-2.5 text-sm font-mono focus:outline-none" style={inputStyle} />
                                </div>
                            )}
                            {modalType === 'edit' && (
                                <div>
                                    <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>코드</label>
                                    <input type="text" value={form.code} disabled
                                        className="w-full px-3 py-2.5 text-sm font-mono focus:outline-none opacity-50 cursor-not-allowed" style={inputStyle} />
                                </div>
                            )}
                            <div>
                                <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                                    표시명 <span style={{ color: '#ef4444' }}>*</span>
                                </label>
                                <input type="text" value={form.label}
                                    onChange={(e) => setForm({ ...form, label: e.target.value })}
                                    placeholder="예: 개발"
                                    className="w-full px-3 py-2.5 text-sm focus:outline-none" style={inputStyle} />
                            </div>
                            <div>
                                <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>정렬 순서</label>
                                <input type="number" value={form.sortOrder}
                                    onChange={(e) => setForm({ ...form, sortOrder: Number(e.target.value) })}
                                    className="w-full px-3 py-2.5 text-sm focus:outline-none" style={inputStyle} />
                            </div>

                            {formError && (
                                <p className="text-xs px-3 py-2 rounded-lg"
                                    style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444' }}>
                                    {formError}
                                </p>
                            )}
                        </div>

                        <div className="flex gap-3 px-6 py-4" style={{ borderTop: '1px solid var(--border)' }}>
                            <button onClick={closeModal}
                                className="flex-1 px-4 py-2.5 text-sm font-medium rounded-lg cursor-pointer"
                                style={{ background: 'var(--bg-hover)', color: 'var(--text-secondary)' }}>
                                취소
                            </button>
                            <button onClick={modalType === 'edit' ? handleUpdate : handleCreate} disabled={submitting}
                                className="flex-1 px-4 py-2.5 text-sm font-medium rounded-lg cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
                                style={{ background: 'var(--accent)', color: '#fff' }}>
                                {submitting ? '처리 중...' : modalType === 'edit' ? '저장' : '추가'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* 삭제 확인 모달 */}
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
                            <h3 className="font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>카테고리 삭제</h3>
                            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                                <span className="font-medium" style={{ color: 'var(--text-primary)' }}>
                                    {selected.label} ({selected.code})
                                </span> 카테고리를<br />
                                정말 삭제하시겠습니까?
                            </p>
                            <p className="text-xs mt-2" style={{ color: 'var(--text-faint)' }}>
                                해당 카테고리가 사용된 포스트는 코드만 유지됩니다.
                            </p>
                            {formError && <p className="mt-3 text-xs" style={{ color: '#ef4444' }}>{formError}</p>}
                        </div>
                        <div className="flex gap-3 px-6 py-4" style={{ borderTop: '1px solid var(--border)' }}>
                            <button onClick={closeModal}
                                className="flex-1 px-4 py-2.5 text-sm font-medium rounded-lg cursor-pointer"
                                style={{ background: 'var(--bg-hover)', color: 'var(--text-secondary)' }}>
                                취소
                            </button>
                            <button onClick={handleDelete} disabled={submitting}
                                className="flex-1 px-4 py-2.5 text-sm font-medium rounded-lg cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
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
