import { getToken } from '@/stores/authStore'

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8080'

/** 대시보드 전용 API 오류. status가 null이면 서버 응답 자체가 없는 경우(시간 초과·연결 실패) */
export class DashboardApiError extends Error {
    readonly status: number | null

    constructor(status: number | null, message: string) {
        super(message)
        this.name = 'DashboardApiError'
        this.status = status
    }
}

interface ApiEnvelope<T> {
    success: boolean
    message?: string
    data: T
}

export interface ApiGetOptions {
    signal?: AbortSignal
    /** 기본 10초. 넘으면 DashboardApiError(null, '응답이 늦습니다') */
    timeoutMs?: number
}

export const DEFAULT_TIMEOUT_MS = 10_000

/** GET 전용(대시보드는 읽기만 한다). 토큰을 붙이고, HTTP 상태와 봉투의 success를 모두 확인한다 */
export async function apiGet<T>(path: string, options: ApiGetOptions = {}): Promise<T> {
    const { signal, timeoutMs = DEFAULT_TIMEOUT_MS } = options
    const controller = new AbortController()
    let timedOut = false
    const onOuterAbort = () => controller.abort()
    if (signal) {
        if (signal.aborted) controller.abort()
        else signal.addEventListener('abort', onOuterAbort, { once: true })
    }
    const timer = setTimeout(() => {
        timedOut = true
        controller.abort()
    }, timeoutMs)

    try {
        const token = getToken()
        const res = await fetch(`${API}${path}`, {
            headers: token ? { Authorization: `Bearer ${token}` } : {},
            signal: controller.signal,
        })
        if (res.status === 401) {
            window.location.href = '/login'
            throw new DashboardApiError(401, '로그인이 필요합니다')
        }
        const body = await res.json().then(
            (json: ApiEnvelope<T>) => json,
            (e: unknown) => {
                if (controller.signal.aborted) throw e
                return null
            },
        )
        if (!res.ok) {
            throw new DashboardApiError(res.status, body?.message ? `HTTP ${res.status} · ${body.message}` : `HTTP ${res.status}`)
        }
        if (!body || body.success !== true) {
            throw new DashboardApiError(res.status, body?.message || '응답 형식이 올바르지 않습니다')
        }
        return body.data
    } catch (e) {
        if (e instanceof DashboardApiError) throw e
        if (timedOut) throw new DashboardApiError(null, '응답이 늦습니다')
        if (signal?.aborted) throw e
        throw new DashboardApiError(null, '서버에 연결할 수 없습니다')
    } finally {
        clearTimeout(timer)
        signal?.removeEventListener('abort', onOuterAbort)
    }
}

/** 개발 전용 `?dashFail=…`용 — 서버를 부르지 않고 바로 실패한다(운영에서는 호출되지 않는다) */
export function devFailLoader(): Promise<never> {
    return Promise.reject(new DashboardApiError(503, '개발용 실패'))
}
