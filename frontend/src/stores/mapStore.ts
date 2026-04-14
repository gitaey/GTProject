import { create } from 'zustand'

export type MapTool =
    | 'none'
    | 'draw-point'
    | 'draw-line'
    | 'draw-polygon'
    | 'measure-distance'
    | 'measure-area'
    | 'clear-map'

type ClearListener = () => void

const clearListeners: Set<ClearListener> = new Set()

export const onClear = (fn: ClearListener) => {
    clearListeners.add(fn)
    return () => clearListeners.delete(fn)
}

interface MapStore {
    activeTool: MapTool
    setActiveTool: (tool: MapTool) => void
    clearAll: () => void
}

export const useMapStore = create<MapStore>((set) => ({
    activeTool: 'none',
    setActiveTool: (tool) =>
        set((state) => ({
            activeTool: state.activeTool === tool ? 'none' : tool, // 같은 툴 누르면 해제
        })),
    clearAll: () => {
        set({ activeTool: 'none' })
        clearListeners.forEach((fn) => fn())
    },
}))
