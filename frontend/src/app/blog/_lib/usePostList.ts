'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Category, Post, PostCategoryCode } from '@/types/post'
import { fetchPosts } from './api'
import { useCategories } from './useCategories'

export interface UsePostListResult {
    categories: Category[]
    posts: Post[]
    totalElements: number
    /** loading = 보여줄 글이 없는 채로 부르는 중(스켈레톤), error = 글이 없는데 실패, ready = 그 밖 */
    status: 'loading' | 'ready' | 'error'
    /** 기존 목록을 둔 채 다시 부르는 중 */
    refreshing: boolean
    /** 기존 목록이 있는 채로 다시 부르기에 실패(목록 위에 한 줄 알림) */
    refreshFailed: boolean
    category: PostCategoryCode | ''
    keyword: string
    tagFilter: string
    selectCategory: (code: PostCategoryCode | '') => void
    changeKeyword: (value: string) => void
    selectTag: (tag: string) => void
    resetFilters: () => void
    reload: () => void
    hasMore: boolean
    loadingMore: boolean
    loadMoreFailed: boolean
    loadMore: () => void
    isFiltered: boolean
    featured: Post | undefined
    rest: Post[]
    allTags: string[]
    countOf: (code: PostCategoryCode | '') => number
}

export function usePostList(): UsePostListResult {
    const { categories } = useCategories()

    const [category, setCategory] = useState<PostCategoryCode | ''>('')
    const [keyword, setKeyword] = useState('')
    const [tagFilter, setTagFilter] = useState('')
    const [reloadKey, setReloadKey] = useState(0)

    const [posts, setPosts] = useState<Post[]>([])
    const [firstPageCount, setFirstPageCount] = useState(0)
    const [totalElements, setTotalElements] = useState(0)
    const [loadedPage, setLoadedPage] = useState(0)
    const [totalPages, setTotalPages] = useState(0)
    const [loading, setLoading] = useState(true)
    const [failed, setFailed] = useState(false)
    const [loadingMore, setLoadingMore] = useState(false)
    const [loadMoreFailed, setLoadMoreFailed] = useState(false)
    const moreAbortRef = useRef<AbortController | null>(null)

    /* 첫 페이지: 필터가 바뀌거나 reload 때마다 처음부터 다시 */
    useEffect(() => {
        moreAbortRef.current?.abort()
        const controller = new AbortController()
        setLoading(true)
        setFailed(false)
        setLoadingMore(false)
        setLoadMoreFailed(false)
        fetchPosts({ category, keyword, tagFilter }, 0, controller.signal)
            .then((res) => {
                if (controller.signal.aborted) return
                setPosts(res.content)
                setFirstPageCount(res.content.length)
                setTotalElements(res.totalElements)
                setLoadedPage(res.number)
                setTotalPages(res.totalPages)
                setLoading(false)
            })
            .catch((e: unknown) => {
                if (controller.signal.aborted || (e instanceof Error && e.name === 'AbortError')) return
                console.error(e)
                setFailed(true)
                setLoading(false)
            })
        return () => controller.abort()
    }, [category, keyword, tagFilter, reloadKey])

    const hasMore = loadedPage + 1 < totalPages

    const loadMore = useCallback(() => {
        if (loading || loadingMore || !hasMore) return
        const controller = new AbortController()
        moreAbortRef.current = controller
        setLoadingMore(true)
        setLoadMoreFailed(false)
        fetchPosts({ category, keyword, tagFilter }, loadedPage + 1, controller.signal)
            .then((res) => {
                if (controller.signal.aborted) return
                /* 그 사이 새 글이 올라와 페이지가 밀리면 같은 글이 또 올 수 있다 — id로 걸러 중복 key를 막는다 */
                setPosts((prev) => {
                    const seen = new Set(prev.map((p) => p.id))
                    return [...prev, ...res.content.filter((p) => !seen.has(p.id))]
                })
                setLoadedPage(res.number)
                setTotalPages(res.totalPages)
                setTotalElements(res.totalElements)
                setLoadingMore(false)
            })
            .catch((e: unknown) => {
                if (controller.signal.aborted || (e instanceof Error && e.name === 'AbortError')) return
                console.error(e)
                setLoadMoreFailed(true)
                setLoadingMore(false)
            })
    }, [loading, loadingMore, hasMore, category, keyword, tagFilter, loadedPage])

    useEffect(() => () => moreAbortRef.current?.abort(), [])

    const selectCategory = useCallback((code: PostCategoryCode | '') => { setCategory(code); setTagFilter('') }, [])
    const changeKeyword  = useCallback((value: string) => { setKeyword(value); setTagFilter('') }, [])
    const selectTag      = useCallback((tag: string) => { setTagFilter(tag); setKeyword(''); setCategory('') }, [])
    const resetFilters   = useCallback(() => { setKeyword(''); setTagFilter('') }, [])
    const reload         = useCallback(() => setReloadKey((k) => k + 1), [])

    const isFiltered = !!(category || keyword || tagFilter)
    /* 추천 글은 첫 페이지에서만 고른다 — 더 보기로 글이 붙어도 대표 글이 바뀌지 않게 */
    const featured = useMemo(
        () => (isFiltered ? undefined : posts.slice(0, firstPageCount).find((p) => p.featured)),
        [isFiltered, posts, firstPageCount],
    )
    const rest = useMemo(() => (featured ? posts.filter((p) => p.id !== featured.id) : posts), [posts, featured])
    const allTags = useMemo(() => Array.from(new Set(posts.flatMap((p) => p.tags))), [posts])

    const countOf = useCallback(
        (code: PostCategoryCode | '') => (code === '' ? totalElements : posts.filter((p) => p.category === code).length),
        [totalElements, posts],
    )

    const hasPosts = posts.length > 0
    const status: UsePostListResult['status'] = hasPosts ? 'ready' : loading ? 'loading' : failed ? 'error' : 'ready'

    return {
        categories, posts, totalElements, status,
        refreshing: loading && hasPosts,
        refreshFailed: failed && !loading && hasPosts,
        category, keyword, tagFilter,
        selectCategory, changeKeyword, selectTag, resetFilters, reload,
        hasMore, loadingMore, loadMoreFailed, loadMore,
        isFiltered, featured, rest, allTags, countOf,
    }
}
