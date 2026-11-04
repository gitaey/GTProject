'use client'

import { useEffect, useState } from 'react'
import type { Category } from '@/types/post'
import { CATEGORY_OPTIONS } from '@/types/post'
import { fetchCategories } from './api'

/** API가 실패했을 때 쓰는 고정 카테고리(코드에 박힌 3개) */
export const FALLBACK_CATEGORIES: Category[] = CATEGORY_OPTIONS.map((c, i) => ({
    code: c.value, label: c.label, sortOrder: i + 1,
}))

/** 글의 현재 카테고리가 목록에 없으면 맨 앞에 끼워 넣는다(select가 첫 항목으로 바뀌어 저장되는 사고 방지) */
export function withCurrentCategory(categories: Category[], code: string, label: string): Category[] {
    if (!code || categories.some((c) => c.code === code)) return categories
    return [{ code, label: label || code, sortOrder: 0 }, ...categories]
}

export interface UseCategoriesOptions {
    /** false인 동안은 부르지 않는다(수정 모달을 처음 열 때 true로). 기본 true */
    enabled?: boolean
    /** true면 실패했을 때 FALLBACK_CATEGORIES를 돌려준다. 기본 false(목록 탭은 빈 채로) */
    fallback?: boolean
}

export interface UseCategoriesResult {
    categories: Category[]
    status: 'idle' | 'loading' | 'ready' | 'error'
}

export function useCategories({ enabled = true, fallback = false }: UseCategoriesOptions = {}): UseCategoriesResult {
    const [loaded, setLoaded] = useState<Category[]>([])
    const [status, setStatus] = useState<UseCategoriesResult['status']>('idle')

    useEffect(() => {
        if (!enabled) return
        let cancelled = false
        setStatus('loading')
        fetchCategories()
            .then((list) => { if (!cancelled) { setLoaded(list); setStatus('ready') } })
            .catch(() => { if (!cancelled) setStatus('error') })
        return () => { cancelled = true }
    }, [enabled])

    const categories = status === 'error' && fallback ? FALLBACK_CATEGORIES : loaded
    return { categories, status }
}
