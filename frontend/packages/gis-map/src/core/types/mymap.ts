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

// ── 3단계: 스타일(styleConfig v1) ──────────────────────────────────────────────
// 서버는 styleConfig를 문자열(JSON 객체, 16KB 이하)로만 저장한다 — 내용 해석은 이 패키지(core/lib/mymapStyleConfig.ts)가 한다.
// 없거나 v1이 아니거나 깨졌으면 옛 고정 스타일 그대로(하위 호환).

/** 표시 방식: 면(필지 그대로) | 점(폴리곤의 안쪽 대표점) */
export type MyMapDisplay = 'polygon' | 'point'

export interface MyMapStyleClass {
    /** 속성값(문자열로 비교) */
    value: string
    color: string
}

/** 값별(범주) 색 나누기 — 최대 12개 + 기타 */
export interface MyMapCategorizedStyle {
    type: 'categorical'
    field: string
    classes: MyMapStyleClass[]
    otherColor: string
}

export type MyMapBreakMethod = 'quantile' | 'equal' | 'manual'

/**
 * 구간별(숫자) 색 나누기 — 3~7구간. `breaks`는 안쪽 경계값(오름차순, colors.length - 1개):
 * 값 < breaks[0] → colors[0], breaks[i-1] ≤ 값 < breaks[i] → colors[i], 값 ≥ 마지막 경계 → 마지막 색
 */
export interface MyMapGraduatedStyle {
    type: 'graduated'
    field: string
    method: MyMapBreakMethod
    breaks: number[]
    colors: string[]
    /** 숫자로 읽을 수 없는 값의 색("값 없음") */
    otherColor: string
}

export type MyMapClassify = MyMapCategorizedStyle | MyMapGraduatedStyle

export interface MyMapLabelStyle {
    field: string
    /** px */
    size: number
    color: string
    /** 글자 바깥 후광(외곽선) 색 */
    halo: string
    /** 이 확대 단계 이상에서만 그린다(피처가 많으면 더 높게 올려 막는다) */
    minZoom: number
}

export interface MyMapPopupStyle {
    /** 클릭하면 보일 컬럼(0~30개). 빈 배열 = 이 레이어는 팝업 끔. popup 자체가 null이면 기본(앞 5개 컬럼) */
    fields: string[]
}

export interface MyMapStyleConfig {
    v: 1
    display: MyMapDisplay
    fill: string
    /** 0~1 */
    fillOpacity: number
    stroke: string
    /** 0이면 선 없음 */
    strokeWidth: number
    pointRadius: number
    /** null = 선 색을 따른다(옛 모양, 저장 JSON에 키 없음) */
    pointColor: string | null
    /** 점 테두리 색·두께 — 기본값(흰색·1px)이면 저장 JSON에 넣지 않는다 */
    pointStroke: string
    pointStrokeWidth: number
    classify: MyMapClassify | null
    label: MyMapLabelStyle | null
    popup: MyMapPopupStyle | null
}

/** 불러온 피처로 센 컬럼 요약(스타일 대화상자용) */
export interface MyMapColumnInfo {
    name: string
    /** 값의 90% 이상이 숫자로 읽히면 number(앞이 0인 코드·15자리 넘는 숫자는 글자로 본다) */
    kind: 'number' | 'text'
    /** 값이 있는 피처 수 */
    filled: number
    /** 서로 다른 값 수(많으면 상한에서 멈춘다 — distinctCapped) */
    distinct: number
    distinctCapped: boolean
    /** 숫자 모양이지만 크기가 ±1e15 이상이라 숫자로 안 읽은 값의 수(있을 때만) */
    tooLarge?: number
    sample: string[]
    min?: number
    max?: number
}

/** 나만의지도 부분 수정 입력(PATCH). 빠진 키는 그대로, styleConfig ''는 지움 */
export interface MyMapUpdateInput {
    name?: string
    description?: string
    styleConfig?: string
}
