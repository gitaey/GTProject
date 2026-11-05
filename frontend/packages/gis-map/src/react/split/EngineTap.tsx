'use client'

// 분할 Provider가 보조 지도를 소유하기 위한 비공개 조각: 중첩 GisMapProvider(DOM 없음)의 엔진·setTarget을 위로 알린다.
import { useContext, useEffect } from 'react'
import { GisMapContext } from '../context'
import type { GisMapContextValue } from '../context'

export interface EngineTapProps {
    index: number
    /** value = 등록, null = 해제(value는 해제하려는 쪽이 방금 등록한 것 — 다른 쪽이 새로 등록했다면 건드리지 않게) */
    onEngine: (index: number, value: GisMapContextValue | null, registered?: GisMapContextValue) => void
}

export function EngineTap({ index, onEngine }: EngineTapProps) {
    const ctx = useContext(GisMapContext)
    useEffect(() => {
        if (!ctx) return
        onEngine(index, ctx)
        return () => onEngine(index, null, ctx)
    }, [index, ctx, onEngine])
    return null
}
