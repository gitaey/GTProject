// 나만의지도 타입. 짝 백엔드 나만의지도 API(api/mymap) 응답과 1:1
// 1단계(PNU 엑셀·보고서·샘플)에서 늘어난 필드는 전부 옵셔널이다 — 옛 서버(필드 없음)도 그대로 동작한다.

/** 업로드 종류(옛 서버는 sourceType만 준다) */
export type MyMapSourceKind = 'SHP' | 'EXCEL_COORD' | 'EXCEL_PNU' | 'EXCEL_ADDRESS'

/** 엑셀 매칭 방식. ADDRESS는 2단계에서 켜진다(화면은 PNU·COORD만 고르게 한다) */
export type MyMapUploadMode = 'PNU' | 'ADDRESS' | 'COORD'

/** 샘플 파일 종류 */
export type MyMapSampleKind = 'pnu' | 'address' | 'coord'

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
    /** 소유자 id(공유받은 레이어의 "보낸 사람" 표시용) */
    ownerId?: string | null
    sourceKind?: MyMapSourceKind | null
    /** 처리 중 진행률(행 단위) */
    progressTotal?: number
    progressDone?: number
    /** 업로드 결과 요약 — 매칭된 행·실패한 행 */
    matchedCount?: number
    failedCount?: number
    /** 매칭에 쓴 연속지적도 기준월 'YYYY-MM' */
    parcelVersion?: string | null
    /** 실패한 이유(상태 조회로 받은 값. 목록에는 없을 수 있다) */
    errorMessage?: string | null
}

export interface UserMapStatus {
    status: UserMapListItem['status']
    featureCount: number
    errorMessage?: string | null
    /** 끝났을 때 알려 주면 목록을 다시 받지 않아도 "지적도 YYYY-MM"이 나온다(없으면 목록을 다시 받을 때) */
    parcelVersion?: string | null
    geomType?: string | null
    progressTotal?: number
    progressDone?: number
    matchedCount?: number
    failedCount?: number
}

/** 행 한도(모드별) */
export interface MyMapLimits {
    pnu: number
    address: number
    coord: number
}

/** 컬럼 추천. mode가 null이면 값 모양으로 판단하지 못했다 */
export interface ExcelSuggestions {
    mode: MyMapUploadMode | null
    pnuColumn?: string | null
    addressColumn?: string | null
    latColumn?: string | null
    lonColumn?: string | null
    /** 'EPSG:4326'처럼 좌표계 선택지 값과 같은 글자 */
    sourceSrid?: string | null
}

export interface ExcelPreviewWarning {
    /** NUMERIC_PNU_CELLS | DUPLICATE_FILE | OVER_LIMIT … (모르는 코드도 message만 보여준다) */
    code: string
    message: string
}

export interface ExcelPreviewResponse {
    uploadId: string
    headers: string[]
    sampleRows: string[][]
    /** 머리글을 뺀 전체 데이터 행 수 */
    totalRows?: number
    /** 없으면 옛 서버 → 좌표 모드 하나뿐인 옛 흐름으로 동작한다 */
    suggestions?: ExcelSuggestions
    limits?: MyMapLimits
    warnings?: ExcelPreviewWarning[]
}

export interface ShpUploadInput {
    files: File[]
    name: string
    sourceSrid: string
}

export interface ExcelConfirmInput {
    uploadId: string
    name: string
    description?: string
    /** 없으면 COORD(옛 서버·옛 호출) */
    mode?: MyMapUploadMode
    pnuColumn?: string
    addressColumn?: string
    /** COORD일 때 */
    latColumn?: string
    lonColumn?: string
    sourceSrid?: string
}

/** 엑셀 확정 응답. parcelVersion은 PNU 모드의 "예정" 기준월(확정값은 끝난 뒤 상태·목록) */
export interface MyMapConfirmResult {
    id: number
    name?: string
    status?: string
    parcelVersion?: string | null
}

export interface UserMapShare {
    userIds: string[]
    roleCodes: string[]
}

/**
 * 지금 PNU 매칭에 실제로 쓸 수 있는 범위. 새 서버는 `nationwide`를 함께 준다 — 그때 `sidoCodes`는 "적재된 시도"(지역 제한이 있으면 그 교집합)이고,
 * `nationwide` 필드가 없는 옛 서버에서는 `sidoCodes`가 "지역 제한 설정값"(비어 있으면 제한 없음 = 전국)이다.
 */
export interface MyMapCoverage {
    sidoCodes: string[]
    /** 'YYYY-MM'(sidoCodes 중 가장 이른 기준월). 아직 적재 전이면 null */
    parcelVersion: string | null
    /** 시도별 기준월(sidoCodes와 같은 순서) */
    loaded?: Array<{ sido: string; version: string | null }>
    /** 전국 기준 시도(서버 설정, 기본 현행 16개)가 전부 적재됐고 지역 제한이 없을 때만 true. **빈 sidoCodes는 전국이 아니다**(자료 준비 중) */
    nationwide?: boolean
    /** 지역 제한 설정값(비어 있으면 제한 없음) */
    restrictedSidoCodes?: string[]
}

/** 한도·적재 범위 조회(GET quota) */
export interface MyMapQuota {
    ownedLayers: number
    maxLayers: number
    maxRows: MyMapLimits
    maxShpFeatures: number
    maxExcelMb: number
    maxShpMb: number
    coverage: MyMapCoverage
}

export interface MyMapImportReportRow {
    /** 엑셀 행 번호(머리글 = 1) */
    rowNo: number
    reason: string
    message: string
    input: string | null
    candidates: string[] | null
}

export interface MyMapImportReportQuery {
    page?: number
    size?: number
    /** 이 사유 코드의 행만 */
    reason?: string
}

export interface MyMapImportReport {
    /** 같은 PNU가 여러 행이라 피처가 중복으로 올라간 수(0이면 없음). 옛 서버는 없음 */
    duplicatePnuCount?: number
    total: number
    matched: number
    failed: number
    byReason: Record<string, number>
    rows: MyMapImportReportRow[]
    page: number
    size: number
    /** 필터를 적용한 실패 행 전체 수(페이지 계산용) */
    totalRows: number
}
