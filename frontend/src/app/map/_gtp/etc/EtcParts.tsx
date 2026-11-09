'use client'

// 기타 패널 도구들이 함께 쓰는 작은 조각(단추·알림 상자 모양). 지도 패널과 같은 바탕·테두리·주황 #F26722 포인트.
// Tailwind 기본 orange-500(#F97316 계열)은 브랜드색과 달라 쓰지 않는다.
//
// 색은 지도 패키지의 의미 토큰(--gm-surface 등, 화면 테마에 따라 값이 바뀜)을 쓴다. 앱의 dark:·next-themes(.dark)는 쓰지 않는다.
// 클래스에 토큰 이름을 직접 쓰지 않고 --etc-* 별칭을 거치는 이유: 패키지 리셋 `.gm-root :where([class*="gm-"])`(@layer 밖)이
// 클래스 문자열에 "gm-"가 들어간 모든 요소의 border·margin·padding을 0으로 만들어 Tailwind 유틸리티를 이긴다
// (예: `bg-(--gm-surface)`도 걸린다). 별칭 값은 ETC_THEME_VARS를 패널 루트에 style로 달아 정한다.

import type { CSSProperties, ReactNode } from 'react'
import { AlertCircle, CheckCircle2, Info, TriangleAlert } from 'lucide-react'

/**
 * --etc-* 별칭 → 패키지 의미 토큰. 패널 루트(EtcPanel)·포털 모달 루트에 style로 단다(렌더마다 새 객체를 만들지 않게 모듈 상수).
 * 값은 .gm-root·data-gm-theme가 정한 --gm-* 를 상속해 읽으므로 테마가 바뀌면 같이 바뀐다.
 * --gm-primary-disabled는 패키지 토큰이다(라이트 #f9b98f, 다크 #a24f2a). 대체값은 토큰이 없는 호스트용 라이트 값.
 */
export const ETC_THEME_VARS: CSSProperties = Object.freeze({
    '--etc-surface': 'var(--gm-surface)',
    '--etc-surface-muted': 'var(--gm-surface-muted)',
    '--etc-surface-sunken': 'var(--gm-surface-sunken)',
    '--etc-border': 'var(--gm-border)',
    '--etc-border-subtle': 'var(--gm-border-subtle)',
    '--etc-border-strong': 'var(--gm-border-strong)',
    '--etc-text': 'var(--gm-text)',
    '--etc-text-2': 'var(--gm-text-2)',
    '--etc-text-muted': 'var(--gm-text-muted)',
    '--etc-text-faint': 'var(--gm-text-faint)',
    '--etc-on-primary': 'var(--gm-on-primary)',
    '--etc-primary': 'var(--gm-primary)',
    '--etc-primary-hover': 'var(--gm-primary-hover)',
    '--etc-primary-soft': 'var(--gm-primary-soft)',
    '--etc-primary-line': 'var(--gm-primary-line)',
    '--etc-primary-disabled': 'var(--gm-primary-disabled, #F9B98F)',
    '--etc-danger': 'var(--gm-danger-text)', // 글자용(라이트 #b91c1c = 옛 #DC2626보다 진해 대비 확보). --gm-danger는 아이콘·강조용 밝은 빨강
    '--etc-danger-soft': 'var(--gm-danger-soft)',
    '--etc-warn': 'var(--gm-warn)',
    '--etc-warn-soft': 'var(--gm-warn-soft)',
    '--etc-success': 'var(--gm-success)',
    '--etc-success-soft': 'var(--gm-success-softer)', // 옛 #F0FDF4와 같은 옅은 녹색
    '--etc-backdrop': 'var(--gm-backdrop)',
} as CSSProperties)

const FOCUS = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--etc-primary)'

export const BTN_PRIMARY =
    `flex w-full items-center justify-center gap-1.5 rounded-md bg-(--etc-primary) px-2 py-2 text-[11.5px] font-bold text-(--etc-on-primary) transition-colors hover:bg-(--etc-primary-hover) disabled:cursor-not-allowed disabled:bg-(--etc-primary-disabled) ${FOCUS}`

export const BTN_SECONDARY =
    `flex w-full items-center justify-center gap-1.5 rounded-md border border-(--etc-border-strong) bg-(--etc-surface) px-2 py-2 text-[11.5px] font-bold text-(--etc-text-2) transition-colors hover:bg-(--etc-surface-muted) disabled:cursor-not-allowed disabled:opacity-50 ${FOCUS}`

export const BTN_LINK =
    `flex items-center justify-center gap-1 rounded text-[11px] text-(--etc-text-muted) transition-colors hover:text-(--etc-primary) disabled:cursor-not-allowed disabled:opacity-50 ${FOCUS}`

export const FIELD =
    'w-full rounded-md border border-(--etc-border-strong) bg-(--etc-surface) px-2 py-1.5 text-[11.5px] text-(--etc-text-2) focus:border-(--etc-primary) focus:outline-none'

export const FIELD_LABEL = 'mb-[3px] flex items-center gap-1 text-[10.5px] text-(--etc-text-muted)'

export type NoticeTone = 'ok' | 'warn' | 'err' | 'info'

// 테두리는 글자색의 30%(border-current/30) — 톤마다 따로 테두리 토큰을 두지 않아도 라이트·다크 모두 맞는다
const TONES: Readonly<Record<NoticeTone, string>> = Object.freeze({
    ok: 'border-current/30 bg-(--etc-success-soft) text-(--etc-success)',
    warn: 'border-current/30 bg-(--etc-warn-soft) text-(--etc-warn)',
    err: 'border-current/30 bg-(--etc-danger-soft) text-(--etc-danger)',
    info: 'border-(--etc-border) bg-(--etc-surface-muted) text-(--etc-text-2)',
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
