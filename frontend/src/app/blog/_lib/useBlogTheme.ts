'use client'

import { useCallback, useLayoutEffect, useState } from 'react'

export type BlogThemePref = 'system' | 'light' | 'dark'

export const BLOG_THEME_KEY = 'gtp-blog-theme'

export interface UseBlogThemeResult {
    pref: BlogThemePref
    resolved: 'light' | 'dark'
    setPref: (pref: BlogThemePref) => void
    mounted: boolean
}

function readPref(): BlogThemePref {
    try {
        const value = localStorage.getItem(BLOG_THEME_KEY)
        return value === 'light' || value === 'dark' ? value : 'system'
    } catch {
        return 'system'
    }
}

/* 시스템이면 속성을 지워 CSS의 prefers-color-scheme이 정하게 한다 */
function applyPref(pref: BlogThemePref): void {
    const el = document.documentElement
    if (pref === 'system') el.removeAttribute('data-blog-theme')
    else el.setAttribute('data-blog-theme', pref)
}

export function useBlogTheme(): UseBlogThemeResult {
    const [pref, setPrefState] = useState<BlogThemePref>('system')
    const [systemDark, setSystemDark] = useState(false)
    const [mounted, setMounted] = useState(false)

    /* useLayoutEffect: 클라이언트 이동으로 블로그에 들어올 때(인라인 script가 안 도는 경우)도 그리기 전에 맞춘다 */
    useLayoutEffect(() => {
        const stored = readPref()
        setPrefState(stored)
        applyPref(stored)
        const mq = window.matchMedia('(prefers-color-scheme: dark)')
        setSystemDark(mq.matches)
        const onChange = (e: MediaQueryListEvent) => setSystemDark(e.matches)
        mq.addEventListener('change', onChange)
        setMounted(true)
        return () => mq.removeEventListener('change', onChange)
    }, [])

    const setPref = useCallback((next: BlogThemePref) => {
        try {
            if (next === 'system') localStorage.removeItem(BLOG_THEME_KEY)
            else localStorage.setItem(BLOG_THEME_KEY, next)
        } catch {
            /* 사생활 보호 모드 — 저장만 못 하고 이번 화면에는 적용한다 */
        }
        applyPref(next)
        setPrefState(next)
    }, [])

    const resolved: 'light' | 'dark' = pref === 'system' ? (systemDark ? 'dark' : 'light') : pref
    return { pref, resolved, setPref, mounted }
}
