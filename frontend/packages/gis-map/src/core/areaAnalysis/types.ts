// 영역 분석 공개 타입(map.areaAnalysis). 영역(다각형·사각형·원·현재 화면)을 정하고 분석할 레이어를 고르면
// 레이어마다 개수·면적(걸친 면적·잘라낸 면적)·길이·범주별 집계·숫자 열 통계를 계산한다.
// 대상은 레이어 트리의 GeoServer(WFS)·VWorld(Data API) 레이어 — 서버가 "영역에 걸친 피처"를 걸러 주고(sources.areaQuery),
// 선택 기준·잘라낸 면적·집계는 브라우저가 한다. 나만의지도는 대상이 아니다(사용자 결정).
import type { ReadableStore } from '../store'

export interface AreaAnalysisLayerRef {
    kind: 'tree'
    /** 레이어 트리의 레이어 id */
    layerId: number
    /** 쉼표로 묶인 VWorld 레이어 이름 중 하나 */
    part?: string
}

export type AreaShape = 'polygon' | 'box' | 'circle' | 'extent' | 'custom'
export type AreaSelectMode = 'intersects' | 'center' | 'within'
export type AreaDrawShape = 'polygon' | 'box' | 'circle'

export interface AreaAnalysisColumn {
    /** 원래 속성 이름 */
    name: string
    /** 화면 이름(없으면 name) */
    label: string
    kind: 'number' | 'text'
    /** false = 합계 숨김(단가 같은 열) */
    sum?: boolean
    /** 어댑터가 만든 열 */
    derived?: boolean
}

export interface AreaAnalysisLayerItem {
    ref: AreaAnalysisLayerRef
    name: string
    provider: 'geoserver' | 'vworld' | 'none'
    /** 지도에 켜져 있나 */
    on: boolean
    queryable: boolean | 'unknown'
    /** 질의 못 하는 사유(회색 표시) */
    reason: string | null
    /** 불러온 피처 수. 원격 레이어는 모르므로 null */
    count: number | null
}

export interface NumericColumnStats {
    name: string
    label: string
    /** 값이 있는 칸 수 */
    filled: number
    /** 그중 숫자로 읽힌 칸 수 */
    numeric: number
    /** 값은 있지만 숫자가 아닌 칸 수 */
    nonNumeric: number
    /** 값이 없는 칸 수(선택된 피처 중) */
    blank: number
    /** 합계. sumHidden이면 null */
    sum: number | null
    sumHidden: boolean
    mean: number | null
    min: number | null
    max: number | null
}

export interface CategoryRow {
    value: string
    count: number
    clipAreaM2: number | null
}

export interface CategoryResult {
    column: string
    label: string
    /** 개수 많은 순(같으면 처음 나온 순), 상위 N */
    rows: CategoryRow[]
    other: { count: number; clipAreaM2: number | null; kinds: number }
    /** 값이 없는 피처 */
    blank: { count: number; clipAreaM2: number | null }
    /** 서로 다른 값이 너무 많아 일부를 묶어서 센 경우 */
    distinctCapped: boolean
}

export type AreaWarningCode = 'LIMIT' | 'HIGHLIGHT_LIMIT' | 'CENTER_LOCAL' | 'CRS_GUESS'

export interface LayerAnalysisResult {
    ref: AreaAnalysisLayerRef
    name: string
    provider: AreaAnalysisLayerItem['provider']
    status: 'queued' | 'counting' | 'confirm' | 'loading' | 'computing' | 'done' | 'partial' | 'error' | 'cancelled'
    /** 0~1 */
    progress: number
    /** 영역에 걸친 전체 건수. 모르면 null */
    total: number | null
    /** 실제 집계한 건수 */
    received: number
    /** 기준(걸침·중심점·완전히 안) 적용 뒤 선택 수 */
    count: number
    byKind: { polygon: number; line: number; point: number; empty: number }
    /** 선택된 면 피처 전체 면적 합(지상 ㎡). 면 피처가 없으면 null */
    sumAreaM2: number | null
    /** 영역으로 잘라낸 면적 합(지상 ㎡) */
    clipAreaM2: number | null
    /** 선택된 선 피처 전체 길이 합(m). 선 피처가 없으면 null */
    sumLengthM: number | null
    columns: AreaAnalysisColumn[]
    numeric: NumericColumnStats[]
    category: CategoryResult | null
    /** 지도 강조를 상한까지만 그렸다 */
    highlightCapped: boolean
    /** 대상 레이어가 지도에서 꺼졌다(결과는 남지만 강조·표 연동은 끊긴다) */
    offMap: boolean
    warnings: Array<{ code: AreaWarningCode; message: string }>
    error: string | null
}

export interface AreaAnalysisArea {
    shape: AreaShape
    /** 지상 면적(㎡, ol/sphere getArea와 같은 구면 공식) */
    areaM2: number
    vertices: number
    geojson4326: { type: 'Polygon'; coordinates: number[][][] }
}

export type AreaConfirmChoice = 'limit' | 'skip-over' | 'cancel'

export interface AreaConfirm {
    /** 예상 건수가 상한을 넘는 레이어(건수를 모르면 expected null — 목록에 넣지 않는다) */
    items: Array<{ ref: AreaAnalysisLayerRef; name: string; expected: number; limit: number }>
    areaKm2: number
    /** 영역이 경고 기준(areaWarnKm2)보다 넓다 */
    overAreaLimit: boolean
    areaWarnKm2: number
}

export interface AreaResultRecord {
    /** 받은 순서 번호(0부터) */
    index: number
    /** 속성(지오메트리 제외) */
    props: Record<string, unknown>
    areaM2: number | null
    clipAreaM2: number | null
    lengthM: number | null
}

export interface AreaAnalysisState {
    status: 'idle' | 'drawing' | 'ready' | 'running' | 'confirm' | 'done'
    /** 그리는 중인 영역 종류(status === 'drawing'일 때) */
    drawing: AreaDrawShape | null
    area: AreaAnalysisArea | null
    /** 영역을 받지 못한 이유(꼬인 선·너무 작음 등). 새 영역을 받으면 지워진다 */
    areaError: string | null
    mode: AreaSelectMode
    /** 분석할 수 있는 레이어 목록(레이어 트리의 켜짐·꺼짐·질의 가능 판정에 따라 갱신) */
    layers: AreaAnalysisLayerItem[]
    picked: AreaAnalysisLayerRef[]
    results: LayerAnalysisResult[]
    /** 사전 확인 대기 중이면 그 내용(status === 'confirm'). answerConfirm으로 답한다 */
    confirm: AreaConfirm | null
    /** 지도·목록에서 가리키는 피처 한 개(빨강 강조) */
    active: { ref: AreaAnalysisLayerRef; index: number } | null
}

export interface AreaAnalysisController {
    readonly store: ReadableStore<AreaAnalysisState>
    /** 분석할 레이어를 정한다(목록에 없는 ref는 무시). 나머지 목록 레이어는 해제된다 */
    setPicked(refs: AreaAnalysisLayerRef[]): void
    setMode(mode: AreaSelectMode): void
    /** 이 레이어 결과의 범주 열을 바꾼다(받아 둔 피처로 다시 센다 — 재질의 없음). null = 범주표 끔 */
    setCategory(ref: AreaAnalysisLayerRef, column: string | null): void
    /** 지도에서 그린다. 같은 도형을 다시 부르면 그대로 둔다. 끝나면 도구는 꺼진다 */
    startDrawing(shape: AreaDrawShape): void
    /** 그리던 것을 멈춘다 */
    stopDrawing(): void
    /** 지금 화면 범위를 영역으로 */
    useViewExtent(): void
    /** 영역을 직접 준다(EPSG:4326 GeoJSON Polygon — 행정구역 경계 등). 구멍·꼬인 선은 거절(Error) */
    setArea(geometry4326: unknown): void
    /** 영역과 고른 레이어로 분석한다. 이미 돌고 있으면 그것을 멈추고 다시 시작 */
    run(): Promise<LayerAnalysisResult[]>
    cancel(): void
    /** 사전 확인에 답한다(state.confirm이 있을 때만). limit = 상한까지만 분석, skip-over = 상한을 넘는 레이어는 빼고 분석, cancel = 전부 취소 */
    answerConfirm(choice: AreaConfirmChoice): void
    /** 이 레이어 피처 한 개를 가리킨다(index = 결과 목록의 번호 = 받은 순서). null = 해제. fit = 지도를 그 피처로 */
    setActive(ref: AreaAnalysisLayerRef, index: number | null, opts?: { fit?: boolean }): void
    /** 레이어 목록을 다시 읽는다(이름이 늦게 알려지는 경우) */
    refreshLayers(): void
    /** 지도 클릭으로 강조 피처를 가리키게 한다. 패널이 열린 동안만 켠다. 반환값 = 끄기 */
    enableMapPick(): () => void
    /** 결과(선택된) 피처 행들 — 결과 목록·외부 처리용. 받은 순서 */
    resultRecords(ref: AreaAnalysisLayerRef): ReadonlyArray<AreaResultRecord>
    resultFeatures(ref: AreaAnalysisLayerRef): ReadonlyArray<unknown>
    exportResult(ref: AreaAnalysisLayerRef, format: 'csv' | 'geojson'): Blob
    /** 영역·결과·강조를 지운다(그리던 도구도 끈다) */
    clear(): void
}

export interface GisMapAreaAnalysisConfig {
    /** 지도 강조를 레이어당 이만큼까지만 그린다. 기본 5000 */
    highlightMax?: number
    /** 범주표에 보여 주는 값 수(나머지는 '기타'). 기본 8 */
    categoryTop?: number
    /** 한 번에 계산하는 시간(ms). 이 시간마다 화면에 양보한다. 기본 12 */
    chunkMs?: number
    /** 원격 레이어 하나에서 받아 집계하는 최대 건수(넘으면 "일부만 집계"). 기본 5000 */
    maxFeaturesPerLayer?: number
    /** 영역이 이 넓이(㎢)를 넘으면 원격 질의 전에 계속할지 묻는다. 기본 25 */
    areaWarnKm2?: number
    /** 동시에 보내는 원격 요청 수(레이어 단위). 기본 2 */
    maxConcurrent?: number
}

export const DEFAULT_AREA_ANALYSIS: Readonly<Required<GisMapAreaAnalysisConfig>> = Object.freeze({
    highlightMax: 5000,
    categoryTop: 8,
    chunkMs: 12,
    maxFeaturesPerLayer: 5000,
    areaWarnKm2: 25,
    maxConcurrent: 2,
})

export function refKey(ref: AreaAnalysisLayerRef): string {
    return 't:' + ref.layerId + ':' + (ref.part ?? '')
}

export function sameRef(a: AreaAnalysisLayerRef, b: AreaAnalysisLayerRef): boolean {
    return refKey(a) === refKey(b)
}
