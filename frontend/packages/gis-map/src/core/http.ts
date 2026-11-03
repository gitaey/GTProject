// 코어·어댑터 공용 HTTP 클라이언트. 호스트의 헤더·credentials를 요청마다 새로 읽어 붙인다.
import type { GisMapHost } from './host'

export interface HttpClient {
    fetch(url: string, init?: RequestInit): Promise<Response>
    /**
     * 외부 서버(다른 출처 GeoServer 등) 호출: 호스트 헤더(로그인 토큰 Authorization)를 붙이지 않고 `credentials: 'omit'`,
     * 401이어도 `onUnauthorized`(로그아웃)를 부르지 않는다. 우리 토큰이 남의 서버로 새거나 남의 401에 로그아웃되는 것을 막는다.
     * 호출부가 init.headers로 준 헤더만 가고 Authorization은 버린다
     */
    fetchExternal(url: string, init?: RequestInit): Promise<Response>
    /** !res.ok면 GisHttpError를 던진다 */
    json<T>(url: string, init?: RequestInit): Promise<T>
}

export class GisHttpError extends Error {
    readonly status: number

    constructor(status: number, message: string) {
        super(message)
        this.name = 'GisHttpError'
        this.status = status
    }
}

/** getHost는 호출 시점의 호스트를 돌려준다(setHost 반영) */
export function createHttpClient(getHost: () => GisMapHost): HttpClient {
    async function request(url: string, init?: RequestInit): Promise<Response> {
        const host = getHost()
        const headers = new Headers(host.http.getHeaders())
        // 호출부가 준 헤더가 우선
        new Headers(init?.headers).forEach((value, key) => headers.set(key, value))
        const res = await fetch(url, {
            ...init,
            headers,
            credentials: init?.credentials ?? host.http.credentials ?? 'same-origin',
        })
        if (res.status === 401) host.http.onUnauthorized?.()
        return res
    }

    async function requestExternal(url: string, init?: RequestInit): Promise<Response> {
        const headers = new Headers(init?.headers)
        headers.delete('authorization')
        return fetch(url, { ...init, headers, credentials: 'omit' })
    }

    return {
        fetch: request,
        fetchExternal: requestExternal,
        async json<T>(url: string, init?: RequestInit): Promise<T> {
            const res = await request(url, init)
            if (!res.ok) throw new GisHttpError(res.status, `HTTP ${res.status} ${url}`)
            return (await res.json()) as T
        },
    }
}
