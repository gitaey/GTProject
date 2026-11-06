// 저장한 GeoServer 목록 — localStorage. 이름·주소·아이디·인증서 옵션만 저장한다(비밀번호 필드 없음).
// 저장소 차단·깨진 값이어도 예외를 밖으로 내지 않는다(목록이 빈 채로 화면은 정상 동작).

const STORAGE_KEY = 'gtp-geoserver-servers'
const MAX_SERVERS = 30

export interface SavedServer {
    id: string
    name: string
    url: string
    username: string
    insecureTls: boolean
    lastConnectedAt: string | null
}

export interface SavedServerInput {
    name: string
    url: string
    username: string
    insecureTls: boolean
}

function newId(): string {
    try {
        if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID()
    } catch {
        // 아래 대체 값 사용
    }
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

/** 알려진 필드만 골라 담는다 — 손으로 넣은 password 같은 필드는 다시 쓸 때 사라진다 */
function sanitize(v: unknown): SavedServer | null {
    if (!v || typeof v !== 'object') return null
    const o = v as Record<string, unknown>
    if (typeof o.id !== 'string' || typeof o.url !== 'string' || typeof o.username !== 'string') return null
    if (!o.id || !o.url || !o.username) return null
    return {
        id: o.id,
        name: typeof o.name === 'string' ? o.name : '',
        url: o.url,
        username: o.username,
        insecureTls: o.insecureTls === true,
        lastConnectedAt: typeof o.lastConnectedAt === 'string' ? o.lastConnectedAt : null,
    }
}

function read(): SavedServer[] {
    try {
        const raw = localStorage.getItem(STORAGE_KEY)
        if (!raw) return []
        const v: unknown = JSON.parse(raw)
        if (!v || typeof v !== 'object') return []
        const list = (v as { servers?: unknown }).servers
        if (!Array.isArray(list)) return []
        return list.map(sanitize).filter((s): s is SavedServer => s !== null).slice(0, MAX_SERVERS)
    } catch {
        return []
    }
}

function write(servers: SavedServer[]): SavedServer[] {
    let next = servers
    if (next.length > MAX_SERVERS) {
        // 가장 오래 연결한(또는 한 번도 안 한) 것부터 정리
        const keep = [...next].sort((a, b) => (b.lastConnectedAt ?? '').localeCompare(a.lastConnectedAt ?? ''))
        const keepIds = new Set(keep.slice(0, MAX_SERVERS).map(s => s.id))
        next = next.filter(s => keepIds.has(s.id))
    }
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ v: 1, servers: next }))
    } catch {
        // 저장 실패 — 화면에는 이번 값이 보이되 새로고침하면 사라진다
    }
    return next
}

function defaultName(url: string): string {
    return url.replace(/^https?:\/\//i, '')
}

export function listServers(): SavedServer[] {
    return read()
}

/** 같은 주소+아이디면 갱신, 아니면 추가. 연결에 성공했을 때 부르므로 마지막 연결 시각도 기록 */
export function upsertServer(input: SavedServerInput): SavedServer[] {
    const list = read()
    const now = new Date().toISOString()
    const name = input.name.trim()
    const i = list.findIndex(s => s.url === input.url && s.username === input.username)
    if (i >= 0) {
        list[i] = { ...list[i], name: name || list[i].name || defaultName(input.url), insecureTls: input.insecureTls, lastConnectedAt: now }
    } else {
        list.push({
            id: newId(), name: name || defaultName(input.url), url: input.url, username: input.username,
            insecureTls: input.insecureTls, lastConnectedAt: now,
        })
    }
    return write(list)
}

export function updateServer(id: string, patch: SavedServerInput): SavedServer[] {
    const list = read().map(s =>
        s.id === id
            ? {
                ...s,
                name: patch.name.trim() || defaultName(patch.url.trim()),
                url: patch.url.trim(),
                username: patch.username.trim(),
                insecureTls: patch.insecureTls,
            }
            : s,
    )
    return write(list)
}

export function removeServer(id: string): SavedServer[] {
    return write(read().filter(s => s.id !== id))
}

export function touchServer(url: string, username: string): SavedServer[] {
    const now = new Date().toISOString()
    return write(read().map(s => (s.url === url && s.username === username ? { ...s, lastConnectedAt: now } : s)))
}
