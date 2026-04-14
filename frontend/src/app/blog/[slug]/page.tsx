'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { ArrowLeft, Tag, Calendar, BookOpen, LayoutDashboard, PenLine, Trash2, X } from 'lucide-react'
import type { Post } from '@/types/post'
import { useAuthStore, getToken } from '@/store/authStore'

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8080'

const CATEGORY_BADGE: Record<string, string> = {
    DEV:       'bg-blue-100 text-blue-700',
    PARENTING: 'bg-pink-100 text-pink-600',
    DAILY:     'bg-amber-100 text-amber-600',
}

function SimpleMarkdown({ content }: { content: string }) {
    const lines = content.split('\n')
    return (
        <div className="space-y-1">
            {lines.map((line, i) => {
                if (line.startsWith('## '))
                    return <h2 key={i} className="text-xl font-bold text-gray-900 mt-8 mb-3 pb-2 border-b border-gray-100">{line.slice(3)}</h2>
                if (line.startsWith('### '))
                    return <h3 key={i} className="text-base font-semibold text-gray-800 mt-5 mb-2">{line.slice(4)}</h3>
                if (line.startsWith('- '))
                    return <li key={i} className="text-gray-600 text-sm leading-relaxed ml-4 list-disc">{line.slice(2)}</li>
                if (line.trim() === '')
                    return <div key={i} className="h-3" />
                return <p key={i} className="text-gray-600 text-sm leading-7">{line}</p>
            })}
        </div>
    )
}

export default function BlogPostPage() {
    const params = useParams()
    const router = useRouter()
    const slug   = params.slug as string
    const { user } = useAuthStore()
    const isSuperAdmin = user?.role === 'SUPER_ADMIN'

    const [post, setPost]               = useState<Post | null>(null)
    const [loading, setLoading]         = useState(true)
    const [notFound, setNotFound]       = useState(false)
    const [showDeleteModal, setShowDeleteModal] = useState(false)
    const [deleting, setDeleting]       = useState(false)
    const [deleteError, setDeleteError] = useState<string | null>(null)

    useEffect(() => {
        fetch(`${API}/api/posts/${slug}`)
            .then((r) => r.json())
            .then((json) => { if (json.success) setPost(json.data); else setNotFound(true) })
            .catch(() => setNotFound(true))
            .finally(() => setLoading(false))
    }, [slug])

    const handleDelete = async () => {
        if (!post) return
        setDeleting(true); setDeleteError(null)
        try {
            const token = getToken()
            const res = await fetch(`${API}/api/posts/${post.id}`, {
                method: 'DELETE',
                headers: token ? { Authorization: `Bearer ${token}` } : {},
            })
            if (res.status === 204 || res.ok) {
                router.push('/blog')
            } else {
                const json = await res.json()
                setDeleteError(json.message ?? '삭제에 실패했습니다.')
            }
        } catch {
            setDeleteError('서버에 연결할 수 없습니다.')
        } finally { setDeleting(false) }
    }

    return (
        <div className="min-h-screen bg-gray-50">
            {/* ── 네비게이션 ── */}
            <nav className="bg-white border-b border-gray-100 sticky top-0 z-30 shadow-sm">
                <div className="max-w-4xl mx-auto px-6 h-16 flex items-center justify-between">
                    <Link href="/blog" className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-lg flex items-center justify-center">
                            <BookOpen size={15} className="text-white" />
                        </div>
                        <div>
                            <p className="text-sm font-bold text-gray-900 leading-none">기빵 블로그</p>
                            <p className="text-[10px] text-gray-400 mt-0.5">개발 · 육아 · 일상</p>
                        </div>
                    </Link>
                    <div className="flex items-center gap-3">
                        <Link href="/blog" className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 transition-colors">
                            <ArrowLeft size={14} /> 목록
                        </Link>
                        <Link href="/" className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-500 hover:text-gray-800 hover:bg-gray-50 rounded-lg transition-colors">
                            <LayoutDashboard size={14} />
                            <span className="hidden sm:inline">대시보드</span>
                        </Link>
                    </div>
                </div>
            </nav>

            {/* ── 로딩 ── */}
            {loading && (
                <div className="flex justify-center items-center py-40">
                    <div className="w-7 h-7 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                </div>
            )}

            {/* ── 포스트 없음 ── */}
            {!loading && (notFound || !post) && (
                <div className="flex flex-col items-center justify-center py-40 text-gray-400">
                    <p className="text-5xl mb-4">📭</p>
                    <p className="text-base mb-4">포스트를 찾을 수 없습니다.</p>
                    <Link href="/blog" className="flex items-center gap-1.5 text-sm text-blue-500 hover:text-blue-700 transition-colors">
                        <ArrowLeft size={14} /> 목록으로 돌아가기
                    </Link>
                </div>
            )}

            {/* ── 포스트 콘텐츠 ── */}
            {!loading && post && (
                <div className="max-w-4xl mx-auto px-6 py-10 space-y-8">
                    {/* 커버 */}
                    <div className={`h-64 sm:h-80 rounded-2xl bg-gradient-to-br ${post.gradient ?? 'from-gray-400 to-gray-600'} flex items-center justify-center relative overflow-hidden shadow-lg`}>
                        <div className="absolute inset-0 bg-black/10" />
                        <span className="text-8xl relative z-10 drop-shadow-xl select-none">{post.emoji ?? '📝'}</span>
                    </div>

                    {/* 헤더 */}
                    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8">
                        {/* 슈퍼관리자 액션 버튼 */}
                        {isSuperAdmin && (
                            <div className="flex items-center justify-end gap-2 mb-5">
                                <Link
                                    href={`/admin/blog?edit=${post.id}`}
                                    className="flex items-center gap-1.5 px-3.5 py-2 text-sm font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors"
                                >
                                    <PenLine size={14} /> 수정
                                </Link>
                                <button
                                    onClick={() => { setShowDeleteModal(true); setDeleteError(null) }}
                                    className="flex items-center gap-1.5 px-3.5 py-2 text-sm font-medium text-red-500 bg-red-50 hover:bg-red-100 rounded-lg transition-colors"
                                >
                                    <Trash2 size={14} /> 삭제
                                </button>
                            </div>
                        )}
                        <div className="flex flex-wrap items-center gap-3 mb-5">
                            <span className={`text-xs font-semibold px-3 py-1.5 rounded-full ${CATEGORY_BADGE[post.category] ?? 'bg-gray-100 text-gray-600'}`}>
                                {post.categoryLabel}
                            </span>
                            <span className="flex items-center gap-1.5 text-sm text-gray-400">
                                <Calendar size={13} />
                                {new Date(post.createdAt).toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' })}
                            </span>
                        </div>
                        <h1 className="text-3xl font-extrabold text-gray-900 leading-snug mb-5 tracking-tight">
                            {post.title}
                        </h1>
                        {post.excerpt && (
                            <p className="text-base text-gray-500 leading-relaxed border-l-4 border-blue-200 pl-4 mb-5">
                                {post.excerpt}
                            </p>
                        )}
                        {post.tags.length > 0 && (
                            <div className="flex flex-wrap gap-2">
                                {post.tags.map((tag) => (
                                    <span key={tag} className="inline-flex items-center gap-1 text-xs bg-gray-100 text-gray-500 px-2.5 py-1 rounded-full">
                                        <Tag size={10} /> {tag}
                                    </span>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* 본문 */}
                    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8">
                        {post.content
                            ? <SimpleMarkdown content={post.content} />
                            : <p className="text-gray-400 text-sm">본문이 없습니다.</p>
                        }
                    </div>

                    {/* 하단 버튼 */}
                    <div className="flex justify-center">
                        <Link href="/blog" className="flex items-center gap-2 px-6 py-3 bg-white border border-gray-200 rounded-xl text-sm font-medium text-gray-600 hover:text-gray-900 hover:border-gray-300 transition-all shadow-sm">
                            <ArrowLeft size={14} /> 목록으로
                        </Link>
                    </div>

                    {/* 푸터 */}
                    <footer className="text-center py-6 border-t border-gray-100">
                        <p className="text-sm text-gray-400">© 2026 기빵 블로그</p>
                    </footer>
                </div>
            )}

            {/* ── 삭제 확인 모달 ── */}
            {showDeleteModal && post && (
                <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm">
                        <div className="px-6 pt-6 pb-4 text-center">
                            <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                                <Trash2 size={22} className="text-red-500" />
                            </div>
                            <h3 className="font-semibold text-gray-800 mb-2">포스트 삭제</h3>
                            <p className="text-sm text-gray-500">
                                <span className="font-medium text-gray-700">&quot;{post.title}&quot;</span> 포스트를
                                <br />정말 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.
                            </p>
                            {deleteError && <p className="mt-3 text-xs text-red-500">{deleteError}</p>}
                        </div>
                        <div className="flex gap-3 px-6 py-4 border-t border-gray-100">
                            <button
                                onClick={() => setShowDeleteModal(false)}
                                className="flex-1 px-4 py-2.5 text-sm font-medium text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
                            >
                                취소
                            </button>
                            <button
                                onClick={handleDelete}
                                disabled={deleting}
                                className="flex-1 px-4 py-2.5 text-sm font-medium text-white bg-red-500 rounded-lg hover:bg-red-600 disabled:opacity-50 transition-colors"
                            >
                                {deleting ? '삭제 중...' : '삭제'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
