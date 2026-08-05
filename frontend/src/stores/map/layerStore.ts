import { create } from 'zustand'
import { DbLayer, DbLayerGroup, LayerTreeResponse } from '@/types/layer'
import { getToken } from '@/stores/authStore'

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8080'

function getCurrentRole(): string | null {
    try {
        const raw = localStorage.getItem('gtp-auth')
        if (!raw) return null
        return JSON.parse(raw)?.state?.user?.role ?? null
    } catch { return null }
}

function filterTreeByIds(tree: LayerTreeResponse, ids: Set<number>): LayerTreeResponse {
    function filterGroups(groups: DbLayerGroup[]): DbLayerGroup[] {
        return groups.flatMap(g => {
            const filteredChildren = filterGroups(g.children)
            const filteredLayers = g.layers.filter(l => ids.has(l.id))
            if (filteredLayers.length === 0 && filteredChildren.length === 0) return []
            return [{ ...g, layers: filteredLayers, children: filteredChildren }]
        })
    }
    return {
        groups: filterGroups(tree.groups),
        ungroupedLayers: tree.ungroupedLayers.filter(l => ids.has(l.id)),
    }
}

export function flattenGroupLayers(groups: DbLayerGroup[]): DbLayer[] {
    return groups.flatMap(g => [...g.layers, ...flattenGroupLayers(g.children)])
}

export function getLayerVisible(visibleMap: Record<number, boolean>, layer: DbLayer): boolean {
    return layer.id in visibleMap ? visibleMap[layer.id] : layer.visible
}

export function getLayerOpacity(opacityMap: Record<number, number>, layer: DbLayer): number {
    return layer.id in opacityMap ? opacityMap[layer.id] : layer.opacity
}

const EXPANDED_STORAGE_KEY = 'layer-group-expanded'

function loadExpandedMap(): Record<number, boolean> {
    try {
        const raw = localStorage.getItem(EXPANDED_STORAGE_KEY)
        return raw ? JSON.parse(raw) : {}
    } catch { return {} }
}

function saveExpandedMap(map: Record<number, boolean>) {
    try { localStorage.setItem(EXPANDED_STORAGE_KEY, JSON.stringify(map)) } catch {}
}

export type BasemapMode = 'normal' | 'satellite' | 'none'

const BASEMAP_LAYER_NAMES: Record<BasemapMode, string[]> = {
    normal:    ['Base'],
    satellite: ['Satellite', 'Hybrid'],
    none:      [],
}

export function getBasemapVisibility(layer: DbLayer, mode: BasemapMode): boolean | null {
    if (layer.type !== 'XYZ') return null
    const allBasenames = Object.values(BASEMAP_LAYER_NAMES).flat()
    if (!allBasenames.includes(layer.layerName ?? '')) return null
    return BASEMAP_LAYER_NAMES[mode].includes(layer.layerName ?? '')
}

interface LayerStore {
    tree: LayerTreeResponse | null
    loading: boolean
    visibleMap: Record<number, boolean>
    opacityMap: Record<number, number>
    expandedMap: Record<number, boolean>
    basemapMode: BasemapMode
    loadTree: () => Promise<void>
    toggleLayer: (layerId: number) => void
    toggleGroup: (group: DbLayerGroup) => void
    setOpacity: (layerId: number, opacity: number) => void
    toggleExpanded: (groupId: number, defaultExpanded?: boolean) => void
    isExpanded: (groupId: number) => boolean
    setBasemapMode: (mode: BasemapMode) => void
    enableLayerByName: (name: string) => void
}

export const useLayerStore = create<LayerStore>((set, get) => ({
    tree: null,
    loading: false,
    visibleMap: {},
    opacityMap: {},
    expandedMap: typeof window !== 'undefined' ? loadExpandedMap() : {},
    basemapMode: 'normal',

    loadTree: async () => {
        set({ loading: true })
        try {
            const role = getCurrentRole()
            const token = getToken()
            const authHeaders = token ? { Authorization: `Bearer ${token}` } : {}

            // 1) user-access 커스텀 설정 확인
            let treeUrl = role
                ? `${API}/api/layers/tree/permission/${role}`
                : `${API}/api/layers/tree`

            if (token) {
                const uaRes = await fetch(`${API}/api/layers/user-access`, { headers: authHeaders })
                if (uaRes.ok) {
                    const uaJson = await uaRes.json()
                    const userLayerIds: number[] | null = uaJson.data
                    if (userLayerIds !== null) {
                        // user-access 설정이 있으면 role-tree를 가져와서 프론트에서 필터
                        const treeRes = await fetch(treeUrl, { headers: authHeaders })
                        const treeJson = await treeRes.json()
                        const filtered = filterTreeByIds(treeJson.data, new Set(userLayerIds))
                        set({ tree: filtered, loading: false })
                        return
                    }
                }
            }

            // 2) 폴백: role 기반 permission 트리
            const res = await fetch(treeUrl, { headers: authHeaders })
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
        const newVisibleMap = { ...s.visibleMap, [layerId]: !current }

        // basemap 레이어인 경우 basemapMode도 역방향 동기화
        const allBasenames = Object.values(BASEMAP_LAYER_NAMES).flat()
        if (layer.type === 'XYZ' && allBasenames.includes(layer.layerName ?? '')) {
            const getV = (name: string) => {
                const l = allLayers.find(x => x.layerName === name && x.type === 'XYZ')
                if (!l) return false
                return l.id in newVisibleMap ? newVisibleMap[l.id] : l.visible
            }
            const baseOn = getV('Base')
            const satOn  = getV('Satellite')
            const hybOn  = getV('Hybrid')
            let newMode: BasemapMode = 'none'
            if (baseOn && !satOn && !hybOn) newMode = 'normal'
            else if (!baseOn && satOn && hybOn) newMode = 'satellite'
            return { visibleMap: newVisibleMap, basemapMode: newMode }
        }

        return { visibleMap: newVisibleMap }
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

    toggleExpanded: (groupId, defaultExpanded = true) => set(s => {
        const current = groupId in s.expandedMap ? s.expandedMap[groupId] : defaultExpanded
        const next = { ...s.expandedMap, [groupId]: !current }
        saveExpandedMap(next)
        return { expandedMap: next }
    }),

    isExpanded: (groupId) => {
        const { expandedMap } = get()
        return groupId in expandedMap ? expandedMap[groupId] : true
    },

    setBasemapMode: (mode) => set(s => {
        const allLayers = s.tree
            ? [...flattenGroupLayers(s.tree.groups), ...s.tree.ungroupedLayers]
            : []
        const updates: Record<number, boolean> = {}
        for (const layer of allLayers) {
            const override = getBasemapVisibility(layer, mode)
            if (override !== null) updates[layer.id] = override
        }
        return { basemapMode: mode, visibleMap: { ...s.visibleMap, ...updates } }
    }),

    enableLayerByName: (name) => set(s => {
        const allLayers = s.tree
            ? [...flattenGroupLayers(s.tree.groups), ...s.tree.ungroupedLayers]
            : []
        const layer = allLayers.find(l => l.name === name)
        if (!layer) return s
        const already = getLayerVisible(s.visibleMap, layer)
        if (already) return s
        return { visibleMap: { ...s.visibleMap, [layer.id]: true } }
    }),
}))
