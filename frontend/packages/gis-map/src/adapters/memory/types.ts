// 메모리 어댑터 입력 데이터 형식. 서버·파일 없이 "이미 가진 데이터"를 넘기면 GisMapSources를 만들어 준다(memorySources).
import type {
    AddressSearchItem, GeoJsonObject, LayerTree, MyMapSourceKind, ParcelBuildingsResult, ParcelInfo, ShareGroup, ShareUser,
    WindField, WindFrameMeta,
} from '../../core'
import type { AreaAnalysisColumn } from '../../core/areaAnalysis/types'
import type { Bbox } from './util'

/** 필지 한 건: 속성·경계(ParcelInfo.geometry = EPSG:4326 Feature)와 그 필지의 건물 목록 */
export interface MemoryParcel {
    info: ParcelInfo
    /** 없으면 건물 0건으로 답한다 */
    buildings?: ParcelBuildingsResult
}

/** 나만의지도 레이어 한 개. geojson은 EPSG:4326 FeatureCollection 또는 부를 때마다 만드는 함수(큰 데이터를 미리 만들어 두지 않으려고) */
export interface MemoryMapLayer {
    id: number
    name: string
    description?: string | null
    sourceKind: MyMapSourceKind
    /** 'Point' 등(목록 표시용) */
    geomType: string
    /** false면 공유받은 레이어(수정·삭제·공유 변경 불가) */
    owner: boolean
    ownerId?: string | null
    ownerName?: string | null
    styleConfig?: string | null
    createdAt: string
    featureCount: number
    geojson: GeoJsonObject | (() => GeoJsonObject)
    /** 처음 공유 대상(소유 레이어만) */
    shares?: { userIds: string[]; roleCodes: string[] }
}

/** 영역 분석(areaQuery) 대상 레이어 하나 — 트리 레이어의 `layerName`이 키 */
export interface MemoryAreaLayer {
    /** GeoJSON Feature(EPSG:4326) */
    features: GeoJsonObject[]
    columns?: AreaAnalysisColumn[]
    defaultCategory?: string | null
}

export interface MemoryWindFrame {
    meta: WindFrameMeta
    /** 바람장(grib2json 두 기록) 또는 처음 부를 때 만드는 함수 */
    field: WindField | (() => WindField)
}

export interface MemoryRegion {
    name: string
    /** [minLon, minLat, maxLon, maxLat] — 겹치면 가장 작은 범위가 이긴다 */
    bbox: Bbox
}

export interface MemoryData {
    tree?: LayerTree
    myMaps?: MemoryMapLayer[]
    parcels?: MemoryParcel[]
    places?: AddressSearchItem[]
    regions?: MemoryRegion[]
    areaLayers?: Record<string, MemoryAreaLayer>
    windFrames?: MemoryWindFrame[]
    /** 공유 상대 디렉터리(사용자·그룹) */
    users?: ShareUser[]
    groups?: ShareGroup[]
}

export interface MemorySourcesOptions {
    /** 업로드·주소 변환 메서드가 reject할 안내 문구. null이면 그 메서드들을 주지 않는다(없는 소스와 같은 동작). 기본: 데모 안내 문구 */
    uploadNotice?: string | null
}

export type { ParcelInfo }
