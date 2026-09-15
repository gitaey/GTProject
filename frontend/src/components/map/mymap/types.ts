// 나만의지도 기능 전용 타입. 이 mymap/ 디렉토리는 다른 프로젝트로 옮겨도
// 그대로 재사용할 수 있도록 다른 지도 기능(레이어 트리 등)에 의존하지 않는다.
export interface UserMapListItem {
    id: number
    name: string
    description?: string | null
    sourceType: 'SHP' | 'EXCEL'
    geomType?: string | null
    status: 'PROCESSING' | 'READY' | 'FAILED'
    visible: boolean
    featureCount: number
    owner: boolean
    styleConfig?: string | null
    createdAt: string
}

export interface ExcelPreviewResponse {
    uploadId: string
    headers: string[]
    sampleRows: string[][]
}

export const SRID_OPTIONS = [
    { value: 'EPSG:5186', label: 'EPSG:5186 (중부원점, 기본)' },
    { value: 'EPSG:4326', label: 'EPSG:4326 (WGS84 경위도)' },
    { value: 'EPSG:5179', label: 'EPSG:5179 (UTM-K)' },
    { value: 'EPSG:3857', label: 'EPSG:3857 (Web Mercator)' },
]
