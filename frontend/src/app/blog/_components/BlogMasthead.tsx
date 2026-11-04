'use client'

import Link from 'next/link'
import { ArrowLeft, LayoutDashboard, PenLine } from 'lucide-react'
import ThemeToggle from './ThemeToggle'

interface BlogMastheadProps {
    isSuperAdmin: boolean
    onCreate?: () => void
    showBackToList?: boolean
}

export default function BlogMasthead({ isSuperAdmin, onCreate, showBackToList }: BlogMastheadProps) {
    return (
        <header className="blog-mast">
            <div className="blog-mast-in">
                <Link href="/blog" className="blog-wordmark">
                    <span className="blog-wm">기빵 블로그</span>
                    <span className="blog-wm-sub">개발 · 육아 · 일상</span>
                </Link>
                <div className="blog-mast-act">
                    {showBackToList && (
                        <Link href="/blog" className="blog-icon-btn" aria-label="목록">
                            <ArrowLeft size={16} aria-hidden="true" />
                            <span className="blog-lbl">목록</span>
                        </Link>
                    )}
                    <ThemeToggle />
                    {isSuperAdmin && onCreate && (
                        <button type="button" className="blog-btn blog-btn-ink" onClick={onCreate} aria-label="글쓰기">
                            <PenLine size={16} aria-hidden="true" />
                            <span className="blog-lbl">글쓰기</span>
                        </button>
                    )}
                    <Link href="/" className="blog-icon-btn" aria-label="대시보드">
                        <LayoutDashboard size={16} aria-hidden="true" />
                        <span className="blog-lbl">대시보드</span>
                    </Link>
                </div>
            </div>
        </header>
    )
}
