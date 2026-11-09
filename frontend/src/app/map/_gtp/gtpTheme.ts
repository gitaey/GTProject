'use client'

// GTProject /map 화면 테마(라이트·다크·시스템) 선택의 기억 — 지도 패키지 밖(앱 전용, 이식하지 않는다).
// 대시보드 테마(next-themes `.dark`, app/globals.css)와 별도로 저장한다(결정 D3): localStorage `gtp-map-theme`.
// 첫 렌더는 항상 'light'(서버 렌더 HTML과 같게 — 하이드레이션 불일치 방지), useLayoutEffect에서 저장값을 읽어 페인트 전에 바꾼다.
import { useCallback, useLayoutEffect, useState } from 'react'
import type { GisMapAppearance } from '@gtp/gis-map/core'

const STORAGE_KEY = 'gtp-map-theme'

function isAppearance(value: unknown): value is GisMapAppearance {
    return value === 'light' || value === 'dark' || value === 'system'
}

function readStored(): GisMapAppearance {
    try {
        const raw = localStorage.getItem(STORAGE_KEY)
        return isAppearance(raw) ? raw : 'light'
    } catch {
        return 'light'
    }
}

/** [현재 테마, 바꾸기]. 바꾸면 저장한다(저장 실패 — 사생활 보호 모드 등 — 는 그 탭에서만 바뀐다) */
export function useGtpMapTheme(): readonly [GisMapAppearance, (value: GisMapAppearance) => void] {
    const [theme, setThemeState] = useState<GisMapAppearance>('light')

    useLayoutEffect(() => {
        setThemeState(readStored())
    }, [])

    const setTheme = useCallback((value: GisMapAppearance) => {
        setThemeState(value)
        try {
            localStorage.setItem(STORAGE_KEY, value)
        } catch {
            // 저장 못 해도 이번 화면은 바뀐다
        }
    }, [])

    return [theme, setTheme] as const
}
