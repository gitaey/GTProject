'use client'

import { useEffect, useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'
import { Check, Monitor, Moon, Sun } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useBlogTheme } from '../_lib/useBlogTheme'
import type { BlogThemePref } from '../_lib/useBlogTheme'

interface ThemeOption {
    value: BlogThemePref
    label: string
    Icon: LucideIcon
}

const OPTIONS: ThemeOption[] = [
    { value: 'system', label: '시스템 설정', Icon: Monitor },
    { value: 'light', label: '라이트', Icon: Sun },
    { value: 'dark', label: '다크', Icon: Moon },
]

export default function ThemeToggle() {
    const { pref, resolved, setPref, mounted } = useBlogTheme()
    const [open, setOpen] = useState(false)
    const wrapRef = useRef<HTMLDivElement>(null)
    const buttonRef = useRef<HTMLButtonElement>(null)
    const itemRefs = useRef<(HTMLButtonElement | null)[]>([])

    /* 열리면 현재 설정 항목에 포커스 */
    useEffect(() => {
        if (!open) return
        const idx = Math.max(0, OPTIONS.findIndex((o) => o.value === pref))
        itemRefs.current[idx]?.focus()
        // 열릴 때 한 번만
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open])

    /* 바깥 클릭 닫기 */
    useEffect(() => {
        if (!open) return
        const onDown = (e: MouseEvent) => {
            if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
        }
        document.addEventListener('mousedown', onDown)
        return () => document.removeEventListener('mousedown', onDown)
    }, [open])

    const closeAndFocusButton = () => {
        setOpen(false)
        buttonRef.current?.focus()
    }

    const onButtonKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
        if (e.key === 'ArrowDown') {
            e.preventDefault()
            setOpen(true)
        }
    }

    const onMenuKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
        const current = itemRefs.current.findIndex((el) => el === document.activeElement)
        const focusAt = (i: number) => itemRefs.current[(i + OPTIONS.length) % OPTIONS.length]?.focus()
        if (e.key === 'ArrowDown') { e.preventDefault(); focusAt(current + 1) }
        else if (e.key === 'ArrowUp') { e.preventDefault(); focusAt(current - 1) }
        else if (e.key === 'Home') { e.preventDefault(); focusAt(0) }
        else if (e.key === 'End') { e.preventDefault(); focusAt(OPTIONS.length - 1) }
        else if (e.key === 'Escape') { e.preventDefault(); closeAndFocusButton() }
        else if (e.key === 'Tab') setOpen(false)
    }

    const choose = (value: BlogThemePref) => {
        setPref(value)
        closeAndFocusButton()
    }

    /* 마운트 전(서버 렌더)에는 설정값을 모르므로 Monitor로 그린다 */
    const ButtonIcon = mounted ? (resolved === 'dark' ? Moon : Sun) : Monitor

    return (
        <div className="blog-theme" ref={wrapRef}>
            <button
                ref={buttonRef}
                type="button"
                className="blog-icon-btn"
                aria-label="테마 선택"
                aria-haspopup="menu"
                aria-expanded={open}
                onClick={() => setOpen((v) => !v)}
                onKeyDown={onButtonKeyDown}
            >
                <ButtonIcon size={18} aria-hidden="true" />
            </button>
            {open && (
                <div className="blog-menu" role="menu" aria-label="테마" onKeyDown={onMenuKeyDown}>
                    {OPTIONS.map(({ value, label, Icon }, i) => (
                        <button
                            key={value}
                            ref={(el) => { itemRefs.current[i] = el }}
                            type="button"
                            role="menuitemradio"
                            aria-checked={pref === value}
                            tabIndex={-1}
                            className="blog-menu-item"
                            onClick={() => choose(value)}
                        >
                            <Icon size={16} aria-hidden="true" />
                            {label}
                            {pref === value && <Check size={16} className="blog-menu-check" aria-hidden="true" />}
                        </button>
                    ))}
                </div>
            )}
        </div>
    )
}
