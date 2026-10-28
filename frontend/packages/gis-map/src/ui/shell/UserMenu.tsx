'use client'

// 머리줄 사용자 메뉴: 사용자 표시(원 + 이름·역할) 자체가 단추이고, 누르면 호스트가 준 항목이 드롭다운으로 펼쳐진다.
// 닫기: 바깥 클릭·Esc·Tab·항목 선택. 키보드: 단추에서 Enter/Space/↓로 열고(첫 항목에 포커스) ↑↓·Home·End로 이동.
// 모바일(768px 미만)에서는 글자 없이 원만 보인다(CSS). 항목이 하는 일(이동·로그아웃)은 패키지가 모른다 — onSelect가 전부다
import { ChevronDown } from 'lucide-react'
import { useEffect, useId, useRef, useState } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent } from 'react'
import { cx } from '../cx'
import type { MapUserMenuItem } from './types'

export interface UserMenuProps {
    /** 원 안의 글자(이름 첫 글자) */
    initial: string
    name: string
    roleLabel?: string
    items: readonly MapUserMenuItem[]
}

export default function UserMenu({ initial, name, roleLabel, items }: UserMenuProps) {
    const [open, setOpen] = useState(false)
    const wrapRef = useRef<HTMLDivElement>(null)
    const triggerRef = useRef<HTMLButtonElement>(null)
    const itemRefs = useRef<Array<HTMLButtonElement | null>>([])
    const menuId = useId()

    // 열려 있는 동안만 바깥 클릭·Esc를 듣는다. 열리면 첫 항목에 포커스
    useEffect(() => {
        if (!open) return
        itemRefs.current[0]?.focus()
        const onDown = (e: MouseEvent) => {
            if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
        }
        const onKey = (e: KeyboardEvent) => {
            if (e.key !== 'Escape') return
            setOpen(false)
            triggerRef.current?.focus()
        }
        document.addEventListener('mousedown', onDown)
        document.addEventListener('keydown', onKey)
        return () => {
            document.removeEventListener('mousedown', onDown)
            document.removeEventListener('keydown', onKey)
        }
    }, [open])

    const choose = (item: MapUserMenuItem) => {
        setOpen(false)
        triggerRef.current?.focus()
        item.onSelect()
    }

    const onTriggerKeyDown = (e: ReactKeyboardEvent) => {
        if (e.key === 'ArrowDown') {
            e.preventDefault()
            if (open) itemRefs.current[0]?.focus()
            else setOpen(true)
        }
    }

    const onListKeyDown = (e: ReactKeyboardEvent) => {
        const refs = itemRefs.current.slice(0, items.length)
        const at = refs.findIndex(r => r !== null && r === document.activeElement)
        let next = -1
        if (e.key === 'ArrowDown') next = at < 0 ? 0 : (at + 1) % refs.length
        else if (e.key === 'ArrowUp') next = at <= 0 ? refs.length - 1 : at - 1
        else if (e.key === 'Home') next = 0
        else if (e.key === 'End') next = refs.length - 1
        else if (e.key === 'Tab') { setOpen(false); return }
        else return
        e.preventDefault()
        refs[next]?.focus()
    }

    return (
        <div ref={wrapRef} className="gm-user-menu">
            <button ref={triggerRef} type="button" className={cx('gm-user-menu__trigger', open && 'gm-is-open')}
                aria-haspopup="menu" aria-expanded={open} aria-controls={open ? menuId : undefined}
                aria-label={`사용자 메뉴 — ${name}`}
                onClick={() => setOpen(cur => !cur)} onKeyDown={onTriggerKeyDown}>
                <span className="gm-header__avatar">{initial}</span>
                <span className="gm-header__user-text gm-user-menu__text">
                    <span className="gm-header__user-name">{name}</span>
                    {roleLabel != null && <span className="gm-header__user-role">{roleLabel}</span>}
                </span>
                <ChevronDown size={14} className="gm-user-menu__caret" />
            </button>
            {open && (
                <div id={menuId} role="menu" aria-label="사용자 메뉴" className="gm-user-menu__list" onKeyDown={onListKeyDown}>
                    {items.map((item, i) => (
                        <button key={item.id} ref={el => { itemRefs.current[i] = el }} type="button" role="menuitem"
                            className="gm-user-menu__item" onClick={() => choose(item)}>
                            {item.icon != null && <span className="gm-user-menu__icon" aria-hidden="true">{item.icon}</span>}
                            {item.label}
                        </button>
                    ))}
                </div>
            )}
        </div>
    )
}
