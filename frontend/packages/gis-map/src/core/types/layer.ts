// 레이어 트리 타입. 필드는 짝 백엔드 레이어 트리 API(api/layers/tree) JSON과 1:1이라 응답을 그대로 받는다.

export type LayerKind = 'WMS' | 'WMTS' | 'TMS' | 'WFS' | 'MVT' | 'GEOJSON' | 'ARCGIS' | 'XYZ'
export type LayerSourceKind = 'OPENAPI' | 'GEOSERVER' | 'GEOWEBCACHE' | 'XYZ' | 'STATIC'

export interface LayerDef {
    id: number
    name: string
    type: LayerKind
    sourceType: LayerSourceKind
    /** '{VWORLD_KEY}' 치환자 허용 */
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

export interface LayerGroupDef {
    id: number
    name: string
    parentId: number | null
    sortOrder: number
    children: LayerGroupDef[]
    layers: LayerDef[]
}

export interface LayerTree {
    groups: LayerGroupDef[]
    ungroupedLayers: LayerDef[]
}

export type BasemapMode = 'normal' | 'satellite' | 'none'
