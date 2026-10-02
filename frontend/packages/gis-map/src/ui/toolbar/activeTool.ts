'use client'

// 툴바(MapToolbar)와 그리기 패널(DrawPanel)이 함께 쓰는 활성 도구 연결 — FE-5b-2에서 옛 MapToolbar.tsx에서 떼어 냈다(본문 그대로)
import { useCallback } from 'react'
import { useGisMap, useStoreValue } from '../../react'
import type { MapTool, ToolState } from '../../core'

// ── 유틸 ──────────────────────────────────────────────────────────────────────

export function isDrawMode(tool: MapTool) { return tool.startsWith('draw-') }
export function isSelectMode(tool: MapTool) { return tool === 'select' || tool === 'edit' }

// ── 엔진 스토어 연결 ──────────────────────────────────────────────────────────

const selectActiveTool = (s: ToolState): MapTool => s.activeTool

/** 활성 도구 = 엔진 map.tools(유일한 원천). 엔진 생성 전 첫 렌더는 'none'. 같은 도구를 다시 누르면 해제(토글) */
export function useActiveTool(): [MapTool, (tool: MapTool) => void] {
    const gis = useGisMap()
    const activeTool = useStoreValue(gis?.tools.store, selectActiveTool, 'none')
    const setActiveTool = useCallback((tool: MapTool) => {
        gis?.tools.activate(tool)
    }, [gis])
    return [activeTool, setActiveTool]
}
