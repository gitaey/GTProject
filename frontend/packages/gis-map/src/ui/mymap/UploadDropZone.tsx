'use client'

// 업로드 창의 파일 영역 — 진짜 button(Enter·Space로 파일 선택창) + 숨은 input. 모양 둘: 비었을 때 큰 영역(big) / 파일이 있을 때 얇은 "파일 더 놓기" 줄(more).
// 끌어다 놓기는 창 전체(MyMapUploadModal의 useFileDrop)가 받는다 — 이 컴포넌트는 눌러서 고르기만 맡는다. 스타일: gm-upload__drop·gm-upload__more
import { forwardRef, useId, useRef } from 'react'
import type { ChangeEvent } from 'react'
import { FileSpreadsheet, Layers, Plus, Upload } from 'lucide-react'
import { TEXT } from './uploadModel'

/** 파일 선택창에 보이는 확장자(들어오면 안내할 .xls·.csv·.zip은 선택창에서 숨긴다 — 끌어다 놓으면 이유를 말해 준다) */
export const PICK_ACCEPT = '.xlsx,.shp,.shx,.dbf,.prj,.cpg'

interface UploadDropZoneProps {
    variant: 'big' | 'more'
    disabled?: boolean
    /** more 줄의 글(기본 "파일 더 끌어 놓기") */
    label?: string
    /** more 줄의 작은 글(기본 "이미 놓은 파일과 합쳐집니다") */
    sub?: string | null
    onPick: (files: File[]) => void
}

const UploadDropZone = forwardRef<HTMLButtonElement, UploadDropZoneProps>(function UploadDropZone({ variant, disabled, label, sub, onPick }, ref) {
    const inputRef = useRef<HTMLInputElement>(null)
    const subId = useId()
    const open = () => inputRef.current?.click()
    const onChange = (e: ChangeEvent<HTMLInputElement>) => {
        const list = Array.from(e.target.files ?? [])
        // 같은 파일을 다시 골라도 change가 오도록
        e.target.value = ''
        if (list.length > 0) onPick(list)
    }
    const input = (
        <input ref={inputRef} type="file" multiple accept={PICK_ACCEPT} className="gm-file-input" tabIndex={-1} aria-hidden="true" onChange={onChange} />
    )
    if (variant === 'big') {
        return (
            <>
                <button type="button" ref={ref} className="gm-upload__drop" disabled={disabled} onClick={open}
                    aria-label={TEXT.dropTitle} aria-describedby={subId}>
                    <span className="gm-upload__drop-icon" aria-hidden="true"><Upload size={20} /></span>
                    <span className="gm-upload__drop-title">{TEXT.dropTitle}</span>
                    <span className="gm-upload__drop-sub" id={subId}>{TEXT.dropSub}</span>
                    <span className="gm-upload__kinds" aria-hidden="true">
                        <span className="gm-upload__kind"><FileSpreadsheet size={11} />엑셀</span>
                        <span className="gm-upload__kind"><Layers size={11} />SHP</span>
                    </span>
                </button>
                {input}
            </>
        )
    }
    return (
        <>
            <button type="button" ref={ref} className="gm-upload__more" disabled={disabled} onClick={open} aria-label={`${label ?? TEXT.moreDrop} — 눌러서 고르기`}>
                <Plus size={14} aria-hidden="true" />
                <span className="gm-upload__more-title">{label ?? TEXT.moreDrop}</span>
                {sub !== null && <span className="gm-upload__more-sub">{sub ?? TEXT.moreDropSub}</span>}
                <span className="gm-upload__more-pick" aria-hidden="true">{TEXT.pick}</span>
            </button>
            {input}
        </>
    )
})

export default UploadDropZone
