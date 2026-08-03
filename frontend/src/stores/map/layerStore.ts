import { create } from 'zustand'
import { DbLayer, DbLayerGroup, LayerTreeResponse } from '@/types/layer'

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8080'

export function flattenGroupLayers(groups: DbLayerGroup[]): DbLayer[] {
    return groups.flatMap(g => [...g.layers, ...flattenGroupLayers(g.children)])
}

export function getLayerVisible(visibleMap: Record<number, boolean>, layer: DbLayer): boolean {
    return layer.id in visibleMap ? visibleMap[layer.id] : layer.visible
}

export function getLayerOpacity(opacityMap: Record<number, number>, layer: DbLayer): number {
    return layer.id in opacityMap ? opacityMap[layer.id] : layer.opacity
}

interface LayerStore {
    tree: LayerTreeResponse | null
    loading: boolean
    visibleMap: Record<number, boolean>
    opacityMap: Record<number, number>
    loadTree: () => Promise<void>
    toggleLayer: (layerId: number) => void
    toggleGroup: (group: DbLayerGroup) => void
    setOpacity: (layerId: number, opacity: number) => void
}

export const useLayerStore = create<LayerStore>((set, get) => ({
    tree: null,
    loading: false,
    visibleMap: {},
    opacityMap: {},

    loadTree: async () => {
        set({ loading: true })
        try {
            const res = await fetch(`${API}/api/layers/tree`)
            const json = await res.json()
            set({ tree: json.data, loading: false })
        } catch {
            set({ loading: false })
        }
    },

    toggleLayer: (layerId) => set(s => {
        const allLayers = s.tree
            ? [...flattenGroupLayers(s.tree.groups), ...s.tree.ungroupedLayers]
            : []
        const layer = allLayers.find(l => l.id === layerId)
        if (!layer) return s
        const current = getLayerVisible(s.visibleMap, layer)
        return { visibleMap: { ...s.visibleMap, [layerId]: !current } }
    }),

    toggleGroup: (group) => set(s => {
        const layers = [...group.layers, ...flattenGroupLayers(group.children)]
        const allVisible = layers.length > 0 && layers.every(l => getLayerVisible(s.visibleMap, l))
        const updates: Record<number, boolean> = {}
        for (const l of layers) updates[l.id] = !allVisible
        return { visibleMap: { ...s.visibleMap, ...updates } }
    }),

    setOpacity: (layerId, opacity) => set(s => ({
        opacityMap: { ...s.opacityMap, [layerId]: opacity }
    })),
}))
