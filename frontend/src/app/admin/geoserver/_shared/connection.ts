import { getToken } from '@/stores/authStore'

// GeoServer 접속 설정·발행·스타일 화면이 함께 쓰는 연결 조각.
// 번호표(토큰)는 탭 단위 sessionStorage에만 둔다. 비밀번호는 어디에도 저장하지 않는다(입력 state에만).

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8080'

export const GS_CONNECTION_HEADER = 'X-GeoServer-Connection'
const SESSION_KEY = 'gtp-geoserver-connection'
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/
const DEFAULT_LOST_MESSAGE = 'GeoServer 연결이 없거나 만료되었습니다. 접속 설정에서 다시 연결하세요.'

export interface ConnectionStatus {
    url: string
    username: string
    version: string | null
    insecureTls: boolean
    connectedAt: string
    lastUsedAt: string
    expiresAt: string
    idleMinutes: number
}

export interface ConnectionAttempt {
    ok: boolean
    reason: string
    message: string
    normalizedUrl: string | null
    urlAdjusted: boolean
    version: string | null
    httpStatus: number | null
    redirectLocation: string | null
    token: string | null
    status: ConnectionStatus | null
}

export interface ConnectRequest {
    url: string
    username: string
    password: string
    insecureTls: boolean
}

/** 탭에 남기는 값 — 비밀번호 없음. 배지·다시 연결 대화상자 표시용 */
export interface StoredConnection {
    token: string
    url: string
    username: string
    version: string | null
    insecureTls: boolean
    connectedAt: string
}

/** 배지·안내에 쓰는 표시용 연결 정보 */
export interface ConnectionInfo {
    url: string
    username: string
    version: string | null
    insecureTls: boolean
}

/** 428 — 연결이 없거나 만료되었거나 GeoServer가 계정을 거부함 */
export class GeoServerConnectionLostError extends Error {}

export function readSession(): StoredConnection | null {
    try {
        const raw = sessionStorage.getItem(SESSION_KEY)
        if (!raw) return null
        const v: unknown = JSON.parse(raw)
        if (v && typeof v === 'object') {
            const o = v as Record<string, unknown>
            if (
                typeof o.token === 'string' && TOKEN_PATTERN.test(o.token) &&
                typeof o.url === 'string' && typeof o.username === 'string' &&
                typeof o.insecureTls === 'boolean' && typeof o.connectedAt === 'string' &&
                (o.version === null || typeof o.version === 'string')
            ) {
                return {
                    token: o.token, url: o.url, username: o.username,
                    version: o.version, insecureTls: o.insecureTls, connectedAt: o.connectedAt,
                }
            }
        }
        sessionStorage.removeItem(SESSION_KEY)
    } catch {
        // 저장소 차단·깨진 값 — 연결 없음으로 취급
    }
    return null
}

export function writeSession(token: string, s: ConnectionStatus): void {
    const value: StoredConnection = {
        token, url: s.url, username: s.username, version: s.version, insecureTls: s.insecureTls, connectedAt: s.connectedAt,
    }
    try {
        sessionStorage.setItem(SESSION_KEY, JSON.stringify(value))
    } catch {
        // 저장소 차단 — 이 탭에서 새로고침하면 연결이 풀린 것으로 보인다
    }
}

export function clearSession(): void {
    try {
        sessionStorage.removeItem(SESSION_KEY)
    } catch {
        // 무시
    }
}

function statusMessage(status: number): string {
    if (status === 401) return '로그인이 필요합니다.'
    if (status === 403) {
        return '권한이 없거나 로그인이 만료됐을 수 있습니다. 다시 로그인하거나 관리자(SUPER_ADMIN·MAP_ADMIN) 계정인지 확인하세요.'
    }
    return `오류가 발생했습니다 (HTTP ${status}).`
}

interface ApiJson {
    success?: boolean
    message?: string
    data?: unknown
}

async function readJson(res: Response): Promise<ApiJson | null> {
    try {
        const v: unknown = await res.json()
        return v && typeof v === 'object' ? (v as ApiJson) : null
    } catch {
        return null
    }
}

function buildHeaders(options: RequestInit | undefined, json: boolean): Record<string, string> {
    const token = getToken()
    const session = readSession()
    const headers: Record<string, string> = {
        ...((options?.headers as Record<string, string> | undefined) ?? {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(session ? { [GS_CONNECTION_HEADER]: session.token } : {}),
    }
    if (json) headers['Content-Type'] = 'application/json'
    return headers
}

async function send(path: string, init: RequestInit): Promise<Response> {
    try {
        return await fetch(`${API}${path}`, init)
    } catch {
        throw new Error('백엔드 서버에 요청하지 못했습니다. 네트워크를 확인하세요.')
    }
}

/** 백엔드 GeoServer API 호출 — 로그인 토큰 + 번호표 헤더. 428이면 번호표를 지우고 GeoServerConnectionLostError */
export async function gsFetch<T>(path: string, options?: RequestInit): Promise<T> {
    const headers = buildHeaders(options, typeof options?.body === 'string')
    const res = await send(path, { ...options, headers })
    const json = await readJson(res)
    if (res.status === 428) {
        clearSession()
        throw new GeoServerConnectionLostError(json?.message || DEFAULT_LOST_MESSAGE)
    }
    if (!json) throw new Error(statusMessage(res.status))
    if (!json.success) throw new Error(json.message || statusMessage(res.status))
    return json.data as T
}

/** 범례 PNG — POST 본문은 JSON, 응답은 이미지 */
export async function gsFetchBlob(path: string, body: unknown): Promise<Blob> {
    const headers = buildHeaders(undefined, true)
    const res = await send(path, { method: 'POST', headers, body: JSON.stringify(body) })
    if (res.status === 428) {
        const json = await readJson(res)
        clearSession()
        throw new GeoServerConnectionLostError(json?.message || DEFAULT_LOST_MESSAGE)
    }
    if (res.ok && (res.headers.get('content-type') ?? '').toLowerCase().startsWith('image/')) return res.blob()
    const json = await readJson(res)
    throw new Error(json?.message || statusMessage(res.status))
}

/** 연결 시험(save=false, 보관 안 함) 또는 연결(save=true, 번호표 발급). 실패 이유는 attempt.reason에 있다 */
export function requestConnection(save: boolean, req: ConnectRequest): Promise<ConnectionAttempt> {
    return gsFetch<ConnectionAttempt>(save ? '/api/geoserver/connection' : '/api/geoserver/connection/test', {
        method: 'POST',
        body: JSON.stringify(req),
    })
}

/** 'https://host:8443/geoserver' → 'host:8443/geoserver' */
export function serverLabel(url: string): string {
    return url.replace(/^https?:\/\//i, '')
}

export function formatDateTime(iso: string | null | undefined): string {
    if (!iso) return '—'
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return '—'
    const p = (n: number) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

export function formatClock(iso: string | null | undefined): string {
    if (!iso) return '—'
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return '—'
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

export function formatIdle(minutes: number): string {
    return minutes % 60 === 0 ? `${minutes / 60}시간` : `${minutes}분`
}
