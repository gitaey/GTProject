'use client'

import { useEffect, useRef } from 'react'
import type { KeyboardEvent, MouseEvent, ReactNode, RefObject, SyntheticEvent } from 'react'

interface BlogDialogProps {
    open: boolean
    /** Esc·바깥 클릭에서 호출. 실제로 닫을지는 부모가 정한다(작성 중 내용 확인, 제출 중 막기 등) */
    onRequestClose: () => void
    labelledBy: string
    describedBy?: string
    size: 'sm' | 'lg'
    role?: 'dialog' | 'alertdialog'
    /** 열릴 때 포커스를 줄 요소. 없으면 브라우저가 첫 포커스 가능 요소에 준다 */
    initialFocusRef?: RefObject<HTMLElement | null>
    children: ReactNode
}

/**
 * 브라우저 기본 <dialog>(showModal) 틀.
 * - 뒤 페이지 비활성·Tab 가두기·최상단 표시는 브라우저가 한다.
 * - .blog-root 안에서 렌더해야 테마 변수를 상속한다(포털로 body에 보내지 말 것).
 * - 열린 동안 html 스크롤을 잠그고, 닫히면 원래 값과 연 요소의 포커스를 되돌린다.
 */
export default function BlogDialog({
    open, onRequestClose, labelledBy, describedBy, size, role = 'dialog', initialFocusRef, children,
}: BlogDialogProps) {
    const dialogRef = useRef<HTMLDialogElement>(null)
    const openRef = useRef(open)
    const pressedOnBackdrop = useRef(false)
    openRef.current = open

    useEffect(() => {
        if (!open) return
        const dialog = dialogRef.current
        if (!dialog) return

        const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null
        if (!dialog.open) dialog.showModal()

        const root = document.documentElement
        const prevOverflow = root.style.overflow
        root.style.overflow = 'hidden'

        initialFocusRef?.current?.focus()

        return () => {
            root.style.overflow = prevOverflow
            if (dialog.open) dialog.close()
            if (opener && opener.isConnected) opener.focus()
        }
        // initialFocusRef는 ref 객체라 바뀌지 않으므로 의존성에서 뺀다
    }, [open])

    /* Esc: keydown 단계에서 막아야 Chrome이 두 번째 Esc에 cancel을 건너뛰고 닫아 버리는 일을 피한다 */
    const handleKeyDown = (e: KeyboardEvent<HTMLDialogElement>) => {
        if (e.key === 'Escape') {
            e.preventDefault()
            e.stopPropagation()
            onRequestClose()
        }
    }

    /* 안드로이드 뒤로 가기 등 keydown을 거치지 않는 닫기 요청 */
    const handleCancel = (e: SyntheticEvent<HTMLDialogElement>) => {
        e.preventDefault()
        onRequestClose()
    }

    /* 부모가 열어 둔 채인데 브라우저가 먼저 닫았다면 다시 연다 */
    const handleClose = () => {
        const dialog = dialogRef.current
        if (dialog && openRef.current && !dialog.open) dialog.showModal()
    }

    /* 바깥(::backdrop) 클릭 — 누른 곳과 뗀 곳이 모두 바깥일 때만(글 드래그 선택이 바깥에서 끝나는 경우 제외) */
    const handleMouseDown = (e: MouseEvent<HTMLDialogElement>) => {
        pressedOnBackdrop.current = e.target === e.currentTarget
    }
    const handleClick = (e: MouseEvent<HTMLDialogElement>) => {
        if (e.target === e.currentTarget && pressedOnBackdrop.current) onRequestClose()
        pressedOnBackdrop.current = false
    }

    return (
        <dialog
            ref={dialogRef}
            className={`blog-dlg blog-dlg-${size}`}
            role={role === 'alertdialog' ? 'alertdialog' : undefined}
            aria-modal="true"
            aria-labelledby={labelledBy}
            aria-describedby={describedBy}
            onKeyDown={handleKeyDown}
            onCancel={handleCancel}
            onClose={handleClose}
            onMouseDown={handleMouseDown}
            onClick={handleClick}
        >
            <div className="blog-dlg-inner">{open && children}</div>
        </dialog>
    )
}
