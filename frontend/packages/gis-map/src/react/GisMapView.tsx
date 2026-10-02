'use client'

// 지도 div. children이 없으면 div 하나만 그린다(그 div가 곧 지도 target).
// children이 있으면 바깥 div(position: relative) 안에 지도 div와 children(지도 위에 absolute로 올리는 위젯)을 둔다.
import { useContext } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { GisMapContext } from './context'

export interface GisMapViewProps {
    className?: string
    style?: CSSProperties
    children?: ReactNode
}

const FILL_STYLE: CSSProperties = { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 }

function noopTarget(): void {}

export function GisMapView({ className, style, children }: GisMapViewProps) {
    const ctx = useContext(GisMapContext)
    const setTarget = ctx ? ctx.setTarget : noopTarget

    if (children == null) {
        return <div ref={setTarget} className={className} style={style} />
    }
    return (
        <div className={className} style={{ position: 'relative', ...style }}>
            <div ref={setTarget} style={FILL_STYLE} />
            {children}
        </div>
    )
}
