// 주소 검색·범례 타입

export interface AddressSearchItem {
    id: string
    title: string
    category: string
    address: { road: string; parcel: string }
    /** EPSG:4326 */
    point: { lon: number; lat: number }
}

export interface VWorldLegendItem {
    title: string
    fillColor: string
    fillOpacity: number
    strokeColor: string
    strokeOpacity: number
    patternUrl?: string
}
