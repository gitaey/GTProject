// GeoTIFF 타입. 짝 백엔드 GeoTIFF API(api/geotiff) 응답과 1:1

export interface GeoTiffItem {
    id: number
    originalName: string
    /** 백엔드가 주는 상대 경로. 절대 URL 변환은 GeoTiffSource.tileUrl() */
    tileUrl: string
    uploadedAt: string
    fileSize: number
    /** 'PROCESSING' | 'READY' | 'FAILED' */
    status: string
    minLon?: number
    minLat?: number
    maxLon?: number
    maxLat?: number
}

export interface GeoTiffStatus {
    status: string
    tileUrl?: string | null
    minLon?: number
    minLat?: number
    maxLon?: number
    maxLat?: number
}
