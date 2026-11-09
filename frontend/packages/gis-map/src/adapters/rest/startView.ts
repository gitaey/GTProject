// 시작 화면 소스(계정 저장) — 짝 백엔드 /api/mymap/start-view (로그인한 본인 것만, 서버는 형식·크기만 검사한다)
//   load()   GET    → data.view가 null이면 저장한 적 없음(null)
//   save(v)  PUT    본문 = 시작 화면 JSON, 응답 { view, updatedAt }
//   clear()  DELETE 저장값이 없어도 200
// 상태 코드는 GisHttpError로 그대로 올린다(엔진이 404 기능 없음·503 저장소 준비 중·401/403 로그인 만료로 바꿔 보인다).
// 시간 제한: 조회 5초·저장/삭제 10초 — 넘으면 GisHttpError(408). 바깥 signal(엔진이 다른 요청으로 갈아탈 때)이 abort되면 그대로 중단 오류.
import { GisHttpError } from '../../core'
import type { GisMapStartView, SourceContext, StartViewSource, StoredStartView } from '../../core'
import { apiUrl } from './envelope'
import type { ApiEnvelope } from './envelope'

/** 조회 요청 시간 제한(ms) */
export const START_VIEW_LOAD_TIMEOUT_MS = 5000
/** 저장·삭제 요청 시간 제한(ms) */
export const START_VIEW_WRITE_TIMEOUT_MS = 10000

interface StartViewResponse {
    view: unknown
    updatedAt: string | null
}

interface TimedSignal {
    signal: AbortSignal
    timedOut(): boolean
    dispose(): void
}

/** 제한 시간 타이머 + 바깥 signal을 합친 signal */
function timedSignal(ms: number, outer?: AbortSignal): TimedSignal {
    const ac = new AbortController()
    let timedOut = false
    const timer = setTimeout(() => {
        timedOut = true
        ac.abort()
    }, ms)
    const onOuterAbort = (): void => ac.abort()
    if (outer) {
        if (outer.aborted) ac.abort()
        else outer.addEventListener('abort', onOuterAbort, { once: true })
    }
    return {
        signal: ac.signal,
        timedOut: () => timedOut,
        dispose(): void {
            clearTimeout(timer)
            outer?.removeEventListener('abort', onOuterAbort)
        },
    }
}

async function errorFromResponse(res: Response): Promise<GisHttpError> {
    let message = 'HTTP ' + res.status
    try {
        const json = (await res.json()) as Partial<ApiEnvelope<unknown>>
        if (typeof json.message === 'string' && json.message) message = json.message
    } catch {
        // 본문 없음(만료 토큰의 403 등) — 상태 코드 문구
    }
    return new GisHttpError(res.status, message)
}

export interface RestStartViewOptions {
    /** 조회 제한 시간(ms). 기본 5000 */
    loadTimeoutMs?: number
    /** 저장·삭제 제한 시간(ms). 기본 10000 */
    writeTimeoutMs?: number
}

export function restStartView(ctx: SourceContext, opts: RestStartViewOptions = {}): StartViewSource {
    const loadTimeoutMs = opts.loadTimeoutMs ?? START_VIEW_LOAD_TIMEOUT_MS
    const writeTimeoutMs = opts.writeTimeoutMs ?? START_VIEW_WRITE_TIMEOUT_MS
    async function call(method: 'GET' | 'PUT' | 'DELETE', timeoutMs: number, signal: AbortSignal | undefined, body?: string): Promise<StartViewResponse | null> {
        const timer = timedSignal(timeoutMs, signal)
        try {
            const res = await ctx.http.fetch(apiUrl(ctx.host(), '/api/mymap/start-view'), {
                method,
                headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
                body,
                signal: timer.signal,
            })
            if (!res.ok) throw await errorFromResponse(res)
            let json: ApiEnvelope<StartViewResponse | null>
            try {
                json = (await res.json()) as ApiEnvelope<StartViewResponse | null>
            } catch {
                throw new GisHttpError(res.status, '서버 응답을 읽을 수 없습니다(HTTP ' + res.status + ')')
            }
            if (!json.success) throw new GisHttpError(res.status, json.message)
            return json.data ?? null
        } catch (err) {
            // 제한 시간이 먼저 끝났으면 중단 오류 대신 408(시간 초과)로 바꾼다
            if (timer.timedOut()) throw new GisHttpError(408, '서버 응답이 ' + timeoutMs / 1000 + '초 안에 오지 않았습니다')
            throw err
        } finally {
            timer.dispose()
        }
    }

    return {
        scope: 'account',
        async load(signal?: AbortSignal): Promise<StoredStartView | null> {
            const data = await call('GET', loadTimeoutMs, signal)
            if (!data || data.view === null || data.view === undefined) return null
            return { view: data.view as GisMapStartView, updatedAt: data.updatedAt ?? null }
        },
        async save(value: GisMapStartView, signal?: AbortSignal): Promise<StoredStartView> {
            const data = await call('PUT', writeTimeoutMs, signal, JSON.stringify(value))
            return { view: (data?.view ?? value) as GisMapStartView, updatedAt: data?.updatedAt ?? null }
        },
        async clear(signal?: AbortSignal): Promise<void> {
            await call('DELETE', writeTimeoutMs, signal)
        },
    }
}
