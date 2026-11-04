'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { ArrowLeft, PenLine, Trash2 } from 'lucide-react'
import type { PostFormState } from '@/types/post'
import { useAuthStore } from '@/stores/authStore'
import BlogMasthead from '../_components/BlogMasthead'
import BlogFooter from '../_components/BlogFooter'
import PostMeta from '../_components/PostMeta'
import GradientMark from '../_components/GradientMark'
import MarkdownBody from '../_components/MarkdownBody'
import { ErrorState, NotFoundState } from '../_components/StatusBlocks'
import { ArticleSkeleton } from '../_components/Skeletons'
import PostEditorModal from '../_components/PostEditorModal'
import DeletePostDialog from '../_components/DeletePostDialog'
import { deletePost, updatePost } from '../_lib/api'
import { formFromPost } from '../_lib/postForm'
import { useCategories, withCurrentCategory } from '../_lib/useCategories'
import { usePost } from '../_lib/usePost'

export default function BlogPostPage() {
    const params = useParams()
    const router = useRouter()
    const slug   = params.slug as string
    const { user } = useAuthStore()
    const isSuperAdmin = user?.role === 'SUPER_ADMIN'

    const { post, status, replacePost, reload } = usePost(slug)
    const [editOpen, setEditOpen]     = useState(false)
    const [deleteOpen, setDeleteOpen] = useState(false)
    /* 카테고리는 수정 단추를 처음 누를 때 한 번만 부른다. 실패하면 고정 3개 */
    const [editRequested, setEditRequested] = useState(false)
    const { categories } = useCategories({ enabled: editRequested, fallback: true })
    const editorCategories = post ? withCurrentCategory(categories, post.category, post.categoryLabel) : categories

    const openEditor = () => {
        setEditRequested(true)
        setEditOpen(true)
    }

    const handleUpdate = async (form: PostFormState) => {
        if (!post) return
        const updated = await updatePost(post.id, form)
        replacePost(updated)
        setEditOpen(false)
    }

    const handleDelete = async () => {
        if (!post) return
        await deletePost(post.id)
        router.push('/blog')
    }

    return (
        <>
            <BlogMasthead isSuperAdmin={isSuperAdmin} showBackToList />

            <main className="blog-wrap">
                {status === 'loading' && <ArticleSkeleton />}

                {status === 'notFound' && <NotFoundState />}

                {status === 'error' && (
                    <ErrorState
                        title="글을 불러오지 못했습니다"
                        description="서버에 연결할 수 없습니다. 잠시 후 다시 시도해 주세요."
                        onRetry={reload}
                        tall
                    >
                        <Link href="/blog" className="blog-btn blog-btn-ghost">
                            <ArrowLeft size={16} aria-hidden="true" />
                            목록으로
                        </Link>
                    </ErrorState>
                )}

                {status === 'ready' && post && (
                    <article className="blog-article">
                        <div className="blog-art-top">
                            <PostMeta categoryLabel={post.categoryLabel} createdAt={post.createdAt} />
                            {isSuperAdmin && (
                                <div className="blog-adm">
                                    <button type="button" onClick={openEditor}>
                                        <PenLine size={14} aria-hidden="true" />
                                        수정
                                    </button>
                                    <button type="button" className="blog-adm-del" onClick={() => setDeleteOpen(true)}>
                                        <Trash2 size={14} aria-hidden="true" />
                                        삭제
                                    </button>
                                </div>
                            )}
                        </div>
                        <GradientMark gradient={post.gradient} />
                        <h1 className="blog-title">{post.title}</h1>
                        {post.excerpt && <p className="blog-dek">{post.excerpt}</p>}
                        {post.tags.length > 0 && (
                            <div className="blog-art-tags">
                                {post.tags.map((tag) => <span key={tag}>#{tag}</span>)}
                            </div>
                        )}
                        <div className="blog-rule" />
                        {post.content
                            ? <MarkdownBody content={post.content} />
                            : <p className="blog-empty-body">본문이 없습니다.</p>}
                        <div className="blog-rule" />
                        <div className="blog-endnav">
                            <Link href="/blog" className="blog-btn blog-btn-ghost">
                                <ArrowLeft size={16} aria-hidden="true" />
                                목록으로
                            </Link>
                        </div>
                    </article>
                )}
            </main>

            <BlogFooter />

            {isSuperAdmin && post && (
                <>
                    <PostEditorModal
                        open={editOpen}
                        mode="edit"
                        initialForm={formFromPost(post)}
                        categories={editorCategories}
                        onClose={() => setEditOpen(false)}
                        onSubmit={handleUpdate}
                    />
                    <DeletePostDialog
                        open={deleteOpen}
                        postTitle={post.title}
                        onClose={() => setDeleteOpen(false)}
                        onConfirm={handleDelete}
                    />
                </>
            )}
        </>
    )
}
