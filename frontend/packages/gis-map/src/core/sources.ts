// 데이터 소스 계약. 코어·UI는 이 인터페이스만 안다. 실제 구현(REST·프록시)은 adapters/에 있다.
// 소스가 없으면 그 기능은 조용히 꺼진다(예: 폐쇄망에서 VWorld 소스를 빼면 검색·필지 강조가 꺼짐).
import type { GisMapHost } from './host'
import type { HttpClient } from './http'
import type { GeoJsonObject } from './types/geojson'
import type { GeoTiffItem, GeoTiffStatus } from './types/geotiff'
import type { LayerDef, LayerTree } from './types/layer'
import type {
    ExcelConfirmInput, ExcelPreviewResponse, MyMapConfirmResult, MyMapImportReport, MyMapImportReportQuery, MyMapQuota, MyMapSampleKind,
    ShpUploadInput, UserMapListItem, UserMapShare, UserMapStatus,
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
    getShare?(id: number): Promise<UserMapShare>
    setShare?(id: number, share: UserMapShare): Promise<void>
    // ── 1단계(PNU 엑셀·보고서·샘플). 전부 옵셔널 — 없으면 그 화면 요소가 조용히 빠진다 ──
    /** 내 레이어 수·한도·행 한도·지적도 기준월. 없으면 "내 레이어 n/20"과 한도 안내가 안 나온다 */
    quota?(): Promise<MyMapQuota>
    /** 샘플 엑셀 파일(바이트). 없으면 샘플 받기 링크가 안 나온다 */
    downloadSample?(kind: MyMapSampleKind): Promise<Blob>
    /** 업로드 결과 보고서(소유자만). 없으면 `매칭 N · 실패 M`이 글자로만 나온다 */
    importReport?(id: number, query?: MyMapImportReportQuery): Promise<MyMapImportReport>
    /** 실패 행 엑셀(원본 컬럼 + 실패 사유) */
    downloadImportFailures?(id: number): Promise<Blob>
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
