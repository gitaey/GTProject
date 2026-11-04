import type { ReactNode } from 'react'
import Link from 'next/link'
import { ArrowLeft, CloudOff, FileQuestion, RotateCcw, Search, X } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

interface StatusBlockProps {
    icon: LucideIcon
    title: string
    description?: string
    tall?: boolean
    alert?: boolean
    children?: ReactNode
}

function StatusBlock({ icon: Icon, title, description, tall, alert, children }: StatusBlockProps) {
    return (
        <div className={`blog-status${tall ? ' blog-status-tall' : ''}`} role={alert ? 'alert' : undefined}>
            <span className="blog-status-icon">
                <Icon size={32} strokeWidth={1.6} aria-hidden="true" />
            </span>
            <h2>{title}</h2>
            {description && <p>{description}</p>}
            {children && <div className="blog-status-acts">{children}</div>}
        </div>
    )
}

interface EmptyStateProps {
    description?: string
    onReset?: () => void
}

/** 목록 결과 0개 — 필터 해제 단추는 검색어·태그가 있을 때만 onReset을 넘겨 보인다 */
export function EmptyState({ description, onReset }: EmptyStateProps) {
    return (
        <StatusBlock icon={Search} title="글이 없습니다" description={description}>
            {onReset && (
                <button type="button" className="blog-btn blog-btn-ghost" onClick={onReset}>
                    <X size={16} aria-hidden="true" />
                    필터 해제
                </button>
            )}
        </StatusBlock>
    )
}

interface ErrorStateProps {
    title: string
    description?: string
    onRetry: () => void
    tall?: boolean
    children?: ReactNode
}

export function ErrorState({ title, description, onRetry, tall, children }: ErrorStateProps) {
    return (
        <StatusBlock icon={CloudOff} title={title} description={description} tall={tall} alert>
            <button type="button" className="blog-btn blog-btn-ink" onClick={onRetry}>
                <RotateCcw size={16} aria-hidden="true" />
                다시 시도
            </button>
            {children}
        </StatusBlock>
    )
}

export function NotFoundState() {
    return (
        <StatusBlock
            icon={FileQuestion}
            title="글을 찾을 수 없습니다"
            description="삭제되었거나 비공개(임시저장)로 바뀐 글일 수 있습니다."
            tall
        >
            <Link href="/blog" className="blog-btn blog-btn-ghost">
                <ArrowLeft size={16} aria-hidden="true" />
                목록으로
            </Link>
        </StatusBlock>
    )
}
