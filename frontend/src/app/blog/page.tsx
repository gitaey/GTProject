'use client'

import { useState } from 'react'
import { CloudOff, RotateCcw } from 'lucide-react'
import type { PostFormState } from '@/types/post'
import { useAuthStore } from '@/stores/authStore'
import BlogMasthead from './_components/BlogMasthead'
import BlogFooter from './_components/BlogFooter'
import HeroIntro from './_components/HeroIntro'
import FeaturedPost from './_components/FeaturedPost'
import FilterBar from './_components/FilterBar'
import PostList from './_components/PostList'
import TagIndex from './_components/TagIndex'
import { EmptyState, ErrorState } from './_components/StatusBlocks'
import { ListSkeleton } from './_components/Skeletons'
import PostEditorModal from './_components/PostEditorModal'
import { createPost } from './_lib/api'
import { EMPTY_FORM } from './_lib/postForm'
import { FALLBACK_CATEGORIES } from './_lib/useCategories'
import { usePostList } from './_lib/usePostList'

export default function BlogPage() {
    const { user } = useAuthStore()
    const isSuperAdmin = user?.role === 'SUPER_ADMIN'
    const list = usePostList()
    const [createOpen, setCreateOpen] = useState(false)

    const { category, keyword, tagFilter, isFiltered, featured, rest, status } = list
    /* 작성 모달 카테고리: 목록이 이미 받은 API 카테고리(추가 요청 없음), 못 받았으면 고정 3개 */
    const editorCategories = list.categories.length > 0 ? list.categories : FALLBACK_CATEGORIES

    const handleCreate = async (form: PostFormState) => {
        await createPost(form)
        setCreateOpen(false)
        list.reload()
    }

    /* 목록 머리: 필터가 있으면 그 이름, 없으면 "글 목록". 개수는 전체 건수(대표 글 제외) */
    let heading = '글 목록'
    if (tagFilter) heading = `#${tagFilter}`
    else if (keyword) heading = `‘${keyword}’ 검색 결과`
    else if (category) heading = list.categories.find((c) => c.code === category)?.label ?? category
    const count = Math.max(0, list.totalElements - (featured ? 1 : 0))
    const hasSearchFilter = !!(keyword || tagFilter)

    const emptyDescription = tagFilter
        ? `#${tagFilter} 태그의 글이 없습니다.`
        : keyword ? `‘${keyword}’와 맞는 글을 찾지 못했습니다.` : undefined

    return (
        <>
            <BlogMasthead isSuperAdmin={isSuperAdmin} onCreate={() => setCreateOpen(true)} />

            <main className="blog-wrap">
                {!isFiltered && (
                    <HeroIntro title="기빵의 블로그" description="개발 이야기, 육아 일기, 그리고 일상을 기록합니다." />
                )}
                {featured && <FeaturedPost post={featured} />}

                <FilterBar
                    categories={list.categories}
                    category={category}
                    keyword={keyword}
                    compact={isFiltered}
                    countOf={list.countOf}
                    onCategoryChange={list.selectCategory}
                    onKeywordChange={list.changeKeyword}
                />
                <div className="blog-progress" aria-live="polite">
                    {list.refreshing && (
                        <>
                            <div className="blog-progress-bar" aria-hidden="true" />
                            <span className="blog-sr">불러오는 중</span>
                        </>
                    )}
                </div>

                {status === 'loading' && <ListSkeleton />}

                {status === 'error' && (
                    <ErrorState
                        title="글 목록을 불러오지 못했습니다"
                        description="잠시 후 다시 시도해 주세요."
                        onRetry={list.reload}
                    />
                )}

                {status === 'ready' && (
                    <>
                        {list.refreshFailed && (
                            <div className="blog-notice" role="alert">
                                <CloudOff size={16} aria-hidden="true" />
                                새 목록을 불러오지 못했습니다.
                                <button type="button" className="blog-btn-text" onClick={list.reload}>
                                    <RotateCcw size={16} aria-hidden="true" />
                                    다시 시도
                                </button>
                            </div>
                        )}

                        {list.posts.length === 0 && (
                            <EmptyState
                                description={emptyDescription}
                                onReset={hasSearchFilter ? list.resetFilters : undefined}
                            />
                        )}

                        {rest.length > 0 && (
                            <PostList
                                posts={rest}
                                heading={heading}
                                count={count}
                                chip={!!tagFilter}
                                showReset={hasSearchFilter}
                                onReset={list.resetFilters}
                                dimmed={list.refreshing}
                            />
                        )}

                        {list.hasMore && (
                            <div className="blog-more">
                                <button
                                    type="button"
                                    className="blog-btn blog-btn-ghost"
                                    onClick={list.loadMore}
                                    disabled={list.loadingMore}
                                >
                                    {list.loadingMore ? '불러오는 중...' : list.loadMoreFailed ? '다시 시도' : '더 보기'}
                                </button>
                                {list.loadMoreFailed && <span role="alert">글을 더 불러오지 못했습니다.</span>}
                            </div>
                        )}

                        {list.allTags.length > 0 && (
                            <TagIndex
                                tags={list.allTags}
                                activeTag={tagFilter}
                                showReset={hasSearchFilter}
                                onSelect={list.selectTag}
                                onReset={list.resetFilters}
                            />
                        )}
                    </>
                )}
            </main>

            <BlogFooter />

            {isSuperAdmin && (
                <PostEditorModal
                    open={createOpen}
                    mode="create"
                    initialForm={EMPTY_FORM}
                    categories={editorCategories}
                    onClose={() => setCreateOpen(false)}
                    onSubmit={handleCreate}
                />
            )}
        </>
    )
}
