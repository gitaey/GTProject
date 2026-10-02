// @types/geojson 의존 없이 쓰는 최소 GeoJSON 타입

export interface GeoJsonObject {
    type: string
    [key: string]: unknown
}
