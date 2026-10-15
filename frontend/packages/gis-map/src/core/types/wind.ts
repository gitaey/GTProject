// 바람장 데이터 — ol-wind(WindLayer)가 받는 grib2json 형태

/** data의 null = 자료 없는 칸(원본 격자 밖·결측). 풍속 0(무풍)과 다르다 */
export type WindField = Array<{ header: Record<string, unknown>; data: Array<number | null> }>

/** 스칼라 변수(색상 오버레이용 예보값) 코드 — 서버·프론트 공통. temp 기온(℃), humi 습도(%), rain 강수량(mm) */
export type WindScalarVar = 'temp' | 'humi' | 'rain'

/** 색상 오버레이로 보일 값: none 없음, speed 풍속(입자와 같은 바람 데이터), 나머지는 스칼라 변수 */
export type WindOverlayVar = 'none' | 'speed' | WindScalarVar

/**
 * 스칼라 변수 한 장(짝 백엔드 api/wind/fields/{id}) — grib2json과 비슷한 단일 기록. 값 = data[i] × header.scale(정수 양자화).
 * header: lo1·la1·lo2·la2·dx·dy·nx·ny(바람과 같은 격자 규약), scale, var, unit 등. data의 null = 자료 없는 칸(0과 다르다)
 */
export interface WindScalarField {
    header: Record<string, unknown>
    data: Array<number | null>
}

/** 예보 프레임 하나의 메타(짝 백엔드 api/wind/frames). 데이터 본문은 WindSource.frame(id)로 따로 받는다 */
export interface WindFrameMeta {
    id: number
    /** 예보시간(0 ~ 서버 설정 예보 범위-1, 지금 0~8) — 발표시각 + 이 시간 = 유효시각 */
    forecastHour: number
    /** 유효시각 — **UTC**, 시간대 표시 없는 ISO 문자열('2026-10-14T00:00:00'). 화면에는 KST(+9)로 바꿔 보인다 */
    validTime: string
    /** 발표(사이클) 날짜 — KST 'YYYY-MM-DD'. 옛 서버에는 없다(없으면 유효시각에서 계산) */
    cycleDate?: string
    /** 발표(사이클) 시 — KST 3·9·15·21. 옛 서버에는 없다 */
    cycleHour?: number
    /** 이 시각의 스칼라 변수 id(있는 것만). 옛 서버·서버가 그 변수를 안 받으면 없다 */
    fields?: Partial<Record<WindScalarVar, number>>
}

/** 한 지점의 바람 */
export interface WindSample {
    /** 풍속(m/s) */
    speed: number
    /** 바람이 불어오는 방향(기상학적, 북=0 시계방향, 0 이상 360 미만) */
    directionDeg: number
    /** 동서 성분(m/s, 동쪽으로 + ) */
    u: number
    /** 남북 성분(m/s, 북쪽으로 + ) */
    v: number
}

/** 한 지점의 스칼라 변수 값. value null = 그 지점 자료 없음(또는 이 시각 자료가 아직 없음) */
export interface WindScalarSample {
    var: WindScalarVar
    value: number | null
}

/** 마우스 아래 값 묶음 — 바람(첫 줄)과 고른 스칼라 변수(둘째 줄). 마우스가 지도 밖이면 알림 자체가 null */
export interface WindPointerValues {
    wind: WindSample | null
    scalar: WindScalarSample | null
}

/** 자료 오래됨 종류 — past: 가장 늦은 예보 유효시각이 이미 한참 지났다, old: 발표시각이 오래됐다 */
export type WindStaleKind = 'past' | 'old'

/** 프레임 목록 상태 */
export type WindFramesStatus = 'idle' | 'loading' | 'ready' | 'unsupported' | 'error'

/** 바람길 플러그인 상태(React 위젯이 ol-wind 없이 타입·빈 상태를 쓰도록 core에 둔다) */
export interface WindState {
    /** 표시하기로 했는지(토글 버튼·범례가 이 값을 본다) */
    visible: boolean
    /** 데이터를 받는 중 */
    loading: boolean
    /** 마지막 받기 실패 메시지(데이터·프레임 목록 공통). 옛 화면은 표시하지 않았다 */
    error: string | null
    /** 예보 프레임 목록(예보시간 오름차순, 예보시간당 id가 가장 큰 것 하나). 불러오기 전·미지원이면 빈 배열 */
    frames: readonly WindFrameMeta[]
    /** 프레임 목록 상태. 'unsupported' = 소스에 frames()/frame()이 없음(latest()만 쓰는 옛 동작) */
    framesStatus: WindFramesStatus
    /** 선택된 프레임 번호(frames 안의 index). 아직 정하지 않았으면 -1 */
    frameIndex: number
    /** 자동 재생 중 */
    playing: boolean
    /** 입자 밀도 배율(1 = 해상도 기반 기본값) */
    densityScale: number
    /** 애니메이션 속도 배율(1 = 해상도 기반 기본값) */
    speedScale: number
    /** true = 풍속별 색, false = 단색(배경지도에 맞춤: 위성 흰색·그 밖 진회색) */
    colorBySpeed: boolean
    /** 바람 입자 레이어를 보일지(데이터·오버레이는 그대로). visible(바람 켜짐)과 별개 */
    particlesVisible: boolean
    /** 색상 오버레이(입자 아래 래스터)를 보일지 — overlayVar !== 'none'과 같다(옛 화면 호환) */
    overlayVisible: boolean
    /** 오버레이 진하기(불투명도 0.1~1, 기본 0.6) */
    overlayOpacity: number
    /** 프레임 목록을 마지막으로 받은 시각(epoch ms, 플러그인 시계). 받기 전 null */
    framesLoadedAt: number | null
    /** 자료 오래됨(목록을 받은 시점 기준). 아니면 null */
    stale: WindStaleKind | null
    /** 사용자에게 알릴 일반 안내(오류 아님) — 예: 프레임이 서버에서 바뀌어 목록을 다시 받았다 */
    notice: string | null
    /** 고른 색상 오버레이 값. none = 끔, speed = 풍속(기본으로 켤 때), 그 밖 = 스칼라 변수 */
    overlayVar: WindOverlayVar
    /** 소스가 스칼라 변수를 받을 수 있는지(WindSource.field 구현 여부) — 없으면 패널은 풍속만 보인다 */
    scalarSupported: boolean
    /** 현재 프레임 목록의 어느 프레임에라도 id가 있는 스칼라 변수(temp·humi·rain 순). 서버가 안 주는 변수는 빠진다 */
    scalarVars: readonly WindScalarVar[]
    /** 색상 오버레이 안내(오류 아님) — 예: '이 시각의 기온 자료가 아직 없습니다'. 없으면 null */
    overlayNote: string | null
}

const NO_FRAMES: readonly WindFrameMeta[] = Object.freeze([])
const NO_SCALAR_VARS: readonly WindScalarVar[] = Object.freeze([])

export const EMPTY_WIND_STATE: Readonly<WindState> = Object.freeze({
    visible: false, loading: false, error: null,
    frames: NO_FRAMES, framesStatus: 'idle', frameIndex: -1, playing: false,
    densityScale: 1, speedScale: 1, colorBySpeed: true,
    particlesVisible: true, overlayVisible: false, overlayOpacity: 0.6, framesLoadedAt: null, stale: null, notice: null,
    overlayVar: 'none', scalarSupported: false, scalarVars: NO_SCALAR_VARS, overlayNote: null,
} as WindState)
