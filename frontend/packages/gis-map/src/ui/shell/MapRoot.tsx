'use client'

// 위젯 공통 루트: class gm-root(위젯 CSS 변수 --gm-*와 최소 리셋의 기준) + 테마 주 색 CSS 변수.
// MapShell은 이것을 루트로 쓴다. 위젯(SearchBar·MapToolbar·LayerPanel 등)을 따로 조립할 때는 위젯들을 <MapRoot>로 감싼다
// (gm-root 밖에서는 --gm-* 변수가 풀리지 않아 색·크기가 빠진다). GisMapProvider 안에 두어야 엔진 테마를 읽는다.
import { useMemo } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { useGisMap } from '../../react'
import { cx } from '../cx'
import { primaryThemeVars } from './themeVars'

export interface MapRootProps {
    className?: string
    style?: CSSProperties
    children?: ReactNode
}

export default function MapRoot({ className, style, children }: MapRootProps) {
    // 엔진 테마(config.theme.primary). 엔진 생성 전(SSR·첫 렌더)에는 CSS 기본값을 쓴다
    const primary = useGisMap()?.theme.primary
    const themeStyle = useMemo(() => primaryThemeVars(primary), [primary])
    const merged = useMemo(
        () => (themeStyle && style ? { ...themeStyle, ...style } : themeStyle ?? style),
        [themeStyle, style],
    )
    return <div className={cx('gm-root', className)} style={merged}>{children}</div>
}
