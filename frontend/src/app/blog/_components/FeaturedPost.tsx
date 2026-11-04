import Link from 'next/link'
import { Star } from 'lucide-react'
import type { Post } from '@/types/post'
import GradientMark from './GradientMark'
import PostMeta from './PostMeta'

interface FeaturedPostProps {
    post: Post
}

export default function FeaturedPost({ post }: FeaturedPostProps) {
    return (
        <section className="blog-featured" aria-label="추천 글">
            <article>
                <Link href={`/blog/${post.slug}`} className="blog-featured-link">
                    <span className="blog-kicker">
                        <Star size={14} aria-hidden="true" />
                        추천 글
                    </span>
                    <GradientMark gradient={post.gradient} />
                    <h2 className="blog-featured-title">{post.title}</h2>
                    {post.excerpt && <p className="blog-lead blog-featured-lead">{post.excerpt}</p>}
                    <PostMeta categoryLabel={post.categoryLabel} createdAt={post.createdAt}>
                        {post.tags.length > 0 && (
                            <span className="blog-meta-tags blog-tags-text">
                                {post.tags.slice(0, 3).map((t) => `#${t}`).join(' ')}
                            </span>
                        )}
                    </PostMeta>
                </Link>
            </article>
        </section>
    )
}
