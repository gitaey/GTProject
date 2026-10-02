// 나만의지도 타입. 짝 백엔드 나만의지도 API(api/mymap) 응답과 1:1

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

export interface UserMapStatus {
    status: UserMapListItem['status']
    featureCount: number
}

export interface ExcelPreviewResponse {
    uploadId: string
    headers: string[]
    sampleRows: string[][]
}

export interface ShpUploadInput {
    files: File[]
    name: string
    sourceSrid: string
}

export interface ExcelConfirmInput {
    uploadId: string
    name: string
    latColumn: string
    lonColumn: string
    sourceSrid: string
}

export interface UserMapShare {
    userIds: string[]
    roleCodes: string[]
}
