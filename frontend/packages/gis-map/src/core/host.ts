// 호스트 주입 계약. 인증·주소·키·권한은 전부 이 객체로만 받는다(지도 코드는 호스트 프로젝트를 모른다).
import type { GisFeatureId } from './types/feature'

export interface GisMapUser {
    userId: string
    role: string
    roleLabel?: string
    permission?: string | null
    nickname?: string | null
}

export interface GisMapHttpOptions {
    /** 모든 요청에 붙일 헤더. 요청마다 다시 읽는다(토큰 갱신 대응). 예: Bearer 토큰, JSP의 CSRF 헤더 */
    getHeaders: () => Record<string, string>
    /** fetch credentials. 세션 쿠키 인증이면 'same-origin'(기본) 또는 'include' */
    credentials?: RequestCredentials
    /** 401 응답 시 호출(선택) */
    onUnauthorized?: () => void
}

export interface GisMapEndpoints {
    /** 짝 백엔드 REST base. '' = 상대 경로(/api/...) */
    apiBaseUrl: string
    /** API 키 숨김용 호스트 프록시 base */
    proxyBaseUrl: string
    /** GeoServer base(범례 GetLegendGraphic). '' 이면 이미지 범례 끔 */
    geoserverUrl: string
}

export interface GisMapHost {
    http: GisMapHttpOptions
    endpoints: GisMapEndpoints
    keys: { vworld: string }
    /** 현재 사용자. 함수로 받아 React 밖에서도 항상 최신값을 읽는다 */
    getCurrentUser: () => GisMapUser | null
    /** 기능 ID 허용 여부. 권한 체계가 없으면 () => true */
    isFeatureAllowed: (featureId: GisFeatureId | string) => boolean
    /** 권한 정보 로딩 완료 여부. false면 위젯은 전부 표시한다 */
    permissionsReady: boolean
}

/** 일부만 넘기면 나머지는 기본값으로 채운다(중첩 객체는 얕은 병합) */
export interface PartialGisMapHost {
    http?: Partial<GisMapHttpOptions>
    endpoints?: Partial<GisMapEndpoints>
    keys?: Partial<GisMapHost['keys']>
    getCurrentUser?: GisMapHost['getCurrentUser']
    isFeatureAllowed?: GisMapHost['isFeatureAllowed']
    permissionsReady?: boolean
}

export const DEFAULT_HOST: GisMapHost = Object.freeze({
    http: Object.freeze({ getHeaders: () => ({}), credentials: 'same-origin' as RequestCredentials }),
    endpoints: Object.freeze({ apiBaseUrl: '', proxyBaseUrl: '/proxy', geoserverUrl: '' }),
    keys: Object.freeze({ vworld: '' }),
    getCurrentUser: () => null,
    isFeatureAllowed: () => true,
    permissionsReady: true,
})

/** undefined인 값은 빼고 복사(명시하지 않은 필드가 기본값을 undefined로 덮지 않게) */
function definedOnly<T extends object>(obj: T | undefined): Partial<T> {
    const out: Partial<T> = {}
    if (!obj) return out
    for (const k of Object.keys(obj) as Array<keyof T>) {
        if (obj[k] !== undefined) out[k] = obj[k]
    }
    return out
}

/** base 위에 patch를 얹은 새 호스트 객체 */
export function mergeHost(base: GisMapHost, patch?: PartialGisMapHost | null): GisMapHost {
    if (!patch) return base
    return {
        http: { ...base.http, ...definedOnly(patch.http) },
        endpoints: { ...base.endpoints, ...definedOnly(patch.endpoints) },
        keys: { ...base.keys, ...definedOnly(patch.keys) },
        getCurrentUser: patch.getCurrentUser ?? base.getCurrentUser,
        isFeatureAllowed: patch.isFeatureAllowed ?? base.isFeatureAllowed,
        permissionsReady: patch.permissionsReady ?? base.permissionsReady,
    }
}
