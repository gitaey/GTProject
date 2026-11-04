// 공개 데모(/demo/map) 호스트 값 — 서버 없는 호스트. 지도 패키지 밖(앱 쪽)이라 이식하지 않는다.
// 이 호스트는 로그인·백엔드·프록시를 전혀 모른다: 헤더 없음, 쿠키 안 보냄(credentials 'omit'), 고정 방문자,
// REST·프록시 주소는 일부러 없는 경로라 어댑터가 실수로 섞이면 404로 바로 드러난다.
// 모두 모듈 상수(얼림)라 렌더마다 참조가 바뀌지 않는다(Provider host는 값이 바뀔 때만 setHost).
import type { GisMapUser, PartialGisMapHost } from '@gtp/gis-map/core'

/** VWorld 키(브라우저에 이미 노출되는 값 — 도메인에 묶여 있다). 없으면 데모는 OSM 배경만 쓴다. 값은 코드·문서에 적지 않는다 */
export const DEMO_VWORLD_KEY: string = process.env.NEXT_PUBLIC_VWORLD_API_KEY ?? ''

/** 자체 GeoServer(CORS `*`, 공개 읽기). NEXT_PUBLIC_GEOSERVER_URL(로컬 개발값일 수 있음)과 무관하게 공개 주소 고정 */
export const DEMO_GEOSERVER_URL = 'https://geo.gitaey-dev.com/geoserver'

/** 일부러 없는 경로 — REST·프록시 어댑터가 섞이면 404가 나서 시험·네트워크 탭에서 바로 보인다 */
export const DEMO_NO_API = '/__demo-no-api'
export const DEMO_NO_PROXY = '/__demo-no-proxy'

export const DEMO_USER: Readonly<GisMapUser> = Object.freeze({
    userId: 'demo', role: 'DEMO', roleLabel: '데모 방문자', nickname: '방문자',
})

/** 데모에서 보이는 기능 ID(그 밖 — TIFF·기타 패널 등 — 은 숨긴다) */
export const DEMO_FEATURES: readonly string[] = Object.freeze([
    'map.panel.layer', 'map.panel.mymap',
    'map.tool.zoom', 'map.tool.draw', 'map.tool.measure-distance', 'map.tool.measure-area', 'map.tool.radius-search',
    'map.tool.print', 'map.tool.area-analysis', 'map.tool.parcel-info', 'map.tool.clear', 'map.tool.wind',
])

export function isDemoFeatureAllowed(featureId: string): boolean {
    return DEMO_FEATURES.includes(featureId)
}

const NO_HEADERS = (): Record<string, string> => ({})
const DEMO_USER_GETTER = (): GisMapUser => DEMO_USER

export const DEMO_HOST: PartialGisMapHost = Object.freeze({
    http: Object.freeze({ getHeaders: NO_HEADERS, credentials: 'omit' as RequestCredentials }),
    endpoints: Object.freeze({ apiBaseUrl: DEMO_NO_API, proxyBaseUrl: DEMO_NO_PROXY, geoserverUrl: DEMO_GEOSERVER_URL }),
    keys: Object.freeze({ vworld: DEMO_VWORLD_KEY }),
    getCurrentUser: DEMO_USER_GETTER,
    isFeatureAllowed: isDemoFeatureAllowed,
    permissionsReady: true,
})
