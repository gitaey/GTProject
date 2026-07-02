'use client'

import { Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Sidebar from '@/components/layout/Sidebar'
import Header from '@/components/layout/Header'
import {
    PenLine, Trash2, X, ChevronLeft, ChevronRight,
    Star, StarOff, Eye, Search, Plus,
} from 'lucide-react'
import type { Post, PostCategoryCode, PostFormState, PostPage, PostRequest, PostStatusCode } from '@/types/post'
import { CATEGORY_OPTIONS, GRADIENT_PRESETS } from '@/types/post'
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

const fetchPosts    = (params: Record<string, string>) => apiFetch<PostPage>(`/api/posts/admin/list?${new URLSearchParams(params)}`)
const createPost    = (data: PostRequest) => apiFetch<Post>('/api/posts', { method: 'POST', body: JSON.stringify(data) })
const updatePost    = (id: number, data: PostRequest) => apiFetch<Post>(`/api/posts/${id}`, { method: 'PUT', body: JSON.stringify(data) })
const deletePost    = (id: number) => apiFetch<void>(`/api/posts/${id}`, { method: 'DELETE' })
const deletePosts   = (ids: number[]) => apiFetch<void>('/api/posts/batch', { method: 'DELETE', body: JSON.stringify(ids) })
const toggleFeatured  = (id: number) => apiFetch<Post>(`/api/posts/${id}/featured`, { method: 'PATCH' })
const toggleStatus    = (id: number) => apiFetch<Post>(`/api/posts/${id}/status`, { method: 'PATCH' })
const fetchPostBySlug = (slug: string) => apiFetch<Post>(`/api/posts/${slug}`)

function toSlug(title: string): string {
    const base = title.toLowerCase().replace(/[^\w\s-]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '')
    return base ? `${base}-${Date.now().toString(36)}` : `post-${Date.now().toString(36)}`
}

const EMPTY_FORM: PostFormState = {
    slug: '', title: '', excerpt: '', content: '',
    category: 'DEV', tags: '', gradient: GRADIENT_PRESETS[0].value,
    featured: false, status: 'PUBLISHED',
}

const CATEGORY_STYLE: Record<PostCategoryCode, { bg: string; color: string }> = {
    DEV:       { bg: 'rgba(59,130,246,0.12)',  color: '#3b82f6' },
    PARENTING: { bg: 'rgba(236,72,153,0.12)',  color: '#ec4899' },
    DAILY:     { bg: 'rgba(245,158,11,0.12)',  color: '#f59e0b' },
}

function formatDate(iso: string) {
    return new Date(iso).toLocaleDateString('ko-KR', { month: '2-digit', day: '2-digit', year: 'numeric' })
}

const inputStyle: React.CSSProperties = {
    background: 'var(--bg-page)',
    border: '1px solid var(--border)',
    color: 'var(--text-primary)',
    borderRadius: '8px',
}

function AdminBlogContent() {
    const searchParams = useSearchParams()
    const router = useRouter()

    const [page, setPage]               = useState<PostPage | null>(null)
    const [loading, setLoading]         = useState(false)
    const [error, setError]             = useState<string | null>(null)
    const [keyword, setKeyword]         = useState('')
    const [catFilter, setCatFilter]     = useState('')
    const [statFilter, setStatFilter]   = useState('')
    const [currentPage, setCurrentPage] = useState(0)

    const [modalType, setModalType]     = useState<'create' | 'edit' | 'delete' | 'batchDelete' | null>(null)
    const [selected, setSelected]       = useState<Post | null>(null)
    const [form, setForm]               = useState<PostFormState>(EMPTY_FORM)
    const [formError, setFormError]     = useState<string | null>(null)
    const [submitting, setSubmitting]   = useState(false)
    const abortRef        = useRef<AbortController | null>(null)
    const dismissedEditId = useRef<string | null>(null)
    const slugAutoRef     = useRef(true)

    const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())

    const posts      = page?.content ?? []
    const totalPages = page?.totalPages ?? 0

    const load = useCallback(async () => {
        abortRef.current?.abort()
        abortRef.current = new AbortController()
        setLoading(true); setError(null)
        try {
            const params: Record<string, string> = { page: String(currentPage), size: '15' }
            if (keyword)    params.keyword  = keyword
            if (catFilter)  params.category = catFilter
            if (statFilter) params.status   = statFilter
            setPage(await fetchPosts(params))
            setSelectedIds(new Set())
        } catch (e) {
            if (e instanceof Error && e.name !== 'AbortError') setError('목록을 불러오지 못했습니다.')
        } finally { setLoading(false) }
    }, [keyword, catFilter, statFilter, currentPage])

    useEffect(() => { load() }, [load])

    useEffect(() => {
        const editId = searchParams.get('edit')
        if (!editId || !page) return
        if (dismissedEditId.current === editId) return
        const target = page.content.find((p) => p.id === Number(editId))
        if (target) openEdit(target)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [searchParams, page])

    const toggleAll = () => {
        setSelectedIds(selectedIds.size === posts.length ? new Set() : new Set(posts.map((p) => p.id)))
    }
    const toggleOne = (id: number) => {
        const next = new Set(selectedIds)
        next.has(id) ? next.delete(id) : next.add(id)
        setSelectedIds(next)
    }

    const openCreate = () => { slugAutoRef.current = true; setForm(EMPTY_FORM); setFormError(null); setModalType('create') }
    const openEdit   = async (p: Post) => {
        setSelected(p); setFormError(null); setModalType('edit')
        try {
            const full = await fetchPostBySlug(p.slug)
            setForm({ slug: full.slug, title: full.title, excerpt: full.excerpt ?? '', content: full.content ?? '',
                category: full.category, tags: full.tags.join(', '), gradient: full.gradient ?? GRADIENT_PRESETS[0].value,
                featured: full.featured, status: full.status })
        } catch {
            setForm({ slug: p.slug, title: p.title, excerpt: p.excerpt ?? '', content: p.content ?? '',
                category: p.category, tags: p.tags.join(', '), gradient: p.gradient ?? GRADIENT_PRESETS[0].value,
                featured: p.featured, status: p.status })
        }
    }
    const openDelete = (p: Post) => { setSelected(p); setModalType('delete') }
    const closeModal = () => {
        setModalType(null); setSelected(null); setFormError(null)
        const editId = searchParams.get('edit')
        if (editId) { dismissedEditId.current = editId; router.replace('/admin/blog') }
    }

    const toRequest = (f: PostFormState): PostRequest => ({
        slug: f.slug, title: f.title,
        excerpt:  f.excerpt  || undefined,
        content:  f.content  || undefined,
        category: f.category,
        tags: f.tags ? f.tags.split(',').map((t) => t.trim()).filter(Boolean) : undefined,
        gradient: f.gradient || undefined,
        featured: f.featured,
        status:   f.status,
    })

    const handleCreate = async () => {
        setSubmitting(true); setFormError(null)
        try { await createPost(toRequest(form)); closeModal(); load() }
        catch (e) { setFormError(e instanceof Error ? e.message : '생성에 실패했습니다.') }
        finally { setSubmitting(false) }
    }
    const handleUpdate = async () => {
        if (!selected) return
        setSubmitting(true); setFormError(null)
        try { await updatePost(selected.id, toRequest(form)); closeModal(); load() }
        catch (e) { setFormError(e instanceof Error ? e.message : '수정에 실패했습니다.') }
        finally { setSubmitting(false) }
    }
    const handleDelete = async () => {
        if (!selected) return
        setSubmitting(true)
        try { await deletePost(selected.id); closeModal(); load() }
        catch (e) { setFormError(e instanceof Error ? e.message : '삭제에 실패했습니다.') }
        finally { setSubmitting(false) }
    }
    const handleBatchDelete = async () => {
        setSubmitting(true)
        try { await deletePosts(Array.from(selectedIds)); closeModal(); load() }
        catch (e) { setFormError(e instanceof Error ? e.message : '삭제에 실패했습니다.') }
        finally { setSubmitting(false) }
    }
    const handleToggleFeatured = async (p: Post) => {
        try { await toggleFeatured(p.id); load() }
        catch (e) { setError(e instanceof Error ? e.message : '처리 실패') }
    }
    const handleToggleStatus = async (p: Post) => {
        try { await toggleStatus(p.id); load() }
        catch (e) { setError(e instanceof Error ? e.message : '처리 실패') }
    }

    const isEdit      = modalType === 'edit'
    const allChecked  = posts.length > 0 && selectedIds.size === posts.length
    const someChecked = selectedIds.size > 0 && selectedIds.size < posts.length

    return (
        <div className="flex min-h-screen" style={{ background: 'var(--bg-page)' }}>
            <Sidebar />
            <div className="flex-1 flex flex-col min-w-0">
                <Header title="블로그 관리" breadcrumb={['관리자', '블로그 관리']} />

                <main className="flex-1 p-6 space-y-4">
                    {/* 툴바 */}
                    <div className="flex flex-wrap items-center gap-3">
                        <div className="relative flex-1 min-w-48">
                            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2"
                                style={{ color: 'var(--text-faint)' }} />
                            <input type="text" placeholder="제목, 요약 검색..." value={keyword}
                                onChange={(e) => setKeyword(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && setCurrentPage(0)}
                                className="w-full pl-9 pr-4 py-2 text-sm focus:outline-none"
                                style={inputStyle}
                            />
                        </div>
                        <select value={catFilter} onChange={(e) => { setCatFilter(e.target.value); setCurrentPage(0) }}
                            className="px-3 py-2 text-sm focus:outline-none" style={inputStyle}>
                            <option value="">전체 카테고리</option>
                            {CATEGORY_OPTIONS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                        </select>
                        <select value={statFilter} onChange={(e) => { setStatFilter(e.target.value); setCurrentPage(0) }}
                            className="px-3 py-2 text-sm focus:outline-none" style={inputStyle}>
                            <option value="">전체 상태</option>
                            <option value="PUBLISHED">발행</option>
                            <option value="DRAFT">임시저장</option>
                        </select>
                        {selectedIds.size > 0 && (
                            <button onClick={() => { setFormError(null); setModalType('batchDelete') }}
                                className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-colors"
                                style={{ background: 'rgba(239,68,68,0.12)', color: '#ef4444' }}>
                                <Trash2 size={15} /> 선택 삭제 ({selectedIds.size})
                            </button>
                        )}
                        <button onClick={openCreate}
                            className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-colors ml-auto"
                            style={{ background: 'var(--accent)', color: '#fff' }}>
                            <Plus size={15} /> 포스트 작성
                        </button>
                    </div>

                    {error && (
                        <div className="px-4 py-3 rounded-lg text-sm flex items-center justify-between"
                            style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', color: '#ef4444' }}>
                            {error} <button onClick={() => setError(null)}><X size={14} /></button>
                        </div>
                    )}

                    {/* 테이블 */}
                    <div className="rounded-xl overflow-hidden"
                        style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
                        <div className="px-6 py-3" style={{ borderBottom: '1px solid var(--border)' }}>
                            <span className="text-sm" style={{ color: 'var(--text-muted)' }}>
                                총 <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>{page?.totalElements ?? 0}</span>개
                            </span>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr style={{ background: 'var(--bg-hover)', borderBottom: '1px solid var(--border)' }}>
                                        <th className="px-4 py-3 w-10 align-middle">
                                            <input type="checkbox" checked={allChecked}
                                                ref={(el) => { if (el) el.indeterminate = someChecked }}
                                                onChange={toggleAll}
                                                className="w-4 h-4 rounded cursor-pointer block" />
                                        </th>
                                        {['No.', '제목', '카테고리', '상태', '추천', '작성일'].map((h) => (
                                            <th key={h} className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wide align-middle"
                                                style={{ color: 'var(--text-muted)' }}>{h}</th>
                                        ))}
                                        <th className="text-center px-4 py-3 text-xs font-semibold uppercase tracking-wide"
                                            style={{ color: 'var(--text-muted)' }}>관리</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {loading ? (
                                        <tr><td colSpan={8} className="text-center py-16">
                                            <div className="flex flex-col items-center gap-2">
                                                <div className="w-6 h-6 border-2 border-t-transparent rounded-full animate-spin"
                                                    style={{ borderColor: 'var(--accent)', borderTopColor: 'transparent' }} />
                                                <span className="text-sm" style={{ color: 'var(--text-muted)' }}>불러오는 중...</span>
                                            </div>
                                        </td></tr>
                                    ) : posts.length === 0 ? (
                                        <tr><td colSpan={8} className="text-center py-16 text-sm"
                                            style={{ color: 'var(--text-faint)' }}>포스트가 없습니다.</td></tr>
                                    ) : posts.map((p, idx) => (
                                        <tr key={p.id}
                                            style={{
                                                borderBottom: '1px solid var(--border-subtle)',
                                                background: selectedIds.has(p.id) ? 'var(--accent-bg)' : 'transparent',
                                            }}>
                                            <td className="px-4 py-4 align-middle">
                                                <input type="checkbox" checked={selectedIds.has(p.id)}
                                                    onChange={() => toggleOne(p.id)}
                                                    className="w-4 h-4 rounded cursor-pointer block" />
                                            </td>
                                            <td className="px-4 py-4 text-xs" style={{ color: 'var(--text-faint)' }}>{currentPage * 15 + idx + 1}</td>
                                            <td className="px-4 py-4">
                                                <p className="font-medium text-sm line-clamp-1" style={{ color: 'var(--text-primary)' }}>{p.title}</p>
                                            </td>
                                            <td className="px-4 py-4">
                                                <span className="text-xs font-semibold px-2 py-0.5 rounded-full"
                                                    style={CATEGORY_STYLE[p.category]}>
                                                    {p.categoryLabel}
                                                </span>
                                            </td>
                                            <td className="px-4 py-4">
                                                <button onClick={() => handleToggleStatus(p)}
                                                    className="text-xs font-medium px-2 py-0.5 rounded-full transition-colors"
                                                    style={p.status === 'PUBLISHED'
                                                        ? { background: 'rgba(16,185,129,0.12)', color: '#10b981' }
                                                        : { background: 'var(--bg-hover)', color: 'var(--text-faint)' }
                                                    }>
                                                    {p.statusLabel}
                                                </button>
                                            </td>
                                            <td className="px-4 py-4 text-center">
                                                <button onClick={() => handleToggleFeatured(p)}
                                                    title={p.featured ? '추천 해제' : '추천 설정'}
                                                    className="p-1.5 rounded-lg transition-colors">
                                                    {p.featured
                                                        ? <Star size={15} style={{ color: '#f59e0b', fill: '#f59e0b' }} />
                                                        : <StarOff size={15} style={{ color: 'var(--text-faint)' }} />
                                                    }
                                                </button>
                                            </td>
                                            <td className="px-4 py-4 text-xs" style={{ color: 'var(--text-faint)' }}>{formatDate(p.createdAt)}</td>
                                            <td className="px-4 py-4">
                                                <div className="flex items-center justify-center gap-1">
                                                    <a href={`/blog/${p.slug}`} target="_blank" title="미리보기"
                                                        className="p-1.5 rounded-lg transition-colors"
                                                        style={{ color: 'var(--text-faint)' }}>
                                                        <Eye size={15} />
                                                    </a>
                                                    <button onClick={() => openEdit(p)} title="수정"
                                                        className="p-1.5 rounded-lg transition-colors"
                                                        style={{ color: 'var(--text-faint)' }}>
                                                        <PenLine size={15} />
                                                    </button>
                                                    <button onClick={() => openDelete(p)} title="삭제"
                                                        className="p-1.5 rounded-lg transition-colors"
                                                        style={{ color: 'var(--text-faint)' }}>
                                                        <Trash2 size={15} />
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        {totalPages > 1 && (
                            <div className="flex items-center justify-center gap-2 px-6 py-4"
                                style={{ borderTop: '1px solid var(--border)' }}>
                                <button onClick={() => setCurrentPage((p) => Math.max(0, p - 1))} disabled={currentPage === 0}
                                    className="p-1.5 rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                                    style={{ color: 'var(--text-muted)' }}>
                                    <ChevronLeft size={16} />
                                </button>
                                {Array.from({ length: Math.min(totalPages, 10) }, (_, i) => {
                                    const num = Math.max(0, Math.min(currentPage - 4, totalPages - 10)) + i
                                    return (
                                        <button key={num} onClick={() => setCurrentPage(num)}
                                            className="w-8 h-8 rounded-lg text-sm font-medium transition-colors"
                                            style={{
                                                background: currentPage === num ? 'var(--accent)' : 'transparent',
                                                color: currentPage === num ? '#fff' : 'var(--text-muted)',
                                            }}>
                                            {num + 1}
                                        </button>
                                    )
                                })}
                                <button onClick={() => setCurrentPage((p) => Math.min(totalPages - 1, p + 1))} disabled={currentPage === totalPages - 1}
                                    className="p-1.5 rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                                    style={{ color: 'var(--text-muted)' }}>
                                    <ChevronRight size={16} />
                                </button>
                            </div>
                        )}
                    </div>
                </main>
            </div>

            {/* ── 작성/수정 모달 ── */}
            {(modalType === 'create' || modalType === 'edit') && (
                <div className="fixed inset-0 flex items-center justify-center z-50 p-4"
                    style={{ background: 'rgba(0,0,0,0.5)' }}>
                    <div className="rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col"
                        style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
                        <div className="flex items-center justify-between px-6 py-4 shrink-0"
                            style={{ borderBottom: '1px solid var(--border)' }}>
                            <h3 className="font-semibold" style={{ color: 'var(--text-primary)' }}>{isEdit ? '포스트 수정' : '포스트 작성'}</h3>
                            <button onClick={closeModal} className="p-1 rounded-lg transition-colors"
                                style={{ color: 'var(--text-faint)' }}>
                                <X size={18} />
                            </button>
                        </div>

                        <div className="overflow-y-auto px-6 py-5 space-y-4">
                            <div>
                                <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                                    카테고리 <span style={{ color: '#ef4444' }}>*</span>
                                </label>
                                <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value as PostCategoryCode })}
                                    className="w-full px-3 py-2.5 text-sm focus:outline-none" style={inputStyle}>
                                    {CATEGORY_OPTIONS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                                </select>
                            </div>

                            <div>
                                <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                                    제목 <span style={{ color: '#ef4444' }}>*</span>
                                </label>
                                <input type="text" value={form.title}
                                    onChange={(e) => {
                                        const title = e.target.value
                                        if (modalType === 'create' && slugAutoRef.current) {
                                            setForm({ ...form, title, slug: toSlug(title) })
                                        } else {
                                            setForm({ ...form, title })
                                        }
                                    }}
                                    placeholder="포스트 제목"
                                    className="w-full px-3 py-2.5 text-sm focus:outline-none" style={inputStyle} />
                            </div>

                            <div>
                                <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                                    요약 <span style={{ color: 'var(--text-faint)', fontWeight: 400 }}>(선택)</span>
                                </label>
                                <textarea value={form.excerpt} onChange={(e) => setForm({ ...form, excerpt: e.target.value })}
                                    placeholder="포스트 목록에 표시될 요약 (최대 200자)" rows={2}
                                    className="w-full px-3 py-2.5 text-sm focus:outline-none resize-none" style={inputStyle} />
                            </div>

                            <div>
                                <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                                    본문 <span style={{ color: 'var(--text-faint)', fontWeight: 400 }}>(마크다운)</span>
                                </label>
                                <textarea value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })}
                                    placeholder="## 제목&#10;&#10;본문 내용을 마크다운으로 작성하세요." rows={8}
                                    className="w-full px-3 py-2.5 text-sm focus:outline-none resize-none font-mono" style={inputStyle} />
                            </div>

                            <div>
                                <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                                    태그 <span style={{ color: 'var(--text-faint)', fontWeight: 400 }}>(쉼표 구분)</span>
                                </label>
                                <input type="text" value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })}
                                    placeholder="React, TypeScript, 육아"
                                    className="w-full px-3 py-2.5 text-sm focus:outline-none" style={inputStyle} />
                            </div>

                            <div>
                                <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>커버 그라디언트</label>
                                <div className="grid grid-cols-4 gap-2">
                                    {GRADIENT_PRESETS.map((g) => (
                                        <button key={g.value} type="button" onClick={() => setForm({ ...form, gradient: g.value })}
                                            className={`h-10 rounded-lg bg-gradient-to-br ${g.value} transition-all ${
                                                form.gradient === g.value ? 'ring-2 ring-offset-2 ring-orange-500 scale-105' : 'hover:scale-105'
                                            }`}
                                            title={g.label} />
                                    ))}
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>상태</label>
                                    <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as PostStatusCode })}
                                        className="w-full px-3 py-2.5 text-sm focus:outline-none" style={inputStyle}>
                                        <option value="PUBLISHED">발행</option>
                                        <option value="DRAFT">임시저장</option>
                                    </select>
                                </div>
                                <div className="flex items-end pb-2.5">
                                    <label className="flex items-center gap-2 cursor-pointer">
                                        <input type="checkbox" checked={form.featured}
                                            onChange={(e) => setForm({ ...form, featured: e.target.checked })}
                                            className="w-4 h-4 rounded cursor-pointer" />
                                        <span className="text-sm flex items-center gap-1" style={{ color: 'var(--text-secondary)' }}>
                                            <Star size={14} style={{ color: '#f59e0b' }} /> 추천 포스트
                                        </span>
                                    </label>
                                </div>
                            </div>
                        </div>

                        <div className="px-6 shrink-0">
                            {formError && (
                                <div className="px-4 py-3 rounded-lg text-sm"
                                    style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', color: '#ef4444' }}>
                                    {formError}
                                </div>
                            )}
                        </div>
                        <div className="flex gap-3 px-6 py-4 shrink-0" style={{ borderTop: '1px solid var(--border)' }}>
                            <button onClick={closeModal}
                                className="flex-1 px-4 py-2.5 text-sm font-medium rounded-lg transition-colors"
                                style={{ background: 'var(--bg-hover)', color: 'var(--text-secondary)' }}>
                                취소
                            </button>
                            <button onClick={isEdit ? handleUpdate : handleCreate} disabled={submitting}
                                className="flex-1 px-4 py-2.5 text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
                                style={{ background: 'var(--accent)', color: '#fff' }}>
                                {submitting ? '처리 중...' : isEdit ? '저장' : '발행'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── 삭제 확인 ── */}
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
                            <h3 className="font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>포스트 삭제</h3>
                            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                                <span className="font-medium" style={{ color: 'var(--text-primary)' }}>&quot;{selected.title}&quot;</span> 포스트를
                                <br />정말 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.
                            </p>
                            {formError && <p className="mt-3 text-xs" style={{ color: '#ef4444' }}>{formError}</p>}
                        </div>
                        <div className="flex gap-3 px-6 py-4" style={{ borderTop: '1px solid var(--border)' }}>
                            <button onClick={closeModal}
                                className="flex-1 px-4 py-2.5 text-sm font-medium rounded-lg transition-colors"
                                style={{ background: 'var(--bg-hover)', color: 'var(--text-secondary)' }}>
                                취소
                            </button>
                            <button onClick={handleDelete} disabled={submitting}
                                className="flex-1 px-4 py-2.5 text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
                                style={{ background: '#ef4444', color: '#fff' }}>
                                {submitting ? '삭제 중...' : '삭제'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── 일괄 삭제 확인 ── */}
            {modalType === 'batchDelete' && (
                <div className="fixed inset-0 flex items-center justify-center z-50 p-4"
                    style={{ background: 'rgba(0,0,0,0.5)' }}>
                    <div className="rounded-2xl shadow-2xl w-full max-w-sm"
                        style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
                        <div className="px-6 pt-6 pb-4 text-center">
                            <div className="w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4"
                                style={{ background: 'rgba(239,68,68,0.12)' }}>
                                <Trash2 size={22} style={{ color: '#ef4444' }} />
                            </div>
                            <h3 className="font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>선택 포스트 삭제</h3>
                            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                                선택한 <span className="font-medium" style={{ color: 'var(--text-primary)' }}>{selectedIds.size}개</span> 포스트를
                                <br />정말 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.
                            </p>
                            {formError && <p className="mt-3 text-xs" style={{ color: '#ef4444' }}>{formError}</p>}
                        </div>
                        <div className="flex gap-3 px-6 py-4" style={{ borderTop: '1px solid var(--border)' }}>
                            <button onClick={closeModal}
                                className="flex-1 px-4 py-2.5 text-sm font-medium rounded-lg transition-colors"
                                style={{ background: 'var(--bg-hover)', color: 'var(--text-secondary)' }}>
                                취소
                            </button>
                            <button onClick={handleBatchDelete} disabled={submitting}
                                className="flex-1 px-4 py-2.5 text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
                                style={{ background: '#ef4444', color: '#fff' }}>
                                {submitting ? '삭제 중...' : `${selectedIds.size}개 삭제`}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}

export default function AdminBlogPage() {
    return (
        <Suspense fallback={
            <div className="flex items-center justify-center min-h-screen text-sm"
                style={{ color: 'var(--text-faint)' }}>로딩 중...</div>
        }>
            <AdminBlogContent />
        </Suspense>
    )
}
