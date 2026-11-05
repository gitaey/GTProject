'use client'

import Link from 'next/link'
import { ArrowUpRight } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

/** 키보드 포커스 테두리(--accent). 링크·단추에 붙인다 */
export const FOCUS_RING =
    'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--accent)]'

export interface CardLink {
    href: string
    label: string
    /** true면 흐린 색(보조 링크) */
    muted?: boolean
}

export function CardLinkItem({ link }: { link: CardLink }) {
    return (
        <Link
            href={link.href}
            className={`inline-flex items-center gap-0.5 whitespace-nowrap rounded text-xs ${FOCUS_RING}`}
            style={{ color: link.muted ? 'var(--text-faint)' : 'var(--accent)' }}
        >
            {link.label}
            <ArrowUpRight size={12} aria-hidden="true" />
        </Link>
    )
}

interface DashboardCardProps {
    /** aria-labelledby용 고유 이름 */
    id: string
    title: string
    icon: LucideIcon
    links?: CardLink[]
    className?: string
    children: ReactNode
}

/** 카드 껍데기: 제목(h3)·오른쪽 링크·본문. 높이는 부모(grid)가 정하고 본문이 남는 칸을 채운다 */
export default function DashboardCard({ id, title, icon: Icon, links, className, children }: DashboardCardProps) {
    const titleId = `${id}-title`
    return (
        <section
            aria-labelledby={titleId}
            className={`flex h-full min-w-0 flex-col rounded-[10px] ${className ?? ''}`}
            style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}
        >
            <div
                className="flex items-center justify-between gap-3 px-4 py-2.5"
                style={{ borderBottom: '1px solid var(--border-subtle)' }}
            >
                <h3
                    id={titleId}
                    className="flex min-w-0 items-center gap-2 text-[13px] font-semibold"
                    style={{ color: 'var(--text-primary)' }}
                >
                    <Icon size={15} aria-hidden="true" className="shrink-0" style={{ color: 'var(--accent)' }} />
                    <span className="truncate">{title}</span>
                </h3>
                {links && links.length > 0 && (
                    <div className="flex shrink-0 items-center gap-3">
                        {links.map((l) => (
                            <CardLinkItem key={l.href + l.label} link={l} />
                        ))}
                    </div>
                )}
            </div>
            <div className="flex-1 px-4 py-3.5">{children}</div>
        </section>
    )
}

interface SectionHeadingProps {
    id: string
    title: string
    hint?: string
}

/** 구역 제목(h2) — "지도", "운영 현황" */
export function SectionHeading({ id, title, hint }: SectionHeadingProps) {
    return (
        <div className="flex items-baseline justify-between gap-3">
            <h2
                id={id}
                className="text-[13px] font-semibold tracking-wide"
                style={{ color: 'var(--text-secondary)' }}
            >
                {title}
            </h2>
            {hint && (
                <span className="hidden text-[11px] sm:inline" style={{ color: 'var(--text-faint)' }}>
                    {hint}
                </span>
            )}
        </div>
    )
}
