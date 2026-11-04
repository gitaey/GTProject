import { X } from 'lucide-react'
import type { Post } from '@/types/post'
import PostRow from './PostRow'

interface PostListProps {
    posts: Post[]
    heading: string
    count: number
    /** 태그·검색 같은 필터 머리말을 강조색 알약으로 */
    chip?: boolean
    showReset: boolean
    onReset: () => void
    dimmed?: boolean
}

export default function PostList({ posts, heading, count, chip, showReset, onReset, dimmed }: PostListProps) {
    return (
        <section>
            <div className="blog-list-head">
                <h2>
                    {chip ? <span className="blog-chip">{heading}</span> : heading}
                    <span className="blog-list-n">{count}</span>
                </h2>
                {showReset && (
                    <button type="button" className="blog-btn-text" onClick={onReset}>
                        <X size={16} aria-hidden="true" />
                        필터 해제
                    </button>
                )}
            </div>
            <ul className={`blog-rows${dimmed ? ' is-dim' : ''}`} aria-busy={dimmed || undefined}>
                {posts.map((p) => <PostRow key={p.id} post={p} />)}
            </ul>
        </section>
    )
}
