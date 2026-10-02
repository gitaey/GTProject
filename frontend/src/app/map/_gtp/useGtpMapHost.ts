'use client'

// GTProject → 지도 패키지 호스트 값(GisMapHost) 연결부. 지도 패키지는 authStore/menuStore/환경 변수를 모른다 —
// 여기(앱 쪽)에서만 읽어 PartialGisMapHost로 만든다. 다른 프로젝트로 옮길 때는 이 파일을 그 프로젝트에 맞게 새로 쓴다.
import { useMemo } from 'react'
import { useAuthStore, getToken } from '@/stores/authStore'
import { useMenuStore } from '@/stores/menuStore'
import type { PartialGisMapHost } from '@gtp/gis-map/core'

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8080'
const VWORLD_API_KEY = process.env.NEXT_PUBLIC_VWORLD_API_KEY ?? ''
const GEOSERVER_URL = process.env.NEXT_PUBLIC_GEOSERVER_URL ?? 'http://localhost:8600/geoserver'
/** VWorld·WFS·지역명 프록시(app/proxy/*) — API 키를 브라우저에 노출하지 않으려고 서버를 거친다 */
const PROXY_BASE_URL = '/proxy'

function authHeaders(): Record<string, string> {
    const token = getToken()
    return token ? { Authorization: `Bearer ${token}` } : {}
}

/**
 * 반환값은 user·isAllowed·loaded가 바뀔 때만 새 객체(그 밖에는 같은 참조).
 * 새 객체가 오면 GisMapProvider가 map.setHost()로 엔진에 알린다(hostchange). 함수 값들은 호출할 때마다 최신 상태를 읽는다
 */
export function useGtpMapHost(): PartialGisMapHost {
    const user = useAuthStore(s => s.user)
    const { isAllowed, loaded } = useMenuStore()

    // user는 객체 안에서 직접 쓰지 않지만(getCurrentUser가 매번 읽는다) 로그인 사용자가 바뀌면 새 객체를 내려 위젯을 다시 그리게 한다
    return useMemo<PartialGisMapHost>(() => ({
        http: { getHeaders: authHeaders },
        endpoints: { apiBaseUrl: API_BASE_URL, proxyBaseUrl: PROXY_BASE_URL, geoserverUrl: GEOSERVER_URL },
        keys: { vworld: VWORLD_API_KEY },
        getCurrentUser: () => useAuthStore.getState().user,
        isFeatureAllowed: isAllowed,
        permissionsReady: loaded,
    }), [user, isAllowed, loaded])
}
