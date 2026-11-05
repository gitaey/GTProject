'use client'

// 칸 하나: 지도를 붙일 div + 칸 위에 올릴 위젯. 지도를 만들지 않는다(엔진은 Provider가 소유 — 칸 DOM이 다시 마운트돼도 지도는 산다).
// 칸을 누르면(pointerdown, 캡처 단계 — 지도 조작은 막지 않는다) 그 지도가 활성 지도가 된다.
// children 안에서 useGisMap() = 이 칸의 지도, useGisMapPaneIndex() = 칸 번호.
import { useCallback, useContext } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { GisMapContext } from '../context'
import { GisMapPaneIndexContext, GisMapSplitContext, GisMapSplitPanesContext } from './context'

export interface GisMapPaneProps {
    /** 0 = 바깥 Provider의 지도, 1~3 = 분할 Provider가 만든 지도 */
    index: number
    className?: string
    style?: CSSProperties
    /** 칸 위에 올릴 위젯(이 안에서 useGisMap() = 이 칸의 지도) */
    children?: ReactNode
}

const FILL_STYLE: CSSProperties = { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 }

function noopTarget(): void {}

export function GisMapPane({ index, className, style, children }: GisMapPaneProps) {
    const split = useContext(GisMapSplitContext)
    const panes = useContext(GisMapSplitPanesContext)
    const outer = useContext(GisMapContext)
    // 분할 Provider 밖이면 0번 칸 = 가장 가까운 Provider의 지도(GisMapView와 같다)
    const value = panes ? (panes.panes[index] ?? null) : index === 0 ? outer : null

    const setActive = split?.setActive
    const onPointerDownCapture = useCallback(() => setActive?.(index), [setActive, index])

    return (
        <div
            className={className}
            style={{ position: 'relative', ...style }}
            onPointerDownCapture={split ? onPointerDownCapture : undefined}
        >
            <div ref={value ? value.setTarget : noopTarget} style={FILL_STYLE} />
            <GisMapContext.Provider value={value}>
                <GisMapPaneIndexContext.Provider value={index}>{children}</GisMapPaneIndexContext.Provider>
            </GisMapContext.Provider>
        </div>
    )
}
