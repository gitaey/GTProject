'use client'

// 설정 패널의 접고 펴는 카드 하나(아이콘 타일 + 제목 + 한 줄 설명 + 화살표). 펼침 상태는 부모가 가진다(여러 장을 같이 펼칠 수 있다).
import { ChevronDown } from 'lucide-react'
import type { ComponentType, ReactNode } from 'react'
import { cx } from '../cx'

export interface SettingsCardProps {
    /** 카드 id(접근성 id 접두) */
    id: string
    icon: ComponentType<{ size?: number }>
    title: string
    description: string
    open: boolean
    onToggle: () => void
    children: ReactNode
}

export default function SettingsCard({ id, icon: Icon, title, description, open, onToggle, children }: SettingsCardProps) {
    const bodyId = 'gm-settings-body-' + id
    return (
        <section className={cx('gm-settings-card', open && 'gm-is-open')}>
            <button type="button" className="gm-settings-card__head" aria-expanded={open} aria-controls={bodyId} onClick={onToggle}>
                <span className="gm-settings-card__tile"><Icon size={16} /></span>
                <span className="gm-settings-card__text">
                    <span className="gm-settings-card__title">{title}</span>
                    <span className="gm-settings-card__desc">{description}</span>
                </span>
                <ChevronDown size={16} className="gm-settings-card__chev" />
            </button>
            {open && <div id={bodyId} className="gm-settings-card__body">{children}</div>}
        </section>
    )
}
