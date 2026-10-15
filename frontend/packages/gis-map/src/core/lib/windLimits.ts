// 바람지도 패널의 조작 범위·간격 상수. ol-wind를 모르는 곳(UI 슬라이더 범위 등)도 쓸 수 있게 플러그인 밖에 둔다.
// 값은 얼린 개념이 아니라 숫자·문자열 상수라 모듈 전역 가변 상태가 아니다.

/** 재생 중 한 프레임을 보여 주는 시간(ms). 프레임을 받아 그린 뒤부터 센다(느린 망에서 프레임이 건너뛰어지지 않게) */
export const WIND_FRAME_INTERVAL_MS = 2500
/** 프레임 캐시 최소 개수. 상한은 "지금 목록의 프레임 수"(한 발표분 전체)라 예보 범위가 바뀌어도(6→9시간) 맞춰 늘어난다 */
export const WIND_FRAME_CACHE_MIN = 2
/** 입자 밀도 배율 허용 범위(1 = 기본). 선 개수 = 해상도 기반 값 × 배율(20~1000개) */
export const WIND_DENSITY_MIN = 0.25
export const WIND_DENSITY_MAX = 2
/** 애니메이션 속도 배율 허용 범위(1 = 기본). velocityScale = 해상도 기반 값 × 배율 */
export const WIND_SPEED_MIN = 0.25
export const WIND_SPEED_MAX = 3
/** 슬라이더 한 칸 */
export const WIND_SCALE_STEP = 0.25
/** 풍속 색을 끈 입자의 단색 — 배경지도에 맞춘다: 위성 = 흰색, 일반·없음(밝은 바탕) = 진회색 */
export const WIND_MONO_COLOR_LIGHT = '#ffffff'
export const WIND_MONO_COLOR_DARK = '#334155'
/** 마우스 풍속 갱신 간격(ms) */
export const WIND_POINTER_THROTTLE_MS = 100

/** 패널이 열려 있는 동안 자료 오래됨을 다시 따져 보는 간격(ms) — 목록을 새로 받지는 않는다 */
export const WIND_STALE_CHECK_MS = 60 * 1000
/** 프레임 목록을 다시 받기 전까지의 시간(ms) — 패널을 다시 열 때 이보다 오래됐으면 목록을 한 번 더 받는다 */
export const WIND_FRAMES_TTL_MS = 30 * 60 * 1000
/** "자료 오래됨": 가장 늦은 예보 유효시각이 지금보다 이만큼(ms) 넘게 과거 */
export const WIND_STALE_PAST_MS = 60 * 60 * 1000
/** "자료 오래됨": 발표시각이 지금보다 이만큼(ms) 넘게 과거 */
export const WIND_STALE_ISSUED_MS = 12 * 60 * 60 * 1000

/** 색상 오버레이 진하기(불투명도) 허용 범위와 기본값 */
export const WIND_OVERLAY_OPACITY_MIN = 0.1
export const WIND_OVERLAY_OPACITY_MAX = 1
export const WIND_OVERLAY_OPACITY_DEFAULT = 0.6
export const WIND_OVERLAY_OPACITY_STEP = 0.05
/** 범례·오버레이 색 막대의 끝 풍속(m/s) */
export const WIND_LEGEND_MAX_SPEED = 25
