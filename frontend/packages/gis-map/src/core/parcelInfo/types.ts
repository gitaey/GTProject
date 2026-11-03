// 필지 정보 카드(map.parcelInfo) 타입. 상태 원본은 컨트롤러의 store이고 React 카드·UMD 예제는 그것을 읽는다.
import type { ParcelBuildingsResult, ParcelInfo } from '../sources'
import type { ReadableStore } from '../store'

export type ParcelStatus = 'loading' | 'ready' | 'none' | 'error'

/**
 * 건물 칸 상태. off = 칸 없음(소스 없음·필지 조회 전), loading = 불러오는 중, ready = 결과(건물 0건도 ready),
 * unavailable = 서버 자료 준비 중(503), unauthorized = 로그인 필요(403), unsupported = 서버가 이 기능을 모름(404 — 이후 칸 숨김), error = 그 밖의 오류
 */
export type ParcelBuildingsStatus = 'off' | 'loading' | 'ready' | 'unavailable' | 'unauthorized' | 'unsupported' | 'error'

export interface ParcelInfoState {
    /** 카드가 열려 있다(필지를 눌렀고 아직 ×로 닫지 않음) */
    open: boolean
    /** 마지막으로 누른 지점(경도·위도) */
    point: [number, number] | null
    parcel: {
        status: ParcelStatus
        info: ParcelInfo | null
        /** 필지 경계로 잰 지도 도형 면적(㎡, 토지대장 면적과 다를 수 있음). 경계가 없으면 null */
        areaM2: number | null
        error: string | null
    }
    buildings: {
        status: ParcelBuildingsStatus
        result: ParcelBuildingsResult | null
        error: string | null
        /** 전체 보기(limit 1000)를 받는 중 */
        loadingAll: boolean
    }
}

export interface ParcelInfoController {
    readonly store: ReadableStore<ParcelInfoState>
    /** `sources.parcel.infoAt`이 있다(없으면 필지 정보 도구 단추가 의미 없다) */
    readonly available: boolean
    /** 지도 클릭과 같은 동작(UMD·검색 연동용). 같은 필지 안의 점이면 요청하지 않는다 */
    lookupAt(lon: number, lat: number): Promise<void>
    /** 필지 오류면 다시 조회, 건물 오류·준비 중이면 건물만 다시 */
    retry(): Promise<void>
    /** 전체 보기: 건물이 잘렸으면(truncated) limit 1000으로 다시 받는다 */
    loadAllBuildings(): Promise<void>
    /** 카드·강조·진행 중 요청을 지운다(도구는 켜진 채 — 다음 클릭에 다시 열린다) */
    close(): void
    /** clearAll용: close와 같다 */
    clear(): void
}

export const INITIAL_PARCEL_INFO_STATE: Readonly<ParcelInfoState> = Object.freeze({
    open: false,
    point: null,
    parcel: Object.freeze({ status: 'loading' as const, info: null, areaM2: null, error: null }),
    buildings: Object.freeze({ status: 'off' as const, result: null, error: null, loadingAll: false }),
})
