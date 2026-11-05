'use client'

import { useContext } from 'react'
import { GisMapPaneIndexContext, GisMapSplitContext } from './context'
import type { GisMapSplitState } from './context'

/** 가장 가까운 GisMapSplitProvider 상태. 밖이면 null. 객체는 값이 바뀔 때만 새로 만들어진다 */
export function useGisMapSplit(): GisMapSplitState | null {
    return useContext(GisMapSplitContext)
}

/** GisMapPane 안이면 그 칸 번호, 밖이면 null */
export function useGisMapPaneIndex(): number | null {
    return useContext(GisMapPaneIndexContext)
}
