// 지도 렌더링용 (기존 OL 연동)
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

export function flattenItems(nodes: (LayerItem | LayerGroup)[]): LayerItem[] {
    return nodes.flatMap((n) => (isLayerGroup(n) ? flattenItems(n.children) : [n]))
}

// DB 기반 레이어 관리
export type DbLayerType = 'WMS' | 'WMTS' | 'TMS' | 'WFS' | 'MVT' | 'GEOJSON' | 'ARCGIS' | 'XYZ'
export type DbLayerSourceType = 'OPENAPI' | 'GEOSERVER' | 'GEOWEBCACHE' | 'XYZ' | 'STATIC'

export interface DbLayer {
    id: number
    name: string
    type: DbLayerType
    sourceType: DbLayerSourceType
    url: string
    layerName: string | null
    styleName: string | null
    styleConfig: string | null
    format: string | null
    projection: string | null
    minZoom: number | null
    maxZoom: number | null
    opacity: number
    visible: boolean
    sortOrder: number
    groupId: number | null
    groupName: string | null
    description: string | null
    createdAt: string
    updatedAt: string
}

export interface DbLayerFormState {
    name: string
    type: DbLayerType
    sourceType: DbLayerSourceType
    url: string
    layerName: string
    styleName: string
    styleConfig: string
    format: string
    projection: string
    minZoom: string
    maxZoom: string
    opacity: number
    visible: boolean
    sortOrder: number
    groupName: string
    description: string
}

export const LAYER_TYPE_OPTIONS: { value: DbLayerType; label: string }[] = [
    { value: 'WMS',     label: 'WMS' },
    { value: 'WMTS',    label: 'WMTS' },
    { value: 'TMS',     label: 'TMS' },
    { value: 'WFS',     label: 'WFS' },
    { value: 'MVT',     label: 'MVT (벡터 타일)' },
    { value: 'GEOJSON', label: 'GeoJSON' },
    { value: 'ARCGIS',  label: 'ArcGIS REST' },
    { value: 'XYZ',     label: 'XYZ' },
]

export const LAYER_SOURCE_OPTIONS: { value: DbLayerSourceType; label: string }[] = [
    { value: 'OPENAPI',     label: 'OpenAPI' },
    { value: 'GEOSERVER',   label: 'GeoServer' },
    { value: 'GEOWEBCACHE', label: 'GeoWebCache' },
    { value: 'XYZ',         label: 'XYZ' },
    { value: 'STATIC',      label: '정적 파일' },
]

export const EMPTY_LAYER_FORM: DbLayerFormState = {
    name: '', type: 'WMS', sourceType: 'GEOSERVER',
    url: '', layerName: '', styleName: '', styleConfig: '',
    format: 'image/png', projection: 'EPSG:3857',
    minZoom: '', maxZoom: '', opacity: 1, visible: true,
    sortOrder: 0, groupName: '', description: '',
}

// 트리 구조
export interface DbLayerGroup {
    id: number
    name: string
    parentId: number | null
    sortOrder: number
    children: DbLayerGroup[]
    layers: DbLayer[]
}

export interface LayerTreeResponse {
    groups: DbLayerGroup[]
    ungroupedLayers: DbLayer[]
}

// 드래그앤드롭용 flat 아이템
export type TreeNodeType = 'group' | 'layer'

export interface TreeNode {
    id: string           // "group-1" | "layer-1"
    type: TreeNodeType
    depth: number
    parentGroupId: number | null
    sortOrder: number
    groupData?: DbLayerGroup
    layerData?: DbLayer
}

// Permission 옵션
export const PERMISSION_OPTIONS = [
    { value: 'SUPER_ADMIN', label: '슈퍼관리자' },
    { value: 'MAP_ADMIN',   label: '지도관리자' },
    { value: 'VIEWER',      label: 'VIEWER (뷰어)' },
    { value: 'DEPT_A',      label: 'DEPT_A (부서A)' },
    { value: 'DEPT_B',      label: 'DEPT_B (부서B)' },
]
