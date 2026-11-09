'use client'

// 기타 패널 도구들이 함께 쓰는 작은 조각(단추·알림 상자 모양). 지도 패널과 같은 흰 바탕·회색 테두리·주황 #F26722 포인트.
// Tailwind 기본 orange-500(#F97316 계열)은 브랜드색과 달라 쓰지 않는다.

import type { ReactNode } from 'react'
import { AlertCircle, CheckCircle2, Info, TriangleAlert } from 'lucide-react'

const FOCUS = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#F26722]'

export const BTN_PRIMARY =
    `flex w-full items-center justify-center gap-1.5 rounded-md bg-[#F26722] px-2 py-2 text-[11.5px] font-bold text-white transition-colors hover:bg-[#E05D19] disabled:cursor-not-allowed disabled:bg-[#F9B98F] ${FOCUS}`

export const BTN_SECONDARY =
    `flex w-full items-center justify-center gap-1.5 rounded-md border border-[#D1D5DC] bg-white px-2 py-2 text-[11.5px] font-bold text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 ${FOCUS}`

export const BTN_LINK =
    `flex items-center justify-center gap-1 rounded text-[11px] text-gray-500 transition-colors hover:text-[#F26722] disabled:cursor-not-allowed disabled:opacity-50 ${FOCUS}`

export const FIELD =
    'w-full rounded-md border border-[#D1D5DC] bg-white px-2 py-1.5 text-[11.5px] text-gray-700 focus:border-[#F26722] focus:outline-none'

export const FIELD_LABEL = 'mb-[3px] flex items-center gap-1 text-[10.5px] text-gray-500'

export type NoticeTone = 'ok' | 'warn' | 'err' | 'info'

const TONES: Readonly<Record<NoticeTone, string>> = Object.freeze({
    ok: 'border-[#BBF7D0] bg-[#F0FDF4] text-[#15803D]',
    warn: 'border-[#FDE68A] bg-[#FFFBEB] text-[#B45309]',
    err: 'border-[#FECACA] bg-[#FEF2F2] text-[#DC2626]',
    info: 'border-[#E5E7EB] bg-[#F9FAFB] text-gray-600',
})

interface NoticeBoxProps {
    tone: NoticeTone
    children: ReactNode
    /** 오류는 스크린리더가 바로 읽게 */
    alert?: boolean
}

/** 아이콘 + 글자로 구분하는 알림 상자(색만으로 구분하지 않는다) */
export function NoticeBox({ tone, children, alert }: NoticeBoxProps) {
    const Icon = tone === 'ok' ? CheckCircle2 : tone === 'err' ? AlertCircle : tone === 'warn' ? TriangleAlert : Info
    return (
        <div role={alert ? 'alert' : undefined} className={`flex gap-1.5 rounded-md border px-2 py-[7px] text-[11px] leading-[1.5] ${TONES[tone]}`}>
            <Icon size={13} aria-hidden className="mt-[1px] shrink-0" />
            <div className="min-w-0 break-words">{children}</div>
        </div>
    )
}
