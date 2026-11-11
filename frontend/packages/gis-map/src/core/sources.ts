// 데이터 소스 계약. 코어·UI는 이 인터페이스만 안다. 실제 구현(REST·프록시)은 adapters/에 있다.
// 소스가 없으면 그 기능은 조용히 꺼진다(예: 폐쇄망에서 VWorld 소스를 빼면 검색·필지 강조가 꺼짐).
import type { GisMapHost } from './host'
import type { HttpClient } from './http'
import type { GeoJsonObject } from './types/geojson'
import type { GeoTiffItem, GeoTiffStatus } from './types/geotiff'
import type { LayerDef, LayerTree } from './types/layer'
import type {
    ExcelConfirmInput, ExcelPreviewResponse, MyMapConfirmResult, MyMapConvertInput, MyMapConvertResult, MyMapExportOptions, MyMapExportResult,
    MyMapImportReport, MyMapImportReportQuery, MyMapQuota, MyMapSampleKind, MyMapUpdateInput, ShpUploadInput, UserMapListItem, UserMapShare, UserMapStatus,
} from './types/mymap'
import type { AddressSearchItem, VWorldLegendItem } from './types/search'
import type { AreaAnalysisColumn } from './areaAnalysis/types'
import type { WindField, WindFrameMeta, WindScalarField } from './types/wind'
import type { StartViewSource } from './startView/types'

export interface LayerUserSelectionSource {
    /** 선택 가능한 전체 범위(권한 트리) */
    loadSelectable(): Promise<LayerTree>
    /** 저장된 개인 선택. null = 개인 설정 없음(전체 사용) */
    get(): Promise<number[] | null>
    save(layerIds: number[]): Promise<void>
    reset(): Promise<void>
}

export interface LayerTreeSource {
    /** 지도에 그릴 최종 트리(권한·개인 설정 반영 완료본) */
    loadTree(): Promise<LayerTree>
    /** 개인 레이어 설정(선택). 없으면 레이어 패널의 설정 버튼을 숨긴다 */
    userSelection?: LayerUserSelectionSource
}

// ── 공유(자원 공통): 공유 상대 디렉터리 + 자원별 공유 저장소. 공유받은 쪽은 보기만 한다(권한 등급 없음) ──
export interface ShareUser {
    userId: string
    name: string | null
    /** 소속 표시(예: 세부권한 이름). 없으면 null */
    groupLabel?: string | null
}

/** 공유할 수 있는 그룹. 역할은 `code`만, 세부권한은 `역할:세부` 코드에 `parentCode`(소속 역할)가 붙는다 */
export interface ShareGroup {
    code: string
    label: string
    parentCode?: string | null
}

/** 공유 상대 디렉터리(자원 공통). 없으면 공유 화면은 아이디·코드 직접 입력으로 열린다 */
export interface ShareDirectorySource {
    /** 이름·아이디로 사용자 찾기(2글자 이상만 부른다). 404·405 상태의 `GisHttpError`를 던지면 화면이 직접 입력으로 바꾼다 */
    searchUsers(query: string, opts?: { limit?: number }): Promise<ShareUser[]>
    listGroups(): Promise<ShareGroup[]>
}

export type ShareEntryState = 'ACTIVE' | 'INACTIVE' | 'MISSING'

export interface ShareSnapshot {
    users: Array<{ userId: string; name: string | null; state: ShareEntryState }>
    roles: Array<{ code: string; label: string | null; state: ShareEntryState }>
}

export interface ShareChange {
    userIds: string[]
    roleCodes: string[]
}

/** 일괄 공유는 더하기/빼기만 있다(덮어쓰기 없음) */
export type BulkShareMode = 'ADD' | 'REMOVE'

export interface BulkShareResult {
    succeededIds: number[]
    failed: Array<{ id: number; reason: 'NOT_AVAILABLE' | 'LIMIT_EXCEEDED' }>
}

/** 자원 한 종류(나만의지도, 이후 TIFF 등)의 공유 저장소 */
export interface ShareTargetSource {
    get(id: number): Promise<ShareSnapshot>
    /** 통째로 바꾸기 */
    set(id: number, change: ShareChange): Promise<void>
    /** 여러 개의 현재 공유(일괄 빼기 화면용). 없으면 빼기 화면이 직접 입력으로 열린다 */
    getMany?(ids: number[]): Promise<Array<ShareSnapshot & { id: number }>>
    /** 일괄 더하기/빼기. 없으면 일괄 공유 단추가 나오지 않는다 */
    bulk?(ids: number[], mode: BulkShareMode, change: ShareChange): Promise<BulkShareResult>
}

export interface MyMapSource {
    list(): Promise<UserMapListItem[]>
    status(id: number): Promise<UserMapStatus>
    /** EPSG:4326 FeatureCollection */
    geojson(id: number): Promise<GeoJsonObject>
    remove(id: number): Promise<void>
    /** 새 서버는 { id, name, status }를 돌려준다(처리는 비동기). 옛 서버·옛 소스는 아무것도 안 돌려줘도 된다 — 돌려주면 패널이 목록 비교 없이 id로 "방금 올린 레이어"를 잡는다 */
    uploadShp?(input: ShpUploadInput): Promise<void | MyMapConfirmResult>
    previewExcel?(file: File): Promise<ExcelPreviewResponse>
    /** 새 서버는 { id, parcelVersion? }을 돌려준다(처리는 비동기 — 목록 폴링으로 진행률). 옛 서버·옛 소스는 아무것도 안 돌려줘도 된다 */
    confirmExcel?(input: ExcelConfirmInput): Promise<void | MyMapConfirmResult>
    /** 옛 공유 입출력(아이디·코드만). `shareTarget`이 없을 때만 쓴다 — 공유 화면이 `legacyShareTarget`으로 감싸 단일 모드로 연다 */
    getShare?(id: number): Promise<UserMapShare>
    setShare?(id: number, share: UserMapShare): Promise<void>
    /** 공유 저장소(이름·상태가 붙은 현재 공유, 일괄 더하기/빼기). 있으면 `getShare/setShare`보다 먼저 쓴다 */
    shareTarget?: ShareTargetSource
    // ── 1단계(PNU 엑셀·보고서·샘플). 전부 옵셔널 — 없으면 그 화면 요소가 조용히 빠진다 ──
    /** 내 레이어 수·한도·행 한도·지적도 기준월. 없으면 "내 레이어 n/20"과 한도 안내가 안 나온다 */
    quota?(): Promise<MyMapQuota>
    /** 샘플 엑셀 파일(바이트). 없으면 샘플 받기 링크가 안 나온다 */
    downloadSample?(kind: MyMapSampleKind): Promise<Blob>
    /** 업로드 결과 보고서(소유자만). 없으면 `매칭 N · 실패 M`이 글자로만 나온다 */
    importReport?(id: number, query?: MyMapImportReportQuery): Promise<MyMapImportReport>
    /** 실패 행 엑셀(원본 컬럼 + 실패 사유) */
    downloadImportFailures?(id: number): Promise<Blob>
    // ── 3단계(스타일·라벨·팝업) ──
    /** 부분 수정(PATCH, 등록자만 — 아니면 서버가 403으로 거절하고 message로 reject). 빠진 키는 그대로, styleConfig ''는 지움. 없으면 스타일 저장 단추가 안 나온다 */
    update?(id: number, patch: MyMapUpdateInput): Promise<void>
    // ── 주소 변환·내보내기 ──
    /** 엑셀의 주소를 PNU·표준 주소·좌표로 바꾼 결과 엑셀을 돌려준다(레이어를 만들지 않음, 서버에 저장 안 함). 없으면 업로드 마법사에 `엑셀로만 받기`가 안 나온다. 올린 파일이 없거나 만료(404)면 상태가 보이는 `GisHttpError(404)`로 reject하라 — 마법사가 파일 고르기로 되돌린다. 그 밖의 오류는 같은 uploadId로 다시 시도할 수 있어야 한다 */
    convertExcel?(input: MyMapConvertInput): Promise<MyMapConvertResult>
    /** 레이어를 엑셀·GeoJSON으로 내보낸다(소유자·공유받은 사람). `signal`이 abort되면 요청을 취소한다(대화상자를 닫을 때). 없으면 ⋯ 메뉴에 `내보내기…`가 안 나온다 */
    exportLayer?(id: number, opts: MyMapExportOptions, signal?: AbortSignal): Promise<MyMapExportResult>
}

export interface GeoTiffSource {
    list(): Promise<GeoTiffItem[]>
    status(id: number): Promise<GeoTiffStatus>
    /** XYZ 타일 URL 템플릿({z}/{x}/{y}). apiBaseUrl 결합은 여기서 */
    tileUrl(item: GeoTiffItem): string
    upload?(file: File): Promise<GeoTiffItem>
    remove?(id: number): Promise<void>
    reprocessBounds?(id: number): Promise<void>
}

export interface WindSource {
    /** 지금 시각의 프레임 하나. 데이터가 아직 없으면 null */
    latest(): Promise<WindField | null>
    /** 최신 발표(사이클)의 예보 프레임 목록(바람지도 패널용). 없으면 패널이 시간 조작 없이 latest()만 쓴다 */
    frames?(): Promise<WindFrameMeta[]>
    /** 프레임 하나의 바람장. 없으면 null */
    frame?(id: number): Promise<WindField | null>
    /** 스칼라 변수 한 장(기온·습도·강수량 — 프레임 메타의 fields[변수] id). 없으면 색상 오버레이 선택지에 풍속만 나온다. 없는 id는 null */
    field?(fieldId: number): Promise<WindScalarField | null>
}

export interface AddressSearchSource {
    search(query: string, size: number): Promise<AddressSearchItem[]>
}

export interface ParcelSource {
    /** 해당 지점 필지 폴리곤(EPSG:4326 GeoJSON Feature 배열). 없으면 [] */
    featuresAt(lon: number, lat: number): Promise<GeoJsonObject[]>
    /**
     * 필지 정보 카드용: 그 지점 필지 1건의 속성·경계(없으면 null). `featuresAt`와 달리 오류를 삼키지 않는다 — 키·한도·네트워크 오류는
     * throw(메시지는 화면에 그대로). `signal`이 abort되면 요청을 취소한다. 없으면 "필지 정보" 도구 단추가 나오지 않는다
     */
    infoAt?(lon: number, lat: number, signal?: AbortSignal): Promise<ParcelInfo | null>
}

/** 필지 한 곳의 속성(소스가 정규화한 값 — 코어·위젯은 VWorld 열 이름을 모른다) */
export interface ParcelInfo {
    /** 19자리 */
    pnu: string
    /** 지번 주소(소스 원문, 예 VWorld addr) */
    address: string | null
    /** "708", "산 12-3" (지목 글자를 뗀 지번) */
    lotNumber: string | null
    /** PNU 11번째 자리 = 2 */
    mountain: boolean
    /** 지목 약어 한 글자("대"). 정식 명칭은 `jimokName()` */
    jimok: string | null
    /** 공시지가(원/㎡) */
    officialPrice: number | null
    priceYear: string | null
    priceMonth: string | null
    /** 필지 경계 GeoJSON Feature(EPSG:4326). 없으면 강조·면적을 생략한다 */
    geometry: GeoJsonObject | null
}

export interface ParcelBuilding {
    /** 건물관리번호 */
    id: string
    name: string | null
    detailName: string | null
    sggName: string | null
}

export interface ParcelAddressGroup {
    roadAddress: string
    underground: boolean
    zipCode: string | null
    name: string | null
    apartment: boolean
    /** MAIN = 대표지번이 이 필지, RELATED = 관련지번으로만 걸림 */
    relation: 'MAIN' | 'RELATED'
    buildings: ParcelBuilding[]
}

export interface ParcelBuildingsResult {
    pnu: string
    /** 건물DB 적재 기준월("2026-09") */
    referenceVersion: string | null
    /** 이 필지에 걸린 건물 전체 수(돌려준 수와 다를 수 있다) */
    buildingCount: number
    /** 돌려준 건물 수 < buildingCount */
    truncated: boolean
    /** 관련지번으로도 찾았나 */
    relatedIncluded: boolean
    addresses: ParcelAddressGroup[]
}

export interface ParcelBuildingSource {
    /**
     * PNU로 그 필지의 건물 목록. 상태가 보이는 `GisHttpError`로 reject: 403 로그인 필요, 404 서버가 이 기능을 모름, 503 자료 준비 중.
     * `limit`은 1~1000. `signal`이 abort되면 요청을 취소한다
     */
    byPnu(pnu: string, opts?: { limit?: number; signal?: AbortSignal }): Promise<ParcelBuildingsResult>
}

export interface RegionNameSource {
    /** 표시용 지역 이름(번지 제거 완료). 없으면 null */
    nameAt(lon: number, lat: number): Promise<string | null>
}

export interface LegendSource {
    vworldLegend?(layerName: string): Promise<VWorldLegendItem[]>
    /** 이미지 범례 URL(GeoServer GetLegendGraphic 등). 없으면 null */
    imageUrl?(layer: LayerDef): string | null
}

export interface WfsSource {
    getFeatureUrl(typeName: string, extent: number[], srsCode: string): string
}

// ── 영역 분석(원격 질의): GeoServer WFS·VWorld Data API 등 "영역에 걸친 피처"를 서버가 걸러 주는 소스 ──
export interface AreaQueryLayerInfo {
    /** false = 질의 못 함(사유는 reason). 'unknown' = 아직 모름(첫 질의 결과로 판정) */
    queryable: boolean | 'unknown'
    /** queryable=false 사유(화면에 그대로) */
    reason?: string
    /** 알려진 열(화면 이름·합계 숨김·파생 열). 없으면 받은 피처의 속성 이름을 그대로 쓴다 */
    columns?: AreaAnalysisColumn[]
    /** 범주표 기본 열(없으면 코어가 값 분포로 고른다) */
    defaultCategory?: string | null
    /** `count`로 걸친 건수를 미리 알 수 있나(GeoServer hits). false면 1쪽 응답의 total을 쓴다 */
    supportsCount?: boolean
}

export interface AreaQueryPage {
    /** GeoJSON Feature(EPSG:4326, 경도·위도 순) */
    features: GeoJsonObject[]
    /** 영역에 걸친 전체 건수(알면) */
    total: number | null
    hasMore: boolean
}

/** 이 레이어는 질의할 수 없다(Data API에 없음·허용 목록 밖 등) — 코어가 그 레이어를 회색으로 바꾸고 캐시한다 */
export class AreaQueryUnsupportedError extends Error {
    constructor(message: string) {
        super(message)
        this.name = 'AreaQueryUnsupportedError'
    }
}

export interface AreaQuerySource {
    /** 이 트리 레이어(쉼표로 묶인 VWorld 이름이면 part)를 질의할 수 있나. 코어가 캐시한다(레이어당 1번) */
    describe(layer: LayerDef, part: string | undefined, signal?: AbortSignal): Promise<AreaQueryLayerInfo>
    /** 영역(바깥 링 하나, EPSG:4326 [경도, 위도])에 걸친 건수만(가능할 때). 못 하면 null */
    count?(layer: LayerDef, part: string | undefined, ring4326: number[][], signal?: AbortSignal): Promise<number | null>
    /** 영역에 걸친 피처 한 쪽(page는 1부터, 쪽 크기는 어댑터가 정한다). 안 되는 레이어면 `AreaQueryUnsupportedError` */
    query(layer: LayerDef, part: string | undefined, ring4326: number[][], page: number, signal?: AbortSignal): Promise<AreaQueryPage>
}

export interface GisMapSources {
    layerTree?: LayerTreeSource
    myMap?: MyMapSource
    geoTiff?: GeoTiffSource
    wind?: WindSource
    addressSearch?: AddressSearchSource
    parcel?: ParcelSource
    /** 필지 정보 카드의 건물 칸(PNU → 건물 목록). 없으면 카드에 건물 칸이 없다 */
    parcelBuildings?: ParcelBuildingSource
    regionName?: RegionNameSource
    legend?: LegendSource
    wfs?: WfsSource
    /** 영역 분석(원격 질의). 없으면 영역 분석 패널은 "분석할 수 있는 레이어가 없습니다"만 보인다 */
    areaQuery?: AreaQuerySource
    /** 공유 상대 검색·그룹 목록(자원 공통). 없으면 공유 화면이 아이디·코드 직접 입력 */
    shareDirectory?: ShareDirectorySource
    /** 시작 화면 저장소(계정 저장 restStartView·브라우저 저장 browserStartViewSource). 없으면 설정 패널의 시작 화면 카드가 없다 */
    startView?: StartViewSource
    /** 데이터 기준 정보(건물DB 기준월·지적도 적재·바람 예보 발표). 없고 호스트가 정적 항목도 안 주면 설정 패널의 카드가 없다 */
    dataInfo?: DataInfoSource
}

/** 데이터 기준 정보 한 항목 */
export interface GisDataInfoItem {
    id: string
    label: string
    source: string | null
    /** 기준 버전(예 '2026-09', '11-09 09시'). 모르면 null */
    version: string | null
    /** 가장 늦은 기준(여러 지역이 섞일 때). 없으면 version과 같다 */
    latestVersion?: string | null
    /** 기준일(YYYY-MM-DD) */
    baseDate: string | null
    /** 적재 일시(ISO-8601) */
    loadedAt: string | null
    updateCycle: string | null
    status: 'ready' | 'updating' | 'partial' | 'missing' | 'unavailable'
    /** 오래됨 판정(서버·어댑터가 정한다) */
    stale: boolean
    staleNote?: string | null
    coverage?: { loaded: number; expected: number; nationwide: boolean } | null
    note?: string | null
}

export interface DataInfoSource {
    /**
     * 항목 목록. 일부 묶음이 실패해도 나머지는 돌려준다(실패한 묶음은 status 'unavailable' 항목이거나 생략).
     * 상태가 보이는 GisHttpError로 reject: 401·403 로그인 만료. 404를 받은 묶음은 어댑터가 항목을 생략한다
     */
    list(signal?: AbortSignal): Promise<GisDataInfoItem[]>
}

/** 소스 팩토리가 받는 문맥. host()는 호출 시점의 호스트를 돌려주므로 주소·헤더를 소스에 따로 넘기지 않는다 */
export interface SourceContext {
    host(): GisMapHost
    http: HttpClient
}

export type GisMapSourcesFactory = (ctx: SourceContext) => Partial<GisMapSources>

/** 객체, 팩토리, 또는 그 배열(왼쪽 → 오른쪽 병합, 뒤가 이김) */
export type GisMapSourcesInput =
    | Partial<GisMapSources>
    | GisMapSourcesFactory
    | Array<Partial<GisMapSources> | GisMapSourcesFactory>

export function resolveSources(input: GisMapSourcesInput | undefined, ctx: SourceContext): GisMapSources {
    const list = input == null ? [] : Array.isArray(input) ? input : [input]
    const out: Record<string, unknown> = {}
    for (const item of list) {
        const part = typeof item === 'function' ? item(ctx) : item
        for (const key of Object.keys(part) as Array<keyof GisMapSources>) {
            if (part[key] !== undefined) out[key] = part[key]
        }
    }
    return Object.freeze(out) as GisMapSources
}
