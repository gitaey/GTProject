'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { Search, Tag, ArrowUpRight, Code2, Baby, Coffee, BookOpen, Heart, LayoutDashboard } from 'lucide-react'
import type { Post, PostCategoryCode, PostPage } from '@/types/post'

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8080'

const CATEGORY_BADGE: Record<PostCategoryCode, string> = {
    DEV:       'bg-blue-100 text-blue-700',
    PARENTING: 'bg-pink-100 text-pink-600',
    DAILY:     'bg-amber-100 text-amber-600',
}

const CATEGORIES: { code: PostCategoryCode | ''; label: string; icon: React.ReactNode }[] = [
    { code: '',          label: '전체', icon: <BookOpen size={14} /> },
    { code: 'DEV',       label: '개발', icon: <Code2 size={14} /> },
    { code: 'PARENTING', label: '육아', icon: <Baby size={14} /> },
    { code: 'DAILY',     label: '일상', icon: <Coffee size={14} /> },
]

function formatDate(iso: string) {
    return new Date(iso).toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' })
}

function FeaturedPost({ post }: { post: Post }) {
    return (
        <Link href={`/blog/${post.slug}`} className="group block">
            <div className="bg-white rounded-2xl overflow-hidden shadow-sm hover:shadow-xl transition-all duration-300 border border-gray-100">
                <div className={`h-64 bg-gradient-to-br ${post.gradient ?? 'from-gray-400 to-gray-600'} flex items-center justify-center relative overflow-hidden`}>
                    <div className="absolute inset-0 bg-black/10" />
                    <span className="text-7xl relative z-10 drop-shadow-lg select-none">{post.emoji ?? '📝'}</span>
                    <div className="absolute top-5 left-5">
                        <span className="text-xs font-semibold px-3 py-1.5 rounded-full bg-white/20 backdrop-blur-sm text-white">
                            ✨ 추천 포스트
                        </span>
                    </div>
                </div>
                <div className="p-7">
                    <div className="flex items-center gap-3 mb-3">
                        <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${CATEGORY_BADGE[post.category]}`}>
                            {post.categoryLabel}
                        </span>
                        <span className="text-xs text-gray-400 ml-auto">{formatDate(post.createdAt)}</span>
                    </div>
                    <h2 className="text-2xl font-bold text-gray-900 mb-3 group-hover:text-blue-600 transition-colors line-clamp-2 leading-snug">
                        {post.title}
                    </h2>
                    <p className="text-sm text-gray-500 line-clamp-3 leading-relaxed">{post.excerpt}</p>
                    <div className="flex items-center gap-2 mt-5">
                        {post.tags.slice(0, 4).map((tag) => (
                            <span key={tag} className="text-[11px] bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">#{tag}</span>
                        ))}
                        <ArrowUpRight size={18} className="ml-auto text-gray-300 group-hover:text-blue-500 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-all" />
                    </div>
                </div>
            </div>
        </Link>
    )
}

function PostCard({ post }: { post: Post }) {
    return (
        <Link href={`/blog/${post.slug}`} className="group block">
            <div className="bg-white rounded-2xl overflow-hidden shadow-sm hover:shadow-lg hover:-translate-y-1 transition-all duration-200 border border-gray-100 h-full flex flex-col">
                <div className={`h-44 bg-gradient-to-br ${post.gradient ?? 'from-gray-400 to-gray-600'} flex items-center justify-center relative overflow-hidden shrink-0`}>
                    <div className="absolute inset-0 bg-black/5" />
                    <span className="text-5xl relative z-10 drop-shadow select-none">{post.emoji ?? '📝'}</span>
                </div>
                <div className="p-5 flex flex-col flex-1">
                    <div className="flex items-center gap-2 mb-2.5">
                        <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${CATEGORY_BADGE[post.category]}`}>
                            {post.categoryLabel}
                        </span>
                    </div>
                    <h3 className="text-base font-bold text-gray-900 mb-2 group-hover:text-blue-600 transition-colors line-clamp-2 leading-snug">
                        {post.title}
                    </h3>
                    <p className="text-xs text-gray-500 line-clamp-3 leading-relaxed flex-1">{post.excerpt}</p>
                    <div className="flex items-center justify-between mt-4 pt-4 border-t border-gray-50">
                        <div className="flex gap-1 flex-wrap">
                            {post.tags.slice(0, 2).map((tag) => (
                                <span key={tag} className="text-[10px] bg-gray-100 text-gray-400 px-1.5 py-0.5 rounded-full">#{tag}</span>
                            ))}
                        </div>
                        <span className="text-[11px] text-gray-400 shrink-0">{formatDate(post.createdAt)}</span>
                    </div>
                </div>
            </div>
        </Link>
    )
}

export default function BlogPage() {
    const [page, setPage]             = useState<PostPage | null>(null)
    const [loading, setLoading]       = useState(false)
    const [category, setCategory]     = useState<PostCategoryCode | ''>('')
    const [keyword, setKeyword]       = useState('')
    const [tagFilter, setTagFilter]   = useState('')
    const abortRef = useRef<AbortController | null>(null)

    const load = useCallback(async () => {
        abortRef.current?.abort()
        abortRef.current = new AbortController()
        setLoading(true)
        try {
            const params = new URLSearchParams({ size: '20' })
            if (category)  params.set('category', category)
            if (keyword)   params.set('keyword', keyword)
            if (tagFilter) params.set('keyword', tagFilter)
            const res  = await fetch(`${API}/api/posts?${params}`, { signal: abortRef.current.signal })
            const json = await res.json()
            if (json.success) setPage(json.data)
        } catch (e) {
            if (e instanceof Error && e.name !== 'AbortError') console.error(e)
        } finally { setLoading(false) }
    }, [category, keyword, tagFilter])

    useEffect(() => { load() }, [load])

    const posts    = page?.content ?? []
    const featured = !category && !keyword && !tagFilter ? posts.find((p) => p.featured) : undefined
    const rest     = featured ? posts.filter((p) => p.id !== featured.id) : posts
    const allTags  = Array.from(new Set(posts.flatMap((p) => p.tags)))

    const countOf = (code: PostCategoryCode | '') =>
        code === '' ? (page?.totalElements ?? 0) : posts.filter((p) => p.category === code).length

    return (
        <div className="min-h-screen bg-gray-50">
            {/* ── 네비게이션 ── */}
            <nav className="bg-white border-b border-gray-100 sticky top-0 z-30 shadow-sm">
                <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
                    <Link href="/blog" className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-lg flex items-center justify-center">
                            <BookOpen size={15} className="text-white" />
                        </div>
                        <div>
                            <p className="text-sm font-bold text-gray-900 leading-none">기빵 블로그</p>
                            <p className="text-[10px] text-gray-400 mt-0.5">개발 · 육아 · 일상</p>
                        </div>
                    </Link>

                    <div className="flex items-center gap-4">
                        {/* 카테고리 */}
                        <div className="hidden sm:flex items-center gap-1">
                            {CATEGORIES.map(({ code, label }) => (
                                <button key={code} onClick={() => { setCategory(code); setTagFilter('') }}
                                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all
                                        ${category === code
                                            ? 'bg-blue-50 text-blue-700'
                                            : 'text-gray-500 hover:text-gray-800 hover:bg-gray-50'
                                        }`}>
                                    {label}
                                    {countOf(code) > 0 && (
                                        <span className="text-[10px] bg-gray-100 text-gray-400 px-1.5 py-0.5 rounded-full">{countOf(code)}</span>
                                    )}
                                </button>
                            ))}
                        </div>

                        {/* 검색 */}
                        <div className="relative">
                            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                            <input type="text" placeholder="검색..." value={keyword}
                                onChange={(e) => { setKeyword(e.target.value); setTagFilter('') }}
                                className="w-40 pl-8 pr-3 py-1.5 text-sm bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 focus:w-52 transition-all" />
                        </div>

                        {/* 대시보드 이동 */}
                        <Link href="/" className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-500 hover:text-gray-800 hover:bg-gray-50 rounded-lg transition-colors">
                            <LayoutDashboard size={14} />
                            <span className="hidden sm:inline">대시보드</span>
                        </Link>
                    </div>
                </div>
            </nav>

            {/* ── 콘텐츠 ── */}
            <div className="max-w-6xl mx-auto px-6 py-10 space-y-10">
                {/* 히어로 */}
                {!category && !keyword && !tagFilter && (
                    <div className="text-center py-6">
                        <h1 className="text-4xl font-extrabold text-gray-900 mb-3 tracking-tight">기빵의 블로그</h1>
                        <p className="text-gray-500 text-base">개발 이야기, 육아 일기, 그리고 일상을 기록합니다.</p>
                    </div>
                )}

                {/* 모바일 카테고리 탭 */}
                <div className="sm:hidden flex gap-2 overflow-x-auto pb-1">
                    {CATEGORIES.map(({ code, label, icon }) => (
                        <button key={code} onClick={() => { setCategory(code); setTagFilter('') }}
                            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-all shrink-0
                                ${category === code ? 'bg-gray-900 text-white' : 'bg-white text-gray-500 border border-gray-200'}`}>
                            {icon} {label}
                        </button>
                    ))}
                </div>

                {/* 로딩 */}
                {loading && (
                    <div className="flex justify-center py-20">
                        <div className="w-7 h-7 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                    </div>
                )}

                {/* 빈 상태 */}
                {!loading && posts.length === 0 && (
                    <div className="flex flex-col items-center justify-center py-28 text-gray-400">
                        <BookOpen size={40} className="mb-4 opacity-25" />
                        <p className="text-base">포스트가 없습니다.</p>
                        {(keyword || tagFilter) && (
                            <button onClick={() => { setKeyword(''); setTagFilter('') }}
                                className="mt-3 text-sm text-blue-500 hover:text-blue-700">
                                전체 보기
                            </button>
                        )}
                    </div>
                )}

                {/* 피처드 포스트 */}
                {!loading && featured && (
                    <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
                        <div className="lg:col-span-3">
                            <FeaturedPost post={featured} />
                        </div>
                        <div className="lg:col-span-2 flex flex-col gap-6">
                            {rest.slice(0, 2).map((p) => <PostCard key={p.id} post={p} />)}
                        </div>
                    </div>
                )}

                {/* 포스트 그리드 */}
                {!loading && (featured ? rest.slice(2) : rest).length > 0 && (
                    <div>
                        {featured && (
                            <div className="flex items-center gap-4 mb-6">
                                <h2 className="text-lg font-bold text-gray-900">전체 포스트</h2>
                                <div className="flex-1 h-px bg-gray-200" />
                                <span className="text-sm text-gray-400">{rest.length}개</span>
                            </div>
                        )}
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                            {(featured ? rest.slice(2) : rest).map((p) => (
                                <PostCard key={p.id} post={p} />
                            ))}
                        </div>
                    </div>
                )}

                {/* 태그 클라우드 */}
                {!loading && allTags.length > 0 && (
                    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
                        <div className="flex items-center gap-2 mb-4">
                            <Tag size={15} className="text-gray-400" />
                            <h3 className="text-sm font-semibold text-gray-700">태그</h3>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            {allTags.map((tag) => (
                                <button key={tag}
                                    onClick={() => { setTagFilter(tag); setKeyword(''); setCategory('') }}
                                    className={`text-sm px-3.5 py-1.5 rounded-full border transition-colors
                                        ${tagFilter === tag
                                            ? 'bg-blue-600 text-white border-blue-600'
                                            : 'bg-white text-gray-500 border-gray-200 hover:border-blue-300 hover:text-blue-600'
                                        }`}>
                                    #{tag}
                                </button>
                            ))}
                            {(tagFilter || keyword) && (
                                <button onClick={() => { setTagFilter(''); setKeyword('') }}
                                    className="text-sm px-3.5 py-1.5 rounded-full bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors flex items-center gap-1">
                                    <Heart size={11} /> 전체 보기
                                </button>
                            )}
                        </div>
                    </div>
                )}

                {/* 푸터 */}
                <footer className="text-center py-8 border-t border-gray-100">
                    <p className="text-sm text-gray-400">© 2026 기빵 블로그</p>
                    <Link href="/" className="inline-flex items-center gap-1.5 mt-2 text-sm text-gray-400 hover:text-gray-600 transition-colors">
                        <LayoutDashboard size={13} /> 대시보드로 돌아가기
                    </Link>
                </footer>
            </div>
        </div>
    )
}
