'use client'

// 위젯 공통 루트: class gm-root(위젯 CSS 변수 --gm-*와 최소 리셋의 기준) + 테마 주 색 CSS 변수.
// MapShell은 이것을 루트로 쓴다. 위젯(SearchBar·MapToolbar·LayerPanel 등)을 따로 조립할 때는 위젯들을 <MapRoot>로 감싼다
// (gm-root 밖에서는 --gm-* 변수가 풀리지 않아 색·크기가 빠진다). GisMapProvider 안에 두어야 엔진 테마를 읽는다.
import { useEffect, useMemo } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import type { GisMapAppearance } from '../../core'
import { useGisMap, useGisMapSplit } from '../../react'
import { cx } from '../cx'
import { primaryThemeVars } from './themeVars'

export interface MapRootProps {
    className?: string
    style?: CSSProperties
    /** 화면 밝기 모드. 'light'(또는 안 줌)면 속성을 붙이지 않아 지금 화면과 같다. 'dark'·'system'이면 data-gm-theme을 달고 분할 칸을 포함한 엔진 전부에 setAppearance */
    theme?: GisMapAppearance
    children?: ReactNode
}

export default function MapRoot({ className, style, theme, children }: MapRootProps) {
    // 엔진 테마(config.theme.primary). 엔진 생성 전(SSR·첫 렌더)에는 CSS 기본값을 쓴다
    const primary = useGisMap()?.theme.primary
    const themeStyle = useMemo(() => primaryThemeVars(primary), [primary])
    const merged = useMemo(
        () => (themeStyle && style ? { ...themeStyle, ...style } : themeStyle ?? style),
        [themeStyle, style],
    )
    // 테마를 주면 엔진이 직접 그리는 DOM에도 알린다(분할이면 칸마다 엔진이 있다). 안 주면 config.appearance를 건드리지 않는다
    const split = useGisMapSplit()
    const map = useGisMap()
    const engines = split && split.available ? split.panes : null
    useEffect(() => {
        if (theme === undefined) return
        if (engines) engines.forEach(m => m?.setAppearance(theme))
        else map?.setAppearance(theme)
    }, [theme, engines, map])

    return <div className={cx('gm-root', className)} style={merged} data-gm-theme={theme === 'dark' || theme === 'system' ? theme : undefined}>{children}</div>
}
