'use client'

import { Inbox, Lock, RefreshCw, TriangleAlert } from 'lucide-react'
import { FOCUS_RING } from './DashboardCard'

/** 불러오는 중 뼈대 한 줄 */
export function SkeletonBar({ className }: { className?: string }) {
    return <div className={`animate-pulse rounded-md ${className ?? ''}`} style={{ background: 'var(--border)' }} />
}

interface CardSkeletonProps {
    /** 줄 수(첫 줄은 큰 숫자 자리). 기본 3 */
    lines?: number
}

export function CardSkeleton({ lines = 3 }: CardSkeletonProps) {
    return (
        <div aria-busy="true">
            <span className="sr-only">불러오는 중</span>
            {Array.from({ length: lines }, (_, i) => (
                <SkeletonBar
                    key={i}
                    className={i === 0 ? 'h-[22px] w-[45%]' : 'mt-2 h-2.5'}
                />
            ))}
        </div>
    )
}

interface CardErrorProps {
    message: string
    onRetry: () => void
}

/** 실패 — 숫자 자리에는 호출한 쪽이 '—'를 둔다(0으로 보이지 않게) */
export function CardError({ message, onRetry }: CardErrorProps) {
    return (
        <div role="status" aria-live="polite" className="flex items-start gap-2.5 text-xs" style={{ color: 'var(--text-muted)' }}>
            <TriangleAlert size={16} aria-hidden="true" className="mt-0.5 shrink-0" style={{ color: '#ef4444' }} />
            <div className="min-w-0">
                <b className="block text-[12.5px] font-semibold" style={{ color: 'var(--text-primary)' }}>
                    불러오지 못했습니다
                </b>
                <span className="break-words">{message}</span>
                <div>
                    <button
                        type="button"
                        onClick={onRetry}
                        className={`mt-1.5 inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11.5px] ${FOCUS_RING}`}
                        style={{
                            border: '1px solid var(--border)',
                            background: 'var(--bg-card)',
                            color: 'var(--text-secondary)',
                        }}
                    >
                        <RefreshCw size={12} aria-hidden="true" />
                        다시 시도
                    </button>
                </div>
            </div>
        </div>
    )
}

/** 성공했지만 비어 있음 — 실패와 구별되는 문구 */
export function CardEmpty({ text }: { text: string }) {
    return (
        <p className="flex items-center gap-2 text-xs" style={{ color: 'var(--text-faint)' }}>
            <Inbox size={14} aria-hidden="true" className="shrink-0" />
            {text}
        </p>
    )
}

/** 권한 확인 중 뼈대(지도 칸 + 현황 4칸 모양) — 이 동안 API는 하나도 부르지 않는다 */
export function DashboardSkeleton() {
    return (
        <div aria-busy="true">
            <div className="grid grid-cols-12 gap-4">
                <div className="col-span-12 min-w-0 xl:col-span-7 min-[1400px]:col-span-8">
                    <SkeletonBar className="h-[300px] rounded-xl lg:h-[340px] xl:h-[360px] min-[1400px]:h-[380px]" />
                </div>
                <div className="col-span-12 grid min-w-0 grid-cols-2 gap-3 lg:grid-cols-4 xl:col-span-5 xl:grid-cols-2 xl:gap-4 min-[1400px]:col-span-4">
                    {[0, 1, 2, 3].map((i) => (
                        <SkeletonBar key={i} className="h-[110px] rounded-[10px] xl:h-[182px]" />
                    ))}
                </div>
            </div>
            <p className="mt-4 text-xs" style={{ color: 'var(--text-faint)' }}>
                메뉴 권한을 확인하는 중입니다…
            </p>
        </div>
    )
}

/** 보여 줄 구역이 하나도 없을 때(권한 없음 또는 메뉴 권한 API 실패) */
export function DashboardNoAccess() {
    return (
        <section
            className="rounded-[10px] px-4 py-10 text-center text-[13px]"
            style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}
        >
            <span
                className="mx-auto mb-2.5 flex h-10 w-10 items-center justify-center rounded-lg"
                style={{ background: 'var(--accent-bg)', color: 'var(--accent)' }}
            >
                <Lock size={18} aria-hidden="true" />
            </span>
            <b className="block" style={{ color: 'var(--text-primary)' }}>
                볼 수 있는 항목이 없습니다
            </b>
            메뉴 권한이 없거나 권한 정보를 불러오지 못했습니다. 관리자에게 문의하세요.
        </section>
    )
}
