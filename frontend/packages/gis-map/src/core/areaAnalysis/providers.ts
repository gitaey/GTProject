// 영역 분석 레이어 제공자(내부 타입). 컨트롤러는 종류를 모르고 이 인터페이스만 부른다.
//   · RemoteProvider(remoteProvider.ts) — 레이어 트리의 GeoServer(WFS)·VWorld(Data API) 레이어를 sources.areaQuery로 질의
// 후보를 받으면 판정·클립 면적·집계는 컨트롤러가 똑같이 한다.
import type Feature from 'ol/Feature'
import type Geometry from 'ol/geom/Geometry'
import type { Candidate } from './analyze'
import type { AreaModel } from './spatial'
import type { AreaAnalysisColumn, AreaAnalysisLayerItem, AreaAnalysisLayerRef } from './types'

/** 취소 표 — 제공자는 오래 걸리는 일(요청·페이지)에서 확인한다. signal은 진행 중인 요청을 끊는 데 쓴다 */
export interface CancelToken {
    cancelled: boolean
    signal?: AbortSignal
}

/** 이번 분석의 영역: 판정용 모델(뷰 좌표계)과 서버에 보낼 바깥 링(EPSG:4326 [경도, 위도]) */
export interface RunArea {
    model: AreaModel
    ring4326: number[][]
}

export interface ProbeResult {
    /** 영역에 걸친 예상 건수(모르면 null) */
    expected: number | null
}

export interface FetchOptions {
    /** 이만큼까지만 받는다 */
    limit: number
    /** 받은 건수·전체 건수(알면)가 바뀔 때 */
    onProgress(received: number, total: number | null): void
}

export interface LayerCandidates {
    features: Array<Candidate<Feature<Geometry>>>
    /** 속성이 아닌 키(지오메트리 이름) */
    geometryName: string
    /** 지도에 켜진 레이어를 추적할 때의 번호(켜져 있었으면 1, 꺼져 있었으면 null = 추적 안 함) */
    generation: number | null
    /** 영역에 걸친 전체 건수를 알면 */
    total: number | null
    /** 상한에 걸려 더 있는데 받지 않았다 */
    capped: boolean
    /** 어댑터가 아는 열 정보 */
    columns: readonly AreaAnalysisColumn[]
    /** 범주표 기본 열 힌트(없으면 코어가 값 분포로 고른다) */
    defaultCategory: string | null
}

export interface AreaLayerProvider {
    handles(ref: AreaAnalysisLayerRef): boolean
    /** 지금 분석할 수 있는(또는 회색으로 보일) 레이어 목록 */
    list(): AreaAnalysisLayerItem[]
    /** 목록·판정이 바뀔 때 알림. 반환값 = 해제 */
    subscribe?(fn: () => void): () => void
    /** 패널이 열려 목록을 보여 줄 때 — 아직 모르는 레이어의 질의 가능 여부 판정을 시작한다(레이어당 1번, 캐시) */
    warmUp?(): void
    /** 질의 가능 판정 + 예상 건수. 못 하면 throw(메시지가 카드에 그대로 나온다) */
    probe(ref: AreaAnalysisLayerRef, area: RunArea, token: CancelToken): Promise<ProbeResult>
    /** 영역에 걸린 피처를 상한까지 받는다. 레이어가 없으면 null */
    candidates(ref: AreaAnalysisLayerRef, area: RunArea, token: CancelToken, o: FetchOptions): Promise<LayerCandidates | null>
    /** 이 결과가 아직 지도에 켜져 있는 같은 레이어인가(generation null이면 추적 안 함 = true) */
    onMap(ref: AreaAnalysisLayerRef, generation: number | null): boolean
    nameOf(ref: AreaAnalysisLayerRef): string
    /** 한 번의 분석이 끝났거나 멈췄다 — 임시로 들고 있던 것(1쪽 미리 받은 것)을 비운다 */
    reset?(): void
    destroy?(): void
}
