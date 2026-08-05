// 그리기 도구 스타일 상태 및 텍스트 인풋 오버레이 상태 관리
import { create } from 'zustand'

export interface DrawStyle {
    color: string        // hex 색상
    strokeWidth: number  // 1~8px
    fillOpacity: number  // 0~100%
    pointSize: number    // 4~20px (포인트 전용)
    fontSize: number     // 10~24px (텍스트 전용)
}

export const DEFAULT_DRAW_STYLE: DrawStyle = {
    color: '#F26722',
    strokeWidth: 2,
    fillOpacity: 30,
    pointSize: 8,
    fontSize: 14,
}

export const PRESET_COLORS = [
    '#F26722', // 오렌지 (브랜드)
    '#ef4444', // 빨강
    '#3b82f6', // 파랑
    '#22c55e', // 초록
    '#a855f7', // 보라
    '#eab308', // 노랑
    '#1f2937', // 검정
    '#ffffff', // 흰색
]

interface TextInputState {
    x: number
    y: number
    onSubmit: (text: string) => void
}

interface DrawStore {
    drawStyle: DrawStyle
    setDrawStyle: (patch: Partial<DrawStyle>) => void

    // 텍스트 인풋 오버레이
    textInput: TextInputState | null
    showTextInput: (x: number, y: number, onSubmit: (text: string) => void) => void
    hideTextInput: () => void

    // 선택된 피처 삭제 콜백 (useDrawing이 등록)
    selectedCount: number
    setSelectedCount: (n: number) => void
    selectedPixel: [number, number] | null
    setSelectedPixel: (px: [number, number] | null) => void
    deleteSelectedFn: (() => void) | null
    registerDeleteSelected: (fn: () => void) => void
}

export const useDrawStore = create<DrawStore>((set) => ({
    drawStyle: DEFAULT_DRAW_STYLE,
    setDrawStyle: (patch) => set((s) => ({ drawStyle: { ...s.drawStyle, ...patch } })),

    textInput: null,
    showTextInput: (x, y, onSubmit) => set({ textInput: { x, y, onSubmit } }),
    hideTextInput: () => set({ textInput: null }),

    selectedCount: 0,
    setSelectedCount: (n) => set({ selectedCount: n }),
    selectedPixel: null,
    setSelectedPixel: (px) => set({ selectedPixel: px }),
    deleteSelectedFn: null,
    registerDeleteSelected: (fn) => set({ deleteSelectedFn: fn }),
}))
