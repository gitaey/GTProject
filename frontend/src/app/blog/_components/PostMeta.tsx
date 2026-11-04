import type { ReactNode } from 'react'
import { formatDate } from '../_lib/format'

interface PostMetaProps {
    categoryLabel: string
    createdAt: string
    className?: string
    /** 날짜 뒤에 이어 붙일 항목(예: 대표 글의 태그) */
    children?: ReactNode
}

/** 카테고리(강조색 작은 글자) · 날짜 — 목록·대표·상세 공용 */
export default function PostMeta({ categoryLabel, createdAt, className, children }: PostMetaProps) {
    return (
        <div className={`blog-meta${className ? ` ${className}` : ''}`}>
            <span className="blog-meta-cat">{categoryLabel}</span>
            <span className="blog-meta-date">{formatDate(createdAt)}</span>
            {children}
        </div>
    )
}
