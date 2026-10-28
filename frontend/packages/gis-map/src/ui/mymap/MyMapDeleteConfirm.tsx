'use client'

// 나만의지도 레이어 삭제 확인창 — 스타일: gm-modal(업로드·공유와 공용), gm-delete-confirm
// 삭제는 되돌릴 수 없으므로 한 번 더 묻는다. 기본 포커스는 '취소'(Enter를 눌러도 지워지지 않게), Esc·바깥 클릭은 취소.
import { useEffect, useRef, useState } from 'react'
import { Loader2, Trash2, X } from 'lucide-react'

interface MyMapDeleteConfirmProps {
    name: string
    /** 실제 삭제(목록 객체의 remove). 실패하면 던진다 — 던지면 창이 열린 채 오류를 보여준다 */
    onConfirm: () => Promise<void>
    onClose: () => void
}

export default function MyMapDeleteConfirm({ name, onConfirm, onClose }: MyMapDeleteConfirmProps) {
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const cancelRef = useRef<HTMLButtonElement>(null)
    const busyRef = useRef(false)
    const closeRef = useRef(onClose)
    closeRef.current = onClose

    const close = () => { if (!busyRef.current) closeRef.current() }

    useEffect(() => {
        cancelRef.current?.focus()
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close() }
        document.addEventListener('keydown', onKey)
        return () => document.removeEventListener('keydown', onKey)
    }, [])

    const confirm = async () => {
        if (busyRef.current) return
        busyRef.current = true
        setBusy(true)
        setError(null)
        try {
            await onConfirm()
            busyRef.current = false
            closeRef.current()
        } catch (e) {
            busyRef.current = false
            setBusy(false)
            setError(e instanceof Error && e.message ? e.message : '삭제하지 못했습니다')
        }
    }

    return (
        <div className="gm-modal" onClick={close}>
            <div onClick={e => e.stopPropagation()} className="gm-modal__dialog gm-delete-confirm" role="alertdialog"
                aria-modal="true" aria-label="레이어 삭제 확인">
                <div className="gm-modal__header">
                    <span className="gm-modal__title">레이어 삭제</span>
                    <button onClick={close} disabled={busy} className="gm-modal__close" aria-label="닫기"><X size={16} /></button>
                </div>
                <div className="gm-modal__body">
                    <div className="gm-delete-confirm__msg">
                        <strong className="gm-delete-confirm__name">{name}</strong> 레이어를 삭제할까요?
                    </div>
                    <div className="gm-modal__note">삭제하면 되돌릴 수 없고, 공유받은 사람도 더 이상 볼 수 없습니다.</div>
                    {error && <div className="gm-modal__error">{error}</div>}
                    <div className="gm-delete-confirm__actions">
                        <button ref={cancelRef} type="button" onClick={close} disabled={busy} className="gm-delete-confirm__cancel">취소</button>
                        <button type="button" onClick={confirm} disabled={busy} className="gm-delete-confirm__ok">
                            {busy ? <Loader2 size={12} className="gm-loader" /> : <Trash2 size={12} />} 삭제
                        </button>
                    </div>
                </div>
            </div>
        </div>
    )
}
