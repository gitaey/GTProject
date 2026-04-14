export type PostCategoryCode = 'DEV' | 'PARENTING' | 'DAILY'
export type PostStatusCode   = 'PUBLISHED' | 'DRAFT'

export const CATEGORY_OPTIONS: { value: PostCategoryCode; label: string }[] = [
    { value: 'DEV',       label: '개발' },
    { value: 'PARENTING', label: '육아' },
    { value: 'DAILY',     label: '일상' },
]

export const GRADIENT_PRESETS: { value: string; label: string }[] = [
    { value: 'from-blue-500 via-indigo-600 to-violet-700', label: '블루-인디고' },
    { value: 'from-pink-400 via-rose-400 to-orange-300',   label: '핑크-오렌지' },
    { value: 'from-emerald-500 via-teal-500 to-cyan-600',  label: '에메랄드' },
    { value: 'from-violet-500 via-purple-600 to-indigo-700', label: '바이올렛' },
    { value: 'from-amber-500 via-orange-500 to-red-400',   label: '앰버-레드' },
    { value: 'from-sky-500 via-blue-600 to-indigo-700',    label: '스카이-블루' },
    { value: 'from-yellow-400 via-orange-400 to-pink-400', label: '선셋' },
    { value: 'from-lime-400 via-green-500 to-emerald-600', label: '그린' },
]

export interface Post {
    id: number
    slug: string
    title: string
    excerpt: string | null
    content: string | null
    category: PostCategoryCode
    categoryLabel: string
    tags: string[]
    emoji: string | null
    gradient: string | null
    featured: boolean
    status: PostStatusCode
    statusLabel: string
    authorId: string | null
    createdAt: string
    updatedAt: string
}

export interface PostPage {
    content: Post[]
    totalElements: number
    totalPages: number
    number: number
    size: number
}

export interface PostFormState {
    slug: string
    title: string
    excerpt: string
    content: string
    category: PostCategoryCode
    tags: string          // 쉼표 구분 문자열로 입력
    emoji: string
    gradient: string
    featured: boolean
    status: PostStatusCode
}

export interface PostRequest {
    slug: string
    title: string
    excerpt?: string
    content?: string
    category: PostCategoryCode
    tags?: string[]
    emoji?: string
    gradient?: string
    featured: boolean
    status: PostStatusCode
}
