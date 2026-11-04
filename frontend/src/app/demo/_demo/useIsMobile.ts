'use client'

// 모바일(768px 미만) 여부 — 투어 배치·패널 안내에 쓴다. 서버 렌더·matchMedia 없는 환경은 false.
import { useSyncExternalStore } from 'react'
import { MOBILE_QUERY, isMobileViewport } from './demoSources'

function subscribe(onChange: () => void): () => void {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return () => {}
    const mq = window.matchMedia(MOBILE_QUERY)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
}

const getServerSnapshot = (): boolean => false

export function useIsMobile(): boolean {
    return useSyncExternalStore(subscribe, isMobileViewport, getServerSnapshot)
}
