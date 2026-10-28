'use client'

// 나만의지도 항목의 `⋯`(더보기) 단추 + 떠 있는 메뉴 — 스타일: gm-mymap-panel__ib / __menu / __menu-item
// 열림 상태는 부모가 가진다(open·onOpenChange) → 패널이 "한 번에 하나만"을 정하고, 패널이 닫히면(언마운트) 같이 사라진다.
// 메뉴는 position: fixed + 단추의 화면 좌표로 놓는다(패널 스크롤 영역에 안 잘림, 아래가 모자라면 위로 — menuPosition).
// 닫기: 바깥 클릭·Esc(단추로 포커스 복귀)·Tab·스크롤·창 크기 변경·항목 선택. 키보드: 단추에서 ↓로 열기, 열리면 첫 항목 포커스, ↑↓·Home·End
import { MoreHorizontal } from 'lucide-react'
import { useEffect, useId, useLayoutEffect, useRef } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent, ReactNode } from 'react'
import { cx } from '../cx'
import { menuNextIndex } from '../menuNav'
import { computeMenuPosition } from './menuPosition'

export interface ItemMenuEntry {
    id: string
    label: string
    icon: ReactNode
    /** 삭제처럼 되돌릴 수 없는 항목(빨강 + 위에 구분선) */
    danger?: boolean
    onSelect: () => void
}

interface MyMapItemMenuProps {
    /** 메뉴가 속한 레이어 이름(접근성 이름) */
    label: string
    open: boolean
    onOpenChange: (open: boolean) => void
    entries: readonly ItemMenuEntry[]
}

/** 메뉴를 재기 전(첫 계산)에 쓰는 대략적인 크기 — 실제 크기를 못 읽을 때만 */
const FALLBACK_SIZE = { width: 148, height: 120 }

function viewportSize(): { width: number; height: number } {
    const root = document.documentElement
    return {
        width: window.innerWidth || root?.clientWidth || 0,
        height: window.innerHeight || root?.clientHeight || 0,
    }
}

export default function MyMapItemMenu({ label, open, onOpenChange, entries }: MyMapItemMenuProps) {
    const wrapRef = useRef<HTMLDivElement>(null)
    const triggerRef = useRef<HTMLButtonElement>(null)
    const menuRef = useRef<HTMLDivElement>(null)
    const itemRefs = useRef<Array<HTMLButtonElement | null>>([])
    const menuId = useId()
    // 이벤트 효과가 부모 콜백이 바뀔 때마다 다시 붙지 않게(참조 안정성)
    const changeRef = useRef(onOpenChange)
    changeRef.current = onOpenChange

    // 그리기 전에 자리를 잡는다(처음 한 번 깜빡이지 않게). 항목 수가 바뀌면 높이가 달라지니 다시
    useLayoutEffect(() => {
        const menu = menuRef.current
        const trigger = triggerRef.current
        if (!open || !menu || !trigger) return
        const pos = computeMenuPosition(
            trigger.getBoundingClientRect(),
            { width: menu.offsetWidth || FALLBACK_SIZE.width, height: menu.offsetHeight || FALLBACK_SIZE.height },
            viewportSize(),
        )
        menu.style.left = `${pos.left}px`
        menu.style.top = `${pos.top}px`
    }, [open, entries.length])

    // 열려 있는 동안만 바깥 클릭·Esc·스크롤·크기 변경을 듣는다. 열리면 첫 항목에 포커스(스크롤은 건드리지 않게)
    useEffect(() => {
        if (!open) return
        itemRefs.current[0]?.focus({ preventScroll: true })
        const close = () => changeRef.current(false)
        const onDown = (e: MouseEvent) => {
            if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) close()
        }
        const onKey = (e: KeyboardEvent) => {
            if (e.key !== 'Escape') return
            close()
            triggerRef.current?.focus()
        }
        document.addEventListener('mousedown', onDown)
        document.addEventListener('keydown', onKey)
        // 스크롤은 버블링하지 않으므로 캡처로 듣는다(패널 목록이 스크롤돼도 메뉴가 엉뚱한 자리에 남지 않게)
        document.addEventListener('scroll', close, true)
        window.addEventListener('resize', close)
        return () => {
            document.removeEventListener('mousedown', onDown)
            document.removeEventListener('keydown', onKey)
            document.removeEventListener('scroll', close, true)
            window.removeEventListener('resize', close)
        }
    }, [open])

    const choose = (entry: ItemMenuEntry) => {
        onOpenChange(false)
        triggerRef.current?.focus()
        entry.onSelect()
    }

    const onTriggerKeyDown = (e: ReactKeyboardEvent) => {
        if (e.key !== 'ArrowDown') return
        e.preventDefault()
        if (open) itemRefs.current[0]?.focus({ preventScroll: true })
        else onOpenChange(true)
    }

    const onListKeyDown = (e: ReactKeyboardEvent) => {
        // Tab: 포커스를 단추로 돌려놓고 닫는다(기본 Tab 동작은 그대로 → 단추 다음 칸으로 이동)
        if (e.key === 'Tab') {
            triggerRef.current?.focus()
            onOpenChange(false)
            return
        }
        const refs = itemRefs.current.slice(0, entries.length)
        const at = refs.findIndex(r => r !== null && r === document.activeElement)
        const next = menuNextIndex(e.key, at, refs.length)
        if (next < 0) return
        e.preventDefault()
        refs[next]?.focus({ preventScroll: true })
    }

    return (
        <div ref={wrapRef} className="gm-mymap-panel__menu-wrap">
            <button ref={triggerRef} type="button" title="더보기" aria-label={`${label} 더보기`}
                className={cx('gm-panel__item-btn', 'gm-mymap-panel__ib', open && 'gm-is-open')}
                aria-haspopup="menu" aria-expanded={open} aria-controls={open ? menuId : undefined}
                onClick={() => onOpenChange(!open)} onKeyDown={onTriggerKeyDown}>
                <MoreHorizontal size={14} />
            </button>
            {open && (
                <div ref={menuRef} id={menuId} role="menu" aria-label={`${label} 메뉴`} className="gm-mymap-panel__menu" onKeyDown={onListKeyDown}>
                    {entries.map((entry, i) => (
                        <div key={entry.id} role="none" className="gm-mymap-panel__menu-row">
                            {entry.danger && i > 0 && <div role="separator" className="gm-mymap-panel__menu-sep" />}
                            <button ref={el => { itemRefs.current[i] = el }} type="button" role="menuitem" tabIndex={-1}
                                className={cx('gm-mymap-panel__menu-item', entry.danger && 'gm-is-danger')}
                                onClick={() => choose(entry)}>
                                <span className="gm-mymap-panel__menu-icon" aria-hidden="true">{entry.icon}</span>
                                {entry.label}
                            </button>
                        </div>
                    ))}
                </div>
            )}
        </div>
    )
}
