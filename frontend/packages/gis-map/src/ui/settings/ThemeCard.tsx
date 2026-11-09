'use client'

// 화면 테마 카드: 시스템 설정 · 라이트 · 다크 세 칸 선택. 고르면 바로 바뀐다(상태는 호스트·MapShell이 가진다).
import { Map as MapIcon, Monitor, Moon, Printer, Sun } from 'lucide-react'
import type { ComponentType } from 'react'
import type { GisMapAppearance } from '../../core'
import { cx } from '../cx'

export interface ThemeCardProps {
    value: GisMapAppearance
    onChange: (value: GisMapAppearance) => void
}

interface ThemeOption {
    value: GisMapAppearance
    label: string
    icon: ComponentType<{ size?: number }>
}

const OPTIONS: readonly ThemeOption[] = Object.freeze([
    { value: 'system', label: '시스템 설정', icon: Monitor },
    { value: 'light', label: '라이트', icon: Sun },
    { value: 'dark', label: '다크', icon: Moon },
])

/** 카드 안쪽(머리는 SettingsCard가 그린다) */
export default function ThemeCard({ value, onChange }: ThemeCardProps) {
    return (
        <>
            <div className="gm-settings-seg" role="radiogroup" aria-label="화면 테마">
                {OPTIONS.map(opt => {
                    const Icon = opt.icon
                    const on = opt.value === value
                    return (
                        <button key={opt.value} type="button" role="radio" aria-checked={on}
                            className={cx('gm-settings-seg__btn', on && 'gm-is-active')} onClick={() => onChange(opt.value)}>
                            <Icon size={15} />
                            {opt.label}
                        </button>
                    )
                })}
            </div>
            <div className="gm-settings-note"><Printer size={12} /><span>지도 출력(PNG·PDF·인쇄)은 항상 밝은 색으로 만듭니다.</span></div>
            <div className="gm-settings-note"><MapIcon size={12} /><span>배경지도는 그대로입니다. 어두운 배경을 원하면 위성 배경을 쓰세요.</span></div>
        </>
    )
}
