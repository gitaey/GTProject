'use client'

import { Search } from 'lucide-react'
import type { Category, PostCategoryCode } from '@/types/post'

interface FilterBarProps {
    categories: Category[]
    category: PostCategoryCode | ''
    keyword: string
    /** 위에 히어로가 없을 때(필터 중) 여백을 줄인다 */
    compact?: boolean
    countOf: (code: PostCategoryCode | '') => number
    onCategoryChange: (code: PostCategoryCode | '') => void
    onKeywordChange: (value: string) => void
}

export default function FilterBar({
    categories, category, keyword, compact, countOf, onCategoryChange, onKeywordChange,
}: FilterBarProps) {
    const tabs: { code: PostCategoryCode | ''; label: string }[] = [
        { code: '', label: '전체' },
        ...categories.map((c) => ({ code: c.code, label: c.label })),
    ]

    return (
        <div className={`blog-filterbar${compact ? ' blog-filterbar-top' : ''}`}>
            <div className="blog-tabs" role="group" aria-label="카테고리">
                {tabs.map(({ code, label }) => {
                    const n = countOf(code)
                    return (
                        <button
                            key={code || 'all'}
                            type="button"
                            className="blog-tab"
                            aria-pressed={category === code}
                            onClick={() => onCategoryChange(code)}
                        >
                            {label}
                            {n > 0 && <span className="blog-tab-n">{n}</span>}
                        </button>
                    )
                })}
            </div>
            <div className="blog-search">
                <Search size={16} className="blog-search-icon" aria-hidden="true" />
                <input
                    type="search"
                    aria-label="글 검색"
                    placeholder="제목·요약·태그 검색"
                    value={keyword}
                    onChange={(e) => onKeywordChange(e.target.value)}
                />
            </div>
        </div>
    )
}
