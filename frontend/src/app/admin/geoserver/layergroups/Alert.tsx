'use client'

import { AlertTriangle, CheckCircle2, Info, XCircle } from 'lucide-react'

export type AlertTone = 'err' | 'warn' | 'ok' | 'info'

interface AlertProps {
    tone: AlertTone
    /** 굵은 한 줄 제목(선택) */
    title?: string
    children?: React.ReactNode
    /** 오른쪽 단추 자리(선택) */
    action?: React.ReactNode
    /** 안쪽 여백을 줄인 작은 모양 */
    compact?: boolean
}

const TONES: Record<AlertTone, { bg: string; border: string; icon: string }> = {
    err: { bg: 'rgba(239,68,68,0.08)', border: 'rgba(239,68,68,0.25)', icon: '#ef4444' },
    warn: { bg: 'rgba(245,158,11,0.1)', border: 'rgba(245,158,11,0.4)', icon: '#b45309' },
    ok: { bg: 'rgba(16,185,129,0.1)', border: 'rgba(16,185,129,0.25)', icon: '#10b981' },
    info: { bg: 'rgba(59,130,246,0.08)', border: 'rgba(59,130,246,0.25)', icon: '#2563eb' },
}

/** 이 화면의 안내·경고·오류 상자 — 색은 한 곳에서만 정한다 */
export default function Alert({ tone, title, children, action, compact = false }: AlertProps) {
    const t = TONES[tone]
    const Icon = tone === 'err' ? XCircle : tone === 'warn' ? AlertTriangle : tone === 'ok' ? CheckCircle2 : Info
    return (
        <div role={tone === 'err' ? 'alert' : undefined}
            className={`flex items-start gap-2.5 rounded-[10px] text-[13px] leading-relaxed min-w-0 ${compact ? 'px-3 py-2' : 'px-3.5 py-3'}`}
            style={{ background: t.bg, border: `1px solid ${t.border}`, color: 'var(--text-primary)' }}>
            <Icon size={16} className="shrink-0 mt-0.5" style={{ color: t.icon }} />
            <div className="flex-1 min-w-0 break-words">
                {title && <b className="block font-medium mb-0.5">{title}</b>}
                {children}
            </div>
            {action && <div className="shrink-0">{action}</div>}
        </div>
    )
}
