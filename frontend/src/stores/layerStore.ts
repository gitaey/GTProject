// 레이어 트리의 상태(보임/숨김/투명도)를 전역으로 관리하는 Store
import { create } from 'zustand'
import { LayerItem, LayerGroup, flattenItems } from '@/types/layer'

// Store 인터페이스: 상태와 액션(함수)의 구조 정의
interface LayerStore {
    tree: LayerGroup[]
    toggleLayer: (id: string) => void
    toggleGroup: (groupId: string) => void
    setOpacity: (id: string, opacity: number) => void
}

// 트리를 재귀 순회하며 특정 id의 LeafItem만 updater 함수로 수정
// { ...node, children: ... } = 스프레드 연산자: 원본 복사 후 일부만 변경
// React는 상태를 직접 수정하지 않고 새 객체를 만들어야 변경을 감지함 (jQuery와 다른 점)
function updateItem(
    nodes: (LayerItem | LayerGroup)[],
    id: string,
    updater: (item: LayerItem) => LayerItem,
): (LayerItem | LayerGroup)[] {
    return nodes.map((node) => {
        if ('children' in node) {
            return { ...node, children: updateItem(node.children, id, updater) }  // 그룹이면 재귀
        }
        return node.id === id ? updater(node) : node  // 아이템이면 id 비교 후 수정
    })
}

// 트리에서 특정 id의 LayerGroup을 찾아 반환 (없으면 null)
function findGroup(nodes: (LayerItem | LayerGroup)[], id: string): LayerGroup | null {
    for (const node of nodes) {
        if ('children' in node) {
            if (node.id === id) return node
            const found = findGroup(node.children, id)  // 재귀 탐색
            if (found) return found
        }
    }
    return null
}

// 특정 그룹의 모든 하위 항목 visible을 재귀로 변경
function setGroupVisible(
    nodes: (LayerItem | LayerGroup)[],
    groupId: string,
    visible: boolean,
): (LayerItem | LayerGroup)[] {
    return nodes.map((node) => {
        if (!('children' in node)) return node  // LeafItem이면 그대로
        if (node.id === groupId) {
            return {
                ...node,
                children: setAllVisible(node.children, visible),  // 해당 그룹 하위 전체 변경
            }
        }
        return { ...node, children: setGroupVisible(node.children, groupId, visible) }  // 재귀
    })
}

// 하위 전체 visible 변경
function setAllVisible(nodes: (LayerItem | LayerGroup)[], visible: boolean): (LayerItem | LayerGroup)[] {
    return nodes.map((node) => {
        if ('children' in node) {
            return { ...node, children: setAllVisible(node.children, visible) }  // 그룹이면 재귀
        }
        return { ...node, visible }  // LeafItem이면 visible 변경
    })
}

export const useLayerStore = create<LayerStore>((set, get) => ({
    // 레이어 트리 초기 데이터 (layer.ts에서 정의한 LayerGroup/LayerItem 구조 그대로)
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

    // 개별 레이어 토글: updateItem으로 해당 id의 visible만 반전
    toggleLayer: (id) =>
        set((s) => ({
            tree: s.tree.map((g) => ({
                ...g,
                children: updateItem(g.children, id, (item) => ({ ...item, visible: !item.visible })),
            })),
        })),

    // 그룹 토글: 하위 아이템이 전부 보이면 전부 숨김, 하나라도 숨겨져 있으면 전부 보임
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

    // 투명도 변경: updateItem으로 해당 id의 opacity만 변경
    setOpacity: (id, opacity) =>
        set((s) => ({
            tree: s.tree.map((g) => ({ ...g, children: updateItem(g.children, id, (item) => ({ ...item, opacity })) })),
        })),
}))
