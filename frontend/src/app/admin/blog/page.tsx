'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Sidebar from '@/components/layout/Sidebar'
import Header from '@/components/layout/Header'
import {
    PenLine, Trash2, X, ChevronLeft, ChevronRight,
    Star, StarOff, Eye, EyeOff, Search, Plus,
} from 'lucide-react'
import type { Post, PostCategoryCode, PostFormState, PostPage, PostRequest, PostStatusCode } from '@/types/post'
import { CATEGORY_OPTIONS, GRADIENT_PRESETS } from '@/types/post'
import { getToken } from '@/store/authStore'

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8080'

/* ── API ── */
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

const fetchPosts = (params: Record<string, string>) =>
    apiFetch<PostPage>(`/api/posts/admin/list?${new URLSearchParams(params)}`)

const createPost = (data: PostRequest) =>
    apiFetch<Post>('/api/posts', { method: 'POST', body: JSON.stringify(data) })

const updatePost = (id: number, data: PostRequest) =>
    apiFetch<Post>(`/api/posts/${id}`, { method: 'PUT', body: JSON.stringify(data) })

const deletePost  = (id: number) => apiFetch<void>(`/api/posts/${id}`, { method: 'DELETE' })
const toggleFeatured = (id: number) => apiFetch<Post>(`/api/posts/${id}/featured`, { method: 'PATCH' })
const toggleStatus   = (id: number) => apiFetch<Post>(`/api/posts/${id}/status`,   { method: 'PATCH' })
const fetchPostBySlug = (slug: string) => apiFetch<Post>(`/api/posts/${slug}`)

/* ── 빈 폼 ── */
const EMPTY_FORM: PostFormState = {
    slug: '', title: '', excerpt: '', content: '',
    category: 'DEV', tags: '', emoji: '', gradient: GRADIENT_PRESETS[0].value,
    featured: false, status: 'PUBLISHED',
}

const CATEGORY_BADGE: Record<PostCategoryCode, string> = {
    DEV:       'bg-blue-100 text-blue-700',
    PARENTING: 'bg-pink-100 text-pink-600',
    DAILY:     'bg-amber-100 text-amber-600',
}

function formatDate(iso: string) {
    return new Date(iso).toLocaleDateString('ko-KR', { month: '2-digit', day: '2-digit', year: 'numeric' })
}

/* ── 메인 ── */
export default function AdminBlogPage() {
    const searchParams = useSearchParams()
    const router = useRouter()

    const [page, setPage]             = useState<PostPage | null>(null)
    const [loading, setLoading]       = useState(false)
    const [error, setError]           = useState<string | null>(null)
    const [keyword, setKeyword]       = useState('')
    const [catFilter, setCatFilter]   = useState('')
    const [statFilter, setStatFilter] = useState('')
    const [currentPage, setCurrentPage] = useState(0)

    const [modalType, setModalType]   = useState<'create' | 'edit' | 'delete' | null>(null)
    const [selected, setSelected]     = useState<Post | null>(null)
    const [form, setForm]             = useState<PostFormState>(EMPTY_FORM)
    const [formError, setFormError]   = useState<string | null>(null)
    const [submitting, setSubmitting] = useState(false)
    const abortRef = useRef<AbortController | null>(null)
    const dismissedEditId = useRef<string | null>(null)

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
        } catch (e) {
            if (e instanceof Error && e.name !== 'AbortError') setError('목록을 불러오지 못했습니다.')
        } finally { setLoading(false) }
    }, [keyword, catFilter, statFilter, currentPage])

    useEffect(() => { load() }, [load])

    /* 블로그 상세에서 ?edit=id 로 넘어온 경우 해당 포스트 수정 모달 자동 오픈 */
    useEffect(() => {
        const editId = searchParams.get('edit')
        if (!editId || !page) return
        if (dismissedEditId.current === editId) return   // 이미 닫은 파라미터면 무시
        const target = page.content.find((p) => p.id === Number(editId))
        if (target) openEdit(target)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [searchParams, page])

    const openCreate = () => { setForm(EMPTY_FORM); setFormError(null); setModalType('create') }
    const openEdit   = async (p: Post) => {
        setSelected(p)
        setFormError(null)
        setModalType('edit')
        /* 목록 API는 content를 제외하므로 단건 조회로 본문을 가져옴 */
        try {
            const full = await fetchPostBySlug(p.slug)
            setForm({
                slug: full.slug, title: full.title, excerpt: full.excerpt ?? '',
                content: full.content ?? '', category: full.category,
                tags: full.tags.join(', '), emoji: full.emoji ?? '',
                gradient: full.gradient ?? GRADIENT_PRESETS[0].value,
                featured: full.featured, status: full.status,
            })
        } catch {
            /* 단건 조회 실패 시 목록 데이터로 폴백 */
            setForm({
                slug: p.slug, title: p.title, excerpt: p.excerpt ?? '',
                content: p.content ?? '', category: p.category,
                tags: p.tags.join(', '), emoji: p.emoji ?? '',
                gradient: p.gradient ?? GRADIENT_PRESETS[0].value,
                featured: p.featured, status: p.status,
            })
        }
    }
    const openDelete = (p: Post) => { setSelected(p); setModalType('delete') }
    const closeModal = () => {
        setModalType(null); setSelected(null); setFormError(null)
        const editId = searchParams.get('edit')
        if (editId) {
            dismissedEditId.current = editId   // effect 재실행 시 재오픈 방지
            router.replace('/admin/blog')
        }
    }

    const toRequest = (f: PostFormState): PostRequest => ({
        slug: f.slug, title: f.title,
        excerpt:  f.excerpt  || undefined,
        content:  f.content  || undefined,
        category: f.category,
        tags: f.tags ? f.tags.split(',').map((t) => t.trim()).filter(Boolean) : undefined,
        emoji:    f.emoji    || undefined,
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

    const handleToggleFeatured = async (p: Post) => {
        try { await toggleFeatured(p.id); load() }
        catch (e) { setError(e instanceof Error ? e.message : '처리 실패') }
    }

    const handleToggleStatus = async (p: Post) => {
        try { await toggleStatus(p.id); load() }
        catch (e) { setError(e instanceof Error ? e.message : '처리 실패') }
    }

    const isEdit = modalType === 'edit'

    return (
        <div className="flex min-h-screen bg-gray-50">
            <Sidebar />
            <div className="flex-1 flex flex-col min-w-0">
                <Header title="블로그 관리" breadcrumb={['관리자', '블로그 관리']} />

                <main className="flex-1 p-6 space-y-4">
                    {/* 툴바 */}
                    <div className="flex flex-wrap items-center gap-3">
                        <div className="relative flex-1 min-w-48">
                            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                            <input type="text" placeholder="제목, 요약 검색..." value={keyword}
                                onChange={(e) => setKeyword(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && setCurrentPage(0)}
                                className="w-full pl-9 pr-4 py-2 text-sm bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400"
                            />
                        </div>
                        <select value={catFilter} onChange={(e) => { setCatFilter(e.target.value); setCurrentPage(0) }}
                            className="px-3 py-2 text-sm bg-white border border-gray-200 rounded-lg focus:outline-none text-gray-600">
                            <option value="">전체 카테고리</option>
                            {CATEGORY_OPTIONS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                        </select>
                        <select value={statFilter} onChange={(e) => { setStatFilter(e.target.value); setCurrentPage(0) }}
                            className="px-3 py-2 text-sm bg-white border border-gray-200 rounded-lg focus:outline-none text-gray-600">
                            <option value="">전체 상태</option>
                            <option value="PUBLISHED">발행</option>
                            <option value="DRAFT">임시저장</option>
                        </select>
                        <button onClick={openCreate}
                            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors ml-auto">
                            <Plus size={15} /> 포스트 작성
                        </button>
                    </div>

                    {error && (
                        <div className="px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600 flex items-center justify-between">
                            {error} <button onClick={() => setError(null)}><X size={14} /></button>
                        </div>
                    )}

                    {/* 테이블 */}
                    <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
                        <div className="px-6 py-3 border-b border-gray-100">
                            <span className="text-sm text-gray-500">총 <span className="font-semibold text-gray-800">{page?.totalElements ?? 0}</span>개</span>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="bg-gray-50 border-b border-gray-100">
                                        <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide w-12">No.</th>
                                        <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">제목</th>
                                        <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide w-24">카테고리</th>
                                        <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide w-20">상태</th>
                                        <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide w-16">추천</th>
                                        <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide w-28">작성일</th>
                                        <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide w-24">관리</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-50">
                                    {loading ? (
                                        <tr><td colSpan={7} className="text-center py-16 text-gray-400">
                                            <div className="flex flex-col items-center gap-2">
                                                <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                                                <span className="text-sm">불러오는 중...</span>
                                            </div>
                                        </td></tr>
                                    ) : posts.length === 0 ? (
                                        <tr><td colSpan={7} className="text-center py-16 text-gray-400 text-sm">포스트가 없습니다.</td></tr>
                                    ) : posts.map((p, idx) => (
                                        <tr key={p.id} className="hover:bg-gray-50/60 transition-colors">
                                            <td className="px-4 py-4 text-gray-400 text-xs">{currentPage * 15 + idx + 1}</td>
                                            <td className="px-4 py-4">
                                                <div className="flex items-center gap-2">
                                                    <span className="text-lg">{p.emoji ?? '📝'}</span>
                                                    <div>
                                                        <p className="font-medium text-gray-800 text-sm line-clamp-1">{p.title}</p>
                                                        <p className="text-xs text-gray-400 mt-0.5">{p.slug}</p>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-4 py-4">
                                                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${CATEGORY_BADGE[p.category]}`}>
                                                    {p.categoryLabel}
                                                </span>
                                            </td>
                                            <td className="px-4 py-4">
                                                <button onClick={() => handleToggleStatus(p)}
                                                    className={`text-xs font-medium px-2 py-0.5 rounded-full transition-colors ${
                                                        p.status === 'PUBLISHED'
                                                            ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
                                                            : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                                                    }`}>
                                                    {p.statusLabel}
                                                </button>
                                            </td>
                                            <td className="px-4 py-4 text-center">
                                                <button onClick={() => handleToggleFeatured(p)}
                                                    title={p.featured ? '추천 해제' : '추천 설정'}
                                                    className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors">
                                                    {p.featured
                                                        ? <Star size={15} className="text-amber-400 fill-amber-400" />
                                                        : <StarOff size={15} className="text-gray-300" />
                                                    }
                                                </button>
                                            </td>
                                            <td className="px-4 py-4 text-gray-400 text-xs">{formatDate(p.createdAt)}</td>
                                            <td className="px-4 py-4">
                                                <div className="flex items-center justify-center gap-1">
                                                    <a href={`/blog/${p.slug}`} target="_blank"
                                                        title="미리보기"
                                                        className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition-colors">
                                                        <Eye size={15} />
                                                    </a>
                                                    <button onClick={() => openEdit(p)} title="수정"
                                                        className="p-1.5 rounded-lg hover:bg-blue-50 text-gray-400 hover:text-blue-600 transition-colors">
                                                        <PenLine size={15} />
                                                    </button>
                                                    <button onClick={() => openDelete(p)} title="삭제"
                                                        className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors">
                                                        <Trash2 size={15} />
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        {/* 페이지네이션 */}
                        {totalPages > 1 && (
                            <div className="flex items-center justify-center gap-2 px-6 py-4 border-t border-gray-100">
                                <button onClick={() => setCurrentPage((p) => Math.max(0, p - 1))} disabled={currentPage === 0}
                                    className="p-1.5 rounded-lg hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed">
                                    <ChevronLeft size={16} />
                                </button>
                                {Array.from({ length: Math.min(totalPages, 10) }, (_, i) => {
                                    const num = Math.max(0, Math.min(currentPage - 4, totalPages - 10)) + i
                                    return (
                                        <button key={num} onClick={() => setCurrentPage(num)}
                                            className={`w-8 h-8 rounded-lg text-sm font-medium transition-colors
                                                ${currentPage === num ? 'bg-blue-600 text-white' : 'hover:bg-gray-100 text-gray-600'}`}>
                                            {num + 1}
                                        </button>
                                    )
                                })}
                                <button onClick={() => setCurrentPage((p) => Math.min(totalPages - 1, p + 1))} disabled={currentPage === totalPages - 1}
                                    className="p-1.5 rounded-lg hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed">
                                    <ChevronRight size={16} />
                                </button>
                            </div>
                        )}
                    </div>
                </main>
            </div>

            {/* ── 작성/수정 모달 ── */}
            {(modalType === 'create' || modalType === 'edit') && (
                <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
                        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
                            <h3 className="font-semibold text-gray-800">{isEdit ? '포스트 수정' : '포스트 작성'}</h3>
                            <button onClick={closeModal} className="p-1 rounded-lg hover:bg-gray-100 text-gray-400">
                                <X size={18} />
                            </button>
                        </div>

                        <div className="overflow-y-auto px-6 py-5 space-y-4">

                            {/* 슬러그 + 제목 */}
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-medium text-gray-600 mb-1.5">슬러그 <span className="text-red-400">*</span></label>
                                    <input type="text" value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })}
                                        placeholder="url-friendly-slug"
                                        className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/30" />
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-gray-600 mb-1.5">카테고리 <span className="text-red-400">*</span></label>
                                    <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value as PostCategoryCode })}
                                        className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/30 bg-white">
                                        {CATEGORY_OPTIONS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                                    </select>
                                </div>
                            </div>

                            <div>
                                <label className="block text-xs font-medium text-gray-600 mb-1.5">제목 <span className="text-red-400">*</span></label>
                                <input type="text" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })}
                                    placeholder="포스트 제목"
                                    className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/30" />
                            </div>

                            <div>
                                <label className="block text-xs font-medium text-gray-600 mb-1.5">요약 <span className="text-gray-400 font-normal">(선택)</span></label>
                                <textarea value={form.excerpt} onChange={(e) => setForm({ ...form, excerpt: e.target.value })}
                                    placeholder="포스트 목록에 표시될 요약 (최대 200자)" rows={2}
                                    className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/30 resize-none" />
                            </div>

                            <div>
                                <label className="block text-xs font-medium text-gray-600 mb-1.5">본문 <span className="text-gray-400 font-normal">(마크다운)</span></label>
                                <textarea value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })}
                                    placeholder="## 제목&#10;&#10;본문 내용을 마크다운으로 작성하세요." rows={8}
                                    className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/30 resize-none font-mono" />
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-medium text-gray-600 mb-1.5">태그 <span className="text-gray-400 font-normal">(쉼표 구분)</span></label>
                                    <input type="text" value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })}
                                        placeholder="React, TypeScript, 육아"
                                        className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/30" />
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-gray-600 mb-1.5">이모지</label>
                                    <input type="text" value={form.emoji} onChange={(e) => setForm({ ...form, emoji: e.target.value })}
                                        placeholder="🚀"
                                        className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/30" />
                                </div>
                            </div>

                            <div>
                                <label className="block text-xs font-medium text-gray-600 mb-1.5">커버 그라디언트</label>
                                <div className="grid grid-cols-4 gap-2">
                                    {GRADIENT_PRESETS.map((g) => (
                                        <button key={g.value} type="button" onClick={() => setForm({ ...form, gradient: g.value })}
                                            className={`h-10 rounded-lg bg-gradient-to-br ${g.value} transition-all ${
                                                form.gradient === g.value ? 'ring-2 ring-offset-2 ring-blue-500 scale-105' : 'hover:scale-105'
                                            }`}
                                            title={g.label}
                                        />
                                    ))}
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-medium text-gray-600 mb-1.5">상태</label>
                                    <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as PostStatusCode })}
                                        className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/30 bg-white">
                                        <option value="PUBLISHED">발행</option>
                                        <option value="DRAFT">임시저장</option>
                                    </select>
                                </div>
                                <div className="flex items-end pb-2.5">
                                    <label className="flex items-center gap-2 cursor-pointer">
                                        <input type="checkbox" checked={form.featured}
                                            onChange={(e) => setForm({ ...form, featured: e.target.checked })}
                                            className="w-4 h-4 rounded border-gray-300 text-amber-500 cursor-pointer" />
                                        <span className="text-sm text-gray-700 flex items-center gap-1">
                                            <Star size={14} className="text-amber-400" /> 추천 포스트
                                        </span>
                                    </label>
                                </div>
                            </div>
                        </div>

                        <div className="px-6 pb-0 pt-0 shrink-0">
                            {formError && (
                                <div className="px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">
                                    {formError}
                                </div>
                            )}
                        </div>
                        <div className="flex gap-3 px-6 py-4 border-t border-gray-100 shrink-0">
                            <button onClick={closeModal} className="flex-1 px-4 py-2.5 text-sm font-medium text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors">
                                취소
                            </button>
                            <button onClick={isEdit ? handleUpdate : handleCreate} disabled={submitting}
                                className="flex-1 px-4 py-2.5 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors">
                                {submitting ? '처리 중...' : isEdit ? '저장' : '발행'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── 삭제 확인 ── */}
            {modalType === 'delete' && selected && (
                <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm">
                        <div className="px-6 pt-6 pb-4 text-center">
                            <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                                <Trash2 size={22} className="text-red-500" />
                            </div>
                            <h3 className="font-semibold text-gray-800 mb-2">포스트 삭제</h3>
                            <p className="text-sm text-gray-500">
                                <span className="font-medium text-gray-700">&quot;{selected.title}&quot;</span> 포스트를
                                <br />정말 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.
                            </p>
                            {formError && <p className="mt-3 text-xs text-red-500">{formError}</p>}
                        </div>
                        <div className="flex gap-3 px-6 py-4 border-t border-gray-100">
                            <button onClick={closeModal} className="flex-1 px-4 py-2.5 text-sm font-medium text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors">
                                취소
                            </button>
                            <button onClick={handleDelete} disabled={submitting}
                                className="flex-1 px-4 py-2.5 text-sm font-medium text-white bg-red-500 rounded-lg hover:bg-red-600 disabled:opacity-50 transition-colors">
                                {submitting ? '삭제 중...' : '삭제'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
