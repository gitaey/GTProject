'use client'

import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react'

interface PaginationProps {
    currentPage: number  // 0-based
    totalPages: number
    onChange: (page: number) => void
}

export default function Pagination({ currentPage, totalPages, onChange }: PaginationProps) {
    if (totalPages <= 1) return null

    const WINDOW = 5
    const half = Math.floor(WINDOW / 2)
    let start = Math.max(0, currentPage - half)
    const end = Math.min(totalPages, start + WINDOW)
    if (end - start < WINDOW) start = Math.max(0, end - WINDOW)
    const pages = Array.from({ length: end - start }, (_, i) => start + i)

    const iconBtn = "flex items-center justify-center w-8 h-8 rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed"

    return (
        <div className="flex items-center justify-center gap-1">
            <button onClick={() => onChange(0)} disabled={currentPage === 0}
                className={iconBtn} style={{ color: 'var(--text-muted)' }} title="첫 페이지">
                <ChevronsLeft size={16} />
            </button>
            <button onClick={() => onChange(currentPage - 1)} disabled={currentPage === 0}
                className={iconBtn} style={{ color: 'var(--text-muted)' }} title="이전 페이지">
                <ChevronLeft size={16} />
            </button>

            {pages.map(p => (
                <button key={p} onClick={() => onChange(p)}
                    className="flex items-center justify-center w-8 h-8 rounded-lg text-sm font-medium transition-colors"
                    style={{
                        background: currentPage === p ? 'var(--accent)' : 'transparent',
                        color: currentPage === p ? '#fff' : 'var(--text-muted)',
                    }}>
                    {p + 1}
                </button>
            ))}

            <button onClick={() => onChange(currentPage + 1)} disabled={currentPage === totalPages - 1}
                className={iconBtn} style={{ color: 'var(--text-muted)' }} title="다음 페이지">
                <ChevronRight size={16} />
            </button>
            <button onClick={() => onChange(totalPages - 1)} disabled={currentPage === totalPages - 1}
                className={iconBtn} style={{ color: 'var(--text-muted)' }} title="마지막 페이지">
                <ChevronsRight size={16} />
            </button>
        </div>
    )
}
