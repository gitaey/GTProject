import { NextResponse } from 'next/server'

// 프록시 라우트(app/proxy/**) 공통 로그인 검사. 미들웨어는 proxy 경로를 건너뛰므로 라우트가 직접 부른다.
// 요청의 `token` 쿠키(authStore가 로그인 때 기록)를 백엔드 `GET /api/auth/me`(authenticated)에 Bearer로 보내 200이면 통과.
// 결과는 토큰별 60초 메모리 캐시 — 이 파일은 앱 서버 쪽 코드라 모듈 상태를 써도 된다(지도 패키지가 아니다).
//
// 서버 전용 환경 변수(NEXT_PUBLIC_ 이 아니라 브라우저 번들에 들어가지 않는다 — 이 파일은 app/proxy/**/route.ts 만 import 한다):
//   API_INTERNAL_URL    백엔드 주소(컨테이너 안에서 닿는 주소). 없으면 NEXT_PUBLIC_API_URL, 그것도 없으면 http://localhost:8080
//   PROXY_AUTH_DISABLED '1'이면 로그인 검사를 건너뛴다(비상용 스위치, 프로세스당 한 번 경고 로그). 기본은 검사함
// 환경 변수는 호출 때마다 읽는다(런타임 값 — 빌드 때 굳지 않는다).

const DEFAULT_API = 'http://localhost:8080'
/** 빌드 때 굳은 NEXT_PUBLIC_API_URL(옛 방식 — 런타임 환경에 없고 빌드 환경에만 있던 경우의 마지막 보루). 서버 번들에서만 쓰인다 */
const BUILD_TIME_API = process.env.NEXT_PUBLIC_API_URL

/** 검증 성공·거부 결과를 기억하는 시간 */
const VERDICT_TTL_MS = 60_000
/** 백엔드 오류·시간 초과(통과도 거부도 아닌 상태)를 기억하는 시간 — 백엔드가 죽었을 때 요청마다 다시 두드리지 않으려고 짧게 */
const UNAVAILABLE_TTL_MS = 5_000
const TIMEOUT_MS = 3_000
/** 백엔드를 못 부른 경우의 서버 로그 최소 간격 */
const WARN_INTERVAL_MS = 5_000
/** 캐시 최대 항목 수(무작위 토큰을 쏟아부어도 메모리가 무한히 늘지 않게) */
const MAX_ENTRIES = 500
/** 동시에 백엔드로 나가는 서로 다른 토큰 검증 수 상한 */
const MAX_INFLIGHT = 20
const MAX_TOKEN_LENGTH = 4096
/** JWT 모양(점 세 마디) — `Cookie: token=x` 같은 것은 백엔드에 묻지 않고 바로 거른다 */
const JWT_SHAPE = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/

export type AuthVerdict = 'ok' | 'denied' | 'unavailable'

export interface ProxyAuthDeps {
    fetchFn?: typeof fetch
    now?: () => number
    /** 지정하면 환경 변수 대신 이 주소를 쓴다(시험용) */
    apiBase?: string
    /** 환경 변수 대역(시험용). 기본 process.env */
    env?: Record<string, string | undefined>
    /** 서버 로그 출력(시험용). 기본 console.warn */
    warn?: (message: string) => void
}

interface CacheEntry {
    verdict: AuthVerdict
    expires: number
}

export interface ProxyAuth {
    verify(token: string): Promise<AuthVerdict>
    require(req: Request): Promise<NextResponse | null>
}

/** Cookie 헤더에서 token 값을 읽는다. 없거나 비었으면 null */
export function readTokenCookie(req: Request): string | null {
    const raw = req.headers.get('cookie')
    if (!raw) return null
    for (const part of raw.split(';')) {
        const i = part.indexOf('=')
        if (i < 0) continue
        if (part.slice(0, i).trim() === 'token') {
            const value = part.slice(i + 1).trim()
            return value === '' ? null : value
        }
    }
    return null
}

/**
 * 거절 응답 — 본문 모양을 VWorld 오류(response.status = ERROR)와 같게 둬 지도 패키지의 기존 판정(status !== 'OK')이 그대로 동작한다.
 * 상태는 401(백엔드를 못 부른 경우도 같다 — 지도 호스트는 onUnauthorized를 안 쓰므로 로그아웃되지 않는다)
 */
function unauthorized(code: string, text: string): NextResponse {
    return NextResponse.json(
        { response: { status: 'ERROR', error: { level: '1', code, text } } },
        { status: 401, headers: { 'Cache-Control': 'no-store' } },
    )
}

export function createProxyAuth(deps: ProxyAuthDeps = {}): ProxyAuth {
    const fetchFn: typeof fetch = deps.fetchFn ?? ((input, init) => fetch(input, init))
    const now = deps.now ?? Date.now
    const env = deps.env ?? process.env
    const warn = deps.warn ?? ((message: string): void => console.warn(message))
    const cache = new Map<string, CacheEntry>()
    const inflight = new Map<string, Promise<AuthVerdict>>()
    let disabledWarned = false
    let lastUnavailableWarn = Number.NEGATIVE_INFINITY

    const buildTimeApi = deps.env ? undefined : BUILD_TIME_API

    /** 백엔드 주소: 시험 주입 > API_INTERNAL_URL > NEXT_PUBLIC_API_URL(런타임, 없으면 빌드 때 값) > 기본값 (빈 문자열은 없는 것으로 본다) */
    function apiBase(): string {
        const raw = deps.apiBase || env.API_INTERNAL_URL || env.NEXT_PUBLIC_API_URL || buildTimeApi || DEFAULT_API
        return raw.replace(/\/+$/, '')
    }

    /** 로그에는 호스트만 적는다(경로·쿼리·계정 정보 제외) */
    function hostOf(base: string): string {
        try {
            return new URL(base).host
        } catch {
            return '(주소 해석 불가)'
        }
    }

    /** 오류 이름과 시스템 코드만(메시지에는 주소·헤더가 섞일 수 있어 쓰지 않는다 — 토큰·쿠키 절대 로그 금지) */
    function describeError(err: unknown): string {
        const e = err as { name?: unknown; cause?: { code?: unknown } } | null
        const name = typeof e?.name === 'string' ? e.name : 'Error'
        const code = typeof e?.cause?.code === 'string' ? e.cause.code : ''
        return code ? `${name} ${code}` : name
    }

    /** 백엔드를 못 부른 이유를 5초에 한 번 이하로 서버 로그에 남긴다 */
    function warnUnavailable(base: string, reason: string): void {
        const t = now()
        if (t - lastUnavailableWarn < WARN_INTERVAL_MS) return
        lastUnavailableWarn = t
        warn(`[proxy-auth] 백엔드 검증 호출 실패: ${hostOf(base)} (${reason})`)
    }

    function isDisabled(): boolean {
        if (env.PROXY_AUTH_DISABLED !== '1') return false
        if (!disabledWarned) {
            disabledWarned = true
            warn('[proxy-auth] PROXY_AUTH_DISABLED — 프록시 로그인 검사 꺼짐')
        }
        return true
    }

    function store(token: string, verdict: AuthVerdict): void {
        if (cache.size >= MAX_ENTRIES) {
            const t = now()
            for (const [k, e] of cache) if (e.expires <= t) cache.delete(k)
            // 아직 가득 차면 가장 오래 들어온 것부터 비운다(Map은 넣은 순서를 지킨다)
            for (const k of cache.keys()) {
                if (cache.size < MAX_ENTRIES) break
                cache.delete(k)
            }
        }
        cache.set(token, { verdict, expires: now() + (verdict === 'unavailable' ? UNAVAILABLE_TTL_MS : VERDICT_TTL_MS) })
    }

    async function ask(token: string): Promise<AuthVerdict> {
        const base = apiBase()
        try {
            const res = await fetchFn(`${base}/api/auth/me`, {
                headers: { Authorization: `Bearer ${token}` },
                cache: 'no-store',
                signal: AbortSignal.timeout(TIMEOUT_MS),
            })
            if (res.status >= 400 && res.status < 500) {
                void res.body?.cancel().catch(() => undefined)
                return 'denied'
            }
            if (!res.ok) {
                void res.body?.cancel().catch(() => undefined)
                warnUnavailable(base, `HTTP ${res.status}`)
                return 'unavailable'
            }
            const body = (await res.json()) as { success?: boolean } | null
            return body?.success === true ? 'ok' : 'denied'
        } catch (err) {
            // 연결 실패·시간 초과·본문 파싱 실패 — 통과시키지 않는다(fail closed)
            warnUnavailable(base, describeError(err))
            return 'unavailable'
        }
    }

    function verify(token: string): Promise<AuthVerdict> {
        if (token.length > MAX_TOKEN_LENGTH || !JWT_SHAPE.test(token)) return Promise.resolve('denied')
        const hit = cache.get(token)
        if (hit && hit.expires > now()) return Promise.resolve(hit.verdict)
        const pending = inflight.get(token)
        if (pending) return pending
        if (inflight.size >= MAX_INFLIGHT) {
            warnUnavailable(apiBase(), '동시 검증 한도 초과')
            return Promise.resolve('unavailable')
        }
        const p = ask(token)
            .then(verdict => {
                store(token, verdict)
                return verdict
            })
            .finally(() => {
                inflight.delete(token)
            })
        inflight.set(token, p)
        return p
    }

    return {
        verify,
        async require(req: Request): Promise<NextResponse | null> {
            if (isDisabled()) return null
            const token = readTokenCookie(req)
            if (!token) return unauthorized('UNAUTHORIZED', '로그인이 필요합니다.')
            const verdict = await verify(token)
            if (verdict === 'ok') return null
            if (verdict === 'unavailable') return unauthorized('AUTH_UNAVAILABLE', '로그인 확인에 실패했습니다. 잠시 후 다시 시도하세요.')
            return unauthorized('UNAUTHORIZED', '로그인이 필요합니다.')
        },
    }
}

const proxyAuth = createProxyAuth()

/**
 * 프록시 라우트 GET 맨 앞에서 부른다. 통과면 null, 아니면 그대로 돌려줄 401 응답:
 * `const denied = await requireLogin(req); if (denied) return denied`
 */
export function requireLogin(req: Request): Promise<NextResponse | null> {
    return proxyAuth.require(req)
}
