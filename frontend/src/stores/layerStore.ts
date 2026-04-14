import { create } from 'zustand'
import { LayerItem, LayerGroup, flattenItems } from '@/types/layer'

interface LayerStore {
    tree: LayerGroup[]
    toggleLayer: (id: string) => void
    toggleGroup: (groupId: string) => void
    setOpacity: (id: string, opacity: number) => void
}

function updateItem(
    nodes: (LayerItem | LayerGroup)[],
    id: string,
    updater: (item: LayerItem) => LayerItem,
): (LayerItem | LayerGroup)[] {
    return nodes.map((node) => {
        if ('children' in node) {
            return { ...node, children: updateItem(node.children, id, updater) }
        }
        return node.id === id ? updater(node) : node
    })
}

function findGroup(nodes: (LayerItem | LayerGroup)[], id: string): LayerGroup | null {
    for (const node of nodes) {
        if ('children' in node) {
            if (node.id === id) return node
            const found = findGroup(node.children, id)
            if (found) return found
        }
    }
    return null
}

function setGroupVisible(
    nodes: (LayerItem | LayerGroup)[],
    groupId: string,
    visible: boolean,
): (LayerItem | LayerGroup)[] {
    return nodes.map((node) => {
        if (!('children' in node)) return node
        if (node.id === groupId) {
            // 해당 그룹의 모든 하위 항목 재귀로 visible 변경
            return {
                ...node,
                children: setAllVisible(node.children, visible),
            }
        }
        return { ...node, children: setGroupVisible(node.children, groupId, visible) }
    })
}

// 하위 전체 visible 변경
function setAllVisible(nodes: (LayerItem | LayerGroup)[], visible: boolean): (LayerItem | LayerGroup)[] {
    return nodes.map((node) => {
        if ('children' in node) {
            return { ...node, children: setAllVisible(node.children, visible) }
        }
        return { ...node, visible }
    })
}

export const useLayerStore = create<LayerStore>((set, get) => ({
    tree: [
        {
            id: 'group-base',
            name: '배경지도',
            children: [
                { id: 'base-normal', name: '일반지도', type: 'wmts-base', visible: true, opacity: 1 },
                { id: 'base-satellite', name: '위성지도', type: 'wmts-base', visible: false, opacity: 1 },
                { id: 'base-hybrid', name: '하이브리드', type: 'wmts-base', visible: false, opacity: 1 },
            ],
        },
        {
            id: 'group-default',
            name: '기본도',
            children: [
                {
                    id: 'group-admin',
                    name: '행정경계',
                    children: [
                        { id: 'lt_c_adsido', name: '시도', type: 'wms', visible: false, opacity: 1 },
                        { id: 'lt_c_adsigg', name: '시군구', type: 'wms', visible: false, opacity: 1 },
                        { id: 'lt_c_ademd', name: '읍면동', type: 'wms', visible: false, opacity: 1 },
                        { id: 'lt_c_adri', name: '리', type: 'wms', visible: false, opacity: 1 },
                    ],
                },
                {
                    id: 'lp_pa_cbnd_bonbun,lp_pa_cbnd_bubun',
                    name: '연속지적도',
                    type: 'wms',
                    visible: false,
                    opacity: 1,
                    wmsLayers: 'lp_pa_cbnd_bonbun,lp_pa_cbnd_bubun',
                    wmsStyles: 'lp_pa_cbnd_bonbun_line,lp_pa_cbnd_bubun_line',
                },
            ],
        },
    ],
    toggleLayer: (id) =>
        set((s) => ({
            tree: s.tree.map((g) => ({
                ...g,
                children: updateItem(g.children, id, (item) => ({ ...item, visible: !item.visible })),
            })),
        })),
    toggleGroup: (groupId) =>
        set((s) => {
            const allNodes: (LayerItem | LayerGroup)[] = [...s.tree, ...s.tree.flatMap((g) => g.children)]
            const group = findGroup(allNodes, groupId)
            if (!group) return s
            const items = flattenItems(group.children)
            const allVisible = items.length > 0 && items.every((i) => i.visible)
            return {
                tree: s.tree.map((g) => {
                    if (g.id === groupId) {
                        return { ...g, children: setAllVisible(g.children, !allVisible) }
                    }
                    return { ...g, children: setGroupVisible(g.children, groupId, !allVisible) }
                }),
            }
        }),
    setOpacity: (id, opacity) =>
        set((s) => ({
            tree: s.tree.map((g) => ({ ...g, children: updateItem(g.children, id, (item) => ({ ...item, opacity })) })),
        })),
}))
