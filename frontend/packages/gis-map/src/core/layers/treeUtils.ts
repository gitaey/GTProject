// 레이어 트리 순수 함수(옛 stores/map/layerStore.ts의 도우미를 그대로 옮김). 상태·부수효과 없음.
import type { LayerDef, LayerGroupDef, LayerTree } from '../types/layer'

/** 그룹(과 하위 그룹)의 잎 레이어를 순서대로 모은다: 그룹의 레이어 → 하위 그룹(재귀) */
export function flattenGroupLayers(groups: LayerGroupDef[]): LayerDef[] {
    return groups.flatMap(g => [...g.layers, ...flattenGroupLayers(g.children)])
}

/** 트리의 모든 잎 레이어: 그룹 레이어(재귀) → 미분류 레이어. OL 레이어도 이 순서로 붙인다 */
export function allTreeLayers(tree: LayerTree): LayerDef[] {
    return [...flattenGroupLayers(tree.groups), ...tree.ungroupedLayers]
}

/** 지정한 id의 레이어만 남긴다. 레이어도 하위 그룹도 없게 된 그룹은 뺀다(개인 레이어 설정 필터) */
export function filterTreeByIds(tree: LayerTree, ids: Set<number>): LayerTree {
    function filterGroups(groups: LayerGroupDef[]): LayerGroupDef[] {
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

/** 체크박스 기준 표시 여부: 사용자가 바꾼 값이 있으면 그것, 없으면 레이어 기본값 */
export function getLayerVisible(visibleMap: Record<number, boolean>, layer: LayerDef): boolean {
    return layer.id in visibleMap ? visibleMap[layer.id] : layer.visible
}

/** 투명도: 사용자가 바꾼 값이 있으면 그것, 없으면 레이어 기본값 */
export function getLayerOpacity(opacityMap: Record<number, number>, layer: LayerDef): number {
    return layer.id in opacityMap ? opacityMap[layer.id] : layer.opacity
}
