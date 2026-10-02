// 레이어 관리 화면(/map-admin/layer) 전용 타입·상수. 지도 패키지의 레이어 타입을 옛 이름(Db*)으로 그대로 쓴다.
// (옛 components/map/types/layer.ts의 관리 화면용 부분. 지도 렌더링에 쓰던 미사용 타입 LayerItem/LayerGroup/LayerType/isLayerGroup/flattenItems는 삭제)
import type { LayerDef, LayerGroupDef, LayerKind, LayerSourceKind, LayerTree } from '@gtp/gis-map/core'

export type DbLayerType = LayerKind
export type DbLayerSourceType = LayerSourceKind
export type DbLayer = LayerDef
export type DbLayerGroup = LayerGroupDef
export type LayerTreeResponse = LayerTree

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
