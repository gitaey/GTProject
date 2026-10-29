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
import type { WindField, WindFrameMeta, WindScalarField } from './types/wind'

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
    uploadShp?(input: ShpUploadInput): Promise<void>
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

export interface GisMapSources {
    layerTree?: LayerTreeSource
    myMap?: MyMapSource
    geoTiff?: GeoTiffSource
    wind?: WindSource
    addressSearch?: AddressSearchSource
    parcel?: ParcelSource
    regionName?: RegionNameSource
    legend?: LegendSource
    wfs?: WfsSource
    /** 공유 상대 검색·그룹 목록(자원 공통). 없으면 공유 화면이 아이디·코드 직접 입력 */
    shareDirectory?: ShareDirectorySource
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
