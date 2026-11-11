'use client'

// 업로드 창의 파일 칩 목록 — 아이콘·이름·역할 칩(도형·속성·색인·좌표계 / 쓰지 않음 / 이유)·크기·[빼기]. 빠진 필수 파일은 점선 빈 칸 칩.
// 판별은 uploadFiles/uploadModel(순수 함수)이 한다. 스타일: gm-upload__files
import { File as FileIcon, FileSpreadsheet, FileX, Layers, X } from 'lucide-react'
import { cx } from '../cx'
import { formatBytes } from './convertModel'
import { chipOf } from './uploadModel'
import type { ChipTone } from './uploadModel'
import type { PickItem } from './uploadFiles'

export interface MissingSlot {
    name: string
    /** "속성 · 필요" */
    label: string
}

interface UploadFileListProps {
    items: readonly PickItem<File>[]
    missing?: readonly MissingSlot[]
    disabled?: boolean
    onRemove: (file: File, index: number) => void
}

const TONE_CLASS: Readonly<Record<ChipTone, string>> = Object.freeze({ ok: 'gm-is-ok', warn: 'gm-is-warn', need: 'gm-is-need', ign: 'gm-is-ign' })

function iconOf(item: PickItem<File>) {
    if (item.use === 'bad') return <FileX size={14} />
    if (item.kind === 'xlsx') return <FileSpreadsheet size={14} />
    if (item.kind === 'shp') return <Layers size={14} />
    return <FileIcon size={14} />
}

export default function UploadFileList({ items, missing, disabled, onRemove }: UploadFileListProps) {
    if (items.length === 0 && !(missing && missing.length > 0)) return null
    return (
        <ul className="gm-upload__files" aria-label="올릴 파일">
            {items.map((it, i) => {
                const chip = chipOf(it)
                return (
                    <li key={`${it.file.name}-${i}`} className={cx('gm-upload__file', it.use === 'ignored' && 'gm-is-ignored', it.use === 'bad' && 'gm-is-bad')}>
                        <span className="gm-upload__file-icon" aria-hidden="true">{iconOf(it)}</span>
                        <span className="gm-upload__file-name" title={it.file.name}>{it.file.name}</span>
                        {chip.label && <span className={cx('gm-upload__role', TONE_CLASS[chip.tone])}>{chip.label}</span>}
                        <span className="gm-upload__file-size">{formatBytes(it.file.size)}</span>
                        <button type="button" className="gm-upload__file-remove" data-gm-remove="" disabled={disabled}
                            aria-label={`${it.file.name} 빼기`} onClick={() => onRemove(it.file, i)}>
                            <X size={13} aria-hidden="true" />
                        </button>
                    </li>
                )
            })}
            {(missing ?? []).map(m => (
                <li key={`missing-${m.name}`} className="gm-upload__file gm-is-missing">
                    <span className="gm-upload__file-icon" aria-hidden="true"><FileX size={14} /></span>
                    <span className="gm-upload__file-name" title={m.name}>{m.name}</span>
                    <span className="gm-upload__role gm-is-need">{m.label}</span>
                </li>
            ))}
        </ul>
    )
}
