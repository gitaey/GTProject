'use client'

import { useRef } from 'react'
import type { KeyboardEvent } from 'react'
import { Check } from 'lucide-react'
import { GRADIENT_PRESETS } from '@/types/post'

interface GradientPickerProps {
    value: string
    onChange: (value: string) => void
    /** 그룹 이름을 달아 줄 라벨 요소 id */
    labelledBy: string
}

/** 포인트 색(gradient) 견본 8개 — radiogroup, ←→↑↓로 이동 */
export default function GradientPicker({ value, onChange, labelledBy }: GradientPickerProps) {
    const buttons = useRef<(HTMLButtonElement | null)[]>([])
    const selectedIndex = GRADIENT_PRESETS.findIndex((g) => g.value === value)
    const tabStop = selectedIndex >= 0 ? selectedIndex : 0

    const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
        const forward = e.key === 'ArrowRight' || e.key === 'ArrowDown'
        const backward = e.key === 'ArrowLeft' || e.key === 'ArrowUp'
        if (!forward && !backward) return
        e.preventDefault()
        const count = GRADIENT_PRESETS.length
        const next = (tabStop + (forward ? 1 : count - 1)) % count
        onChange(GRADIENT_PRESETS[next].value)
        buttons.current[next]?.focus()
    }

    return (
        <div className="blog-sws" role="radiogroup" aria-labelledby={labelledBy} onKeyDown={handleKeyDown}>
            {GRADIENT_PRESETS.map((g, i) => {
                const checked = g.value === value
                return (
                    <button
                        key={g.value}
                        ref={(el) => { buttons.current[i] = el }}
                        type="button"
                        role="radio"
                        aria-checked={checked}
                        aria-label={g.label}
                        title={g.label}
                        tabIndex={i === tabStop ? 0 : -1}
                        className={`blog-sw bg-gradient-to-br ${g.value}`}
                        onClick={() => onChange(g.value)}
                    >
                        {checked && <Check size={14} strokeWidth={3} aria-hidden="true" />}
                    </button>
                )
            })}
        </div>
    )
}
