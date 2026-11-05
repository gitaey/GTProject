'use client'

import Link from 'next/link'
import { FileText } from 'lucide-react'
import { apiGet, devFailLoader } from './api'
import { CardEmpty, CardError, CardSkeleton } from './CardState'
import DashboardCard, { FOCUS_RING } from './DashboardCard'
import type { CardLink } from './DashboardCard'
import { useResource } from './useResource'

interface PostItem {
    id: number
    slug: string
    title: string
    categoryLabel: string
    createdAt: string
}

interface PostPage {
    content: PostItem[]
}

const POST_COUNT = 4

const loadPosts = (signal: AbortSignal): Promise<PostItem[]> =>
    apiGet<PostPage | null>(`/api/posts?page=0&size=${POST_COUNT}`, { signal }).then((page) => page?.content ?? [])

interface RecentPostsCardProps {
    /** sidebar.blog-admin이 있을 때만 "관리" 링크 */
    canManage: boolean
    /** 개발 전용 ?dashFail=posts */
    forceFail: boolean
}

export default function RecentPostsCard({ canManage, forceFail }: RecentPostsCardProps) {
    const posts = useResource<PostItem[]>('posts', forceFail ? devFailLoader : loadPosts)

    const links: CardLink[] = [{ href: '/blog', label: '블로그', muted: true }]
    if (canManage) links.push({ href: '/admin/blog', label: '관리' })

    return (
        <DashboardCard id="card-posts" title="최근 게시글" icon={FileText} links={links}>
            {posts.status === 'loading' && <CardSkeleton lines={4} />}
            {posts.status === 'error' && <CardError message={posts.error ?? ''} onRetry={posts.reload} />}
            {posts.status === 'success' && (posts.data ?? []).length === 0 && (
                <CardEmpty text="발행된 게시글이 없습니다" />
            )}
            {posts.status === 'success' && (posts.data ?? []).length > 0 && (
                <ul className="flex flex-col gap-3">
                    {(posts.data ?? []).map((post) => (
                        <li key={post.id} className="min-w-0 text-xs">
                            <Link
                                href={`/blog/${encodeURIComponent(post.slug)}`}
                                className={`block truncate rounded ${FOCUS_RING}`}
                                style={{ color: 'var(--text-primary)' }}
                            >
                                {post.title}
                            </Link>
                            <span style={{ color: 'var(--text-faint)' }}>
                                {post.categoryLabel} · {post.createdAt?.slice(0, 10)}
                            </span>
                        </li>
                    ))}
                </ul>
            )}
        </DashboardCard>
    )
}
