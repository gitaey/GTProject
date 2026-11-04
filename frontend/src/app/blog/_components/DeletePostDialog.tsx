'use client'

import { useId, useRef, useState } from 'react'
import { AlertTriangle, Trash2 } from 'lucide-react'
import BlogDialog from './BlogDialog'

interface DeletePostDialogProps {
    open: boolean
    postTitle: string
    onClose: () => void
    /** throw하면 안에 메시지를 보인다. 성공 후 이동은 부모가 한다 */
    onConfirm: () => Promise<void>
}

export default function DeletePostDialog({ open, postTitle, onClose, onConfirm }: DeletePostDialogProps) {
    const titleId = useId()
    const descId = useId()
    const cancelRef = useRef<HTMLButtonElement>(null)
    const busyRef = useRef(false)
    const [deleting, setDeleting] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [prevOpen, setPrevOpen] = useState(open)

    /* 열릴 때마다 깨끗한 상태로 시작 */
    if (open !== prevOpen) {
        setPrevOpen(open)
        if (open) { setDeleting(false); setError(null) }
    }

    const requestClose = () => {
        if (!busyRef.current) onClose()
    }

    const handleDelete = async () => {
        if (busyRef.current) return
        busyRef.current = true
        setDeleting(true)
        setError(null)
        try {
            await onConfirm()
        } catch (e) {
            setError(e instanceof Error ? e.message : '삭제에 실패했습니다.')
        } finally {
            busyRef.current = false
            setDeleting(false)
        }
    }

    return (
        <BlogDialog
            open={open}
            onRequestClose={requestClose}
            labelledBy={titleId}
            describedBy={descId}
            size="sm"
            role="alertdialog"
            initialFocusRef={cancelRef}
        >
            <div className="blog-del">
                <div className="blog-del-icon">
                    <AlertTriangle size={20} aria-hidden="true" />
                </div>
                <h2 id={titleId}>글을 삭제할까요?</h2>
                <p id={descId}>“{postTitle}” 글을 삭제합니다. 되돌릴 수 없습니다.</p>
                {error && <div className="blog-del-err" role="alert">{error}</div>}
                <div className="blog-del-acts">
                    <button
                        ref={cancelRef}
                        type="button"
                        className="blog-btn blog-btn-ghost"
                        onClick={requestClose}
                        disabled={deleting}
                    >
                        취소
                    </button>
                    <button type="button" className="blog-btn blog-btn-danger" onClick={handleDelete} disabled={deleting}>
                        <Trash2 size={16} aria-hidden="true" />
                        {deleting ? '삭제 중...' : '삭제'}
                    </button>
                </div>
            </div>
        </BlogDialog>
    )
}
