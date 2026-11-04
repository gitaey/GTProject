import Link from 'next/link'
import type { Post } from '@/types/post'
import { formatDate } from '../_lib/format'
import PostMeta from './PostMeta'

interface PostRowProps {
    post: Post
}

/** 목록 한 줄 — 줄 전체가 링크. 데스크톱은 [날짜 | 본문], 모바일은 카테고리·날짜 한 줄 위에 */
export default function PostRow({ post }: PostRowProps) {
    return (
        <li>
            <article>
                <Link href={`/blog/${post.slug}`} className="blog-row">
                    <div className="blog-row-date">{formatDate(post.createdAt)}</div>
                    <div>
                        <PostMeta categoryLabel={post.categoryLabel} createdAt={post.createdAt} className="blog-row-mmeta" />
                        <span className="blog-row-cat">{post.categoryLabel}</span>
                        <h3 className="blog-row-title">{post.title}</h3>
                        {post.excerpt && <p className="blog-row-excerpt">{post.excerpt}</p>}
                        {post.tags.length > 0 && (
                            <div className="blog-row-tags">{post.tags.slice(0, 3).map((t) => `#${t}`).join(' ')}</div>
                        )}
                    </div>
                </Link>
            </article>
        </li>
    )
}
