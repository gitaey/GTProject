import type { Category, Post, PostCategoryCode, PostFormState, PostPage } from '@/types/post'
import { getToken } from '@/stores/authStore'
import { toPostRequest } from './postForm'

export const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8080'
export const POSTS_PAGE_SIZE = 20

export interface PostListQuery {
    category: PostCategoryCode | ''
    keyword: string
    tagFilter: string
}

export type FetchPostResult = { kind: 'ok'; post: Post } | { kind: 'notFound' }

interface Envelope<T> {
    success: boolean
    message?: string
    data?: T
}

async function readEnvelope<T>(res: Response): Promise<Envelope<T>> {
    try {
        return (await res.json()) as Envelope<T>
    } catch {
        throw new Error(`요청이 거절되었습니다 (HTTP ${res.status})`)
    }
}

function authHeaders(): Record<string, string> {
    const token = getToken()
    return token ? { Authorization: `Bearer ${token}` } : {}
}

/** 실패 시 throw */
export async function fetchCategories(): Promise<Category[]> {
    const res = await fetch(`${API}/api/categories`)
    const json = await res.json() as Envelope<Category[]>
    if (!json.success || !json.data) throw new Error(json.message ?? '카테고리를 불러오지 못했습니다.')
    return json.data
}

/** page는 0부터. 태그 필터는 keyword 파라미터로 보낸다(백엔드가 title·excerpt·tags를 LIKE 검색) */
export async function fetchPosts(q: PostListQuery, page: number, signal: AbortSignal): Promise<PostPage> {
    const params = new URLSearchParams({ size: String(POSTS_PAGE_SIZE) })
    if (page > 0)       params.set('page', String(page))
    if (q.category)     params.set('category', q.category)
    if (q.keyword)      params.set('keyword', q.keyword)
    if (q.tagFilter)    params.set('keyword', q.tagFilter)
    const res = await fetch(`${API}/api/posts?${params}`, { signal })
    const json = await res.json() as Envelope<RawPostPage>
    if (!json.success || !json.data) throw new Error(json.message ?? '글 목록을 불러오지 못했습니다.')
    return normalizePostPage(json.data)
}

/** Spring Data 3.3+는 { content, page: { size, number, totalElements, totalPages } }, 옛 형식은 같은 값이 최상위에 있다 */
interface RawPostPage {
    content: Post[]
    totalElements?: number
    totalPages?: number
    number?: number
    size?: number
    page?: { totalElements?: number; totalPages?: number; number?: number; size?: number }
}

function normalizePostPage(raw: RawPostPage): PostPage {
    const meta = raw.page ?? raw
    const content = raw.content ?? []
    return {
        content,
        totalElements: meta.totalElements ?? content.length,
        totalPages: meta.totalPages ?? 1,
        number: meta.number ?? 0,
        size: meta.size ?? POSTS_PAGE_SIZE,
    }
}

/** success=false는 notFound, 네트워크 오류·JSON 아님은 throw */
export async function fetchPost(slug: string): Promise<FetchPostResult> {
    const res = await fetch(`${API}/api/posts/${slug}`)
    const json = await res.json() as Envelope<Post>
    if (json.success && json.data) return { kind: 'ok', post: json.data }
    return { kind: 'notFound' }
}

export async function createPost(form: PostFormState): Promise<Post> {
    const res = await fetch(`${API}/api/posts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify(toPostRequest(form)),
    })
    const json = await readEnvelope<Post>(res)
    if (!json.success || !json.data) throw new Error(json.message || '작성에 실패했습니다.')
    return json.data
}

export async function updatePost(id: number, form: PostFormState): Promise<Post> {
    const res = await fetch(`${API}/api/posts/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify(toPostRequest(form)),
    })
    const json = await readEnvelope<Post>(res)
    if (!json.success || !json.data) throw new Error(json.message || '수정에 실패했습니다.')
    return json.data
}

/** 204·ok면 성공 */
export async function deletePost(id: number): Promise<void> {
    let res: Response
    try {
        res = await fetch(`${API}/api/posts/${id}`, { method: 'DELETE', headers: authHeaders() })
    } catch {
        throw new Error('서버에 연결할 수 없습니다.')
    }
    if (res.status === 204 || res.ok) return
    let message = '삭제에 실패했습니다.'
    try {
        const json = await res.json() as Envelope<unknown>
        if (json.message) message = json.message
    } catch {
        message = `요청이 거절되었습니다 (HTTP ${res.status})`
    }
    throw new Error(message)
}
