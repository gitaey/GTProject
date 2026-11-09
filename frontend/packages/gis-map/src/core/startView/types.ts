// 시작 화면(지도를 열 때 처음 보이는 위치·배경지도·분할) 타입. React 없음 — UMD에서도 쓴다.
import type { BasemapMode } from '../types/layer'

/** 지도 하나의 화면 상태 */
export interface GisMapViewState {
    /** [lon, lat] EPSG:4326 */
    center: [number, number]
    zoom: number
    /** 라디안 */
    rotation: number
    basemap: BasemapMode
}

/** 저장하는 시작 화면(JSON 그대로 서버·브라우저 저장소에 들어간다) */
export interface GisMapStartView {
    version: 1
    /** ISO-8601(클라이언트 시각) — 서버 시각은 StoredStartView.updatedAt */
    savedAt: string
    split: { count: 1 | 2 | 3 | 4; sync: boolean; activeIndex: number }
    /** 길이 = split.count, 0번 = 기본 지도 */
    panes: GisMapViewState[]
}

export interface StoredStartView {
    view: GisMapStartView
    /** 서버 저장 시각(브라우저 저장소면 savedAt). 모르면 null */
    updatedAt: string | null
}

export interface StartViewSource {
    /** 어디에 저장되는지(카드 안내 문구). 'account' = "이 계정에", 'browser' = "이 브라우저에" */
    readonly scope: 'account' | 'browser'
    /**
     * 동기 값을 돌려주면 엔진이 첫 그림 전에 바로 적용한다. 저장한 적이 없으면 null.
     * 상태가 보이는 GisHttpError(status)로 reject: 401·403 로그인, 404 기능 없음, 503 저장소 준비 중, 408 시간 초과
     */
    load(signal?: AbortSignal): StoredStartView | null | Promise<StoredStartView | null>
    save(value: GisMapStartView, signal?: AbortSignal): StoredStartView | Promise<StoredStartView>
    clear(signal?: AbortSignal): void | Promise<void>
}

/** 엔진 설정 config.startView */
export interface GisMapStartViewConfig {
    /** 기본 true. false면 저장값을 불러오지도 적용하지도 않는다(분할 보조 지도). attachGisMap은 무시(항상 자동 적용 안 함) */
    autoApply?: boolean
    /** 지도를 그리기 전에 저장값을 기다리는 최대 시간(ms). 기본 1500. 0이면 기다리지 않는다(늦게 오면 적용 안 함) */
    waitMs?: number
}

export type StartViewStatus =
    /** 소스가 없거나 서버가 404 — 카드 숨김 */
    | 'unsupported'
    | 'idle'
    | 'loading'
    /** 읽음(value가 null이면 저장한 적 없음) */
    | 'ready'
    /** 503 저장소 준비 중 — 저장 단추 비활성 */
    | 'unavailable'
    /** 401·403 */
    | 'unauthorized'
    | 'timeout'
    | 'error'

export type StartViewOp = 'load' | 'save' | 'clear'
export type StartViewErrorKind = 'unauthorized' | 'timeout' | 'unavailable' | 'failed'

export interface StartViewState {
    status: StartViewStatus
    value: StoredStartView | null
    /** 이번 엔진이 열 때 이 값을 적용했나 */
    applied: boolean
    /** 값이 waitMs 뒤에 와서 적용하지 않았다 */
    late: boolean
    /** 받은 값이 parseStartView 검사에 실패했다(value는 null) */
    invalid: boolean
    /** 저장·삭제 요청 중 */
    saving: boolean
    /** 지도 그림을 미루고 저장값을 기다리는 중(최대 waitMs) — 셸이 지도 칸에 "준비 중" 표시를 띄운다 */
    holding: boolean
    lastError: string | null
    /** 마지막 오류가 난 작업·종류(성공하면 둘 다 null) */
    errorOp: StartViewOp | null
    errorKind: StartViewErrorKind | null
}

export const EMPTY_START_VIEW_STATE: Readonly<StartViewState> = Object.freeze({
    status: 'unsupported' as StartViewStatus,
    value: null,
    applied: false,
    late: false,
    invalid: false,
    saving: false,
    holding: false,
    lastError: null,
    errorOp: null,
    errorKind: null,
})
