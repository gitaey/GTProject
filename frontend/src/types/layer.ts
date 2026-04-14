export type LayerType = 'wmts-base' | 'wms'

export interface LayerItem {
    id: string
    name: string
    type: LayerType
    visible: boolean
    opacity: number
    legend?: string
    wmsLayers?: string
    wmsStyles?: string
}

export interface LayerGroup {
    id: string
    name: string
    children: (LayerItem | LayerGroup)[]
}

export function isLayerGroup(node: LayerItem | LayerGroup): node is LayerGroup {
    return 'children' in node
}

// 그룹 내 모든 LayerItem 추출
export function flattenItems(nodes: (LayerItem | LayerGroup)[]): LayerItem[] {
    return nodes.flatMap((n) => (isLayerGroup(n) ? flattenItems(n.children) : [n]))
}
