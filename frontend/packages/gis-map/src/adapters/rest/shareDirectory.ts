// 공유 상대 디렉터리 소스 — 짝 백엔드 api/gis/share-directory 계약(사용자 검색·공유 가능한 그룹 목록, 로그인만 필요).
// 이 경로가 없는 서버(옛 서버·다른 호스트)는 404·405를 돌려준다 → GisHttpError(상태 포함)를 던지고, 공유 화면이 아이디 직접 입력으로 바꾼다.
import { GisHttpError } from '../../core'
import type { ShareDirectorySource, ShareGroup, ShareUser, SourceContext } from '../../core'
import { apiUrl, readEnvelope } from './envelope'

/** 사용자 검색 기본·최대 건수(서버도 20으로 자른다) */
const DEFAULT_LIMIT = 10
const MAX_LIMIT = 20

/** 로그인 정보가 없거나 만료됐을 때(본문 없는 401·403) */
const AUTH_MESSAGE = '로그인이 필요하거나 권한이 없습니다.'

function str(v: unknown): string | null {
    return typeof v === 'string' && v !== '' ? v : null
}

export function restShareDirectory(ctx: SourceContext): ShareDirectorySource {
    const url = (path: string) => apiUrl(ctx.host(), '/api/gis/share-directory' + path)

    /**
     * 경로가 없는 서버(404·405)만 상태가 보이는 GisHttpError로, 나머지는 봉투의 message로 던진다.
     * 토큰이 없으면 스프링이 봉투 없이 401·403을 주므로(본문 없음) 그때는 읽을 수 있는 문구로 던진다
     */
    async function read<T>(res: Response): Promise<T> {
        if (res.status === 404 || res.status === 405) throw new GisHttpError(res.status, `HTTP ${res.status} ${res.url}`)
        return readEnvelope<T>(res, res.status === 401 || res.status === 403 ? AUTH_MESSAGE : undefined)
    }

    return {
        async searchUsers(query: string, opts?: { limit?: number }): Promise<ShareUser[]> {
            const limit = Math.max(1, Math.min(MAX_LIMIT, Math.floor(opts?.limit ?? DEFAULT_LIMIT)))
            const data = await read<Array<Partial<ShareUser>> | null>(
                await ctx.http.fetch(url(`/users?q=${encodeURIComponent(query)}&limit=${limit}`)),
            )
            return (data ?? [])
                .filter(u => typeof u.userId === 'string' && u.userId !== '')
                .map(u => ({ userId: u.userId as string, name: str(u.name), groupLabel: str(u.groupLabel) }))
        },

        async listGroups(): Promise<ShareGroup[]> {
            const data = await read<Array<Partial<ShareGroup>> | null>(await ctx.http.fetch(url('/groups')))
            return (data ?? [])
                .filter(g => typeof g.code === 'string' && g.code !== '')
                .map(g => ({ code: g.code as string, label: str(g.label) ?? (g.code as string), parentCode: str(g.parentCode) }))
        },
    }
}
