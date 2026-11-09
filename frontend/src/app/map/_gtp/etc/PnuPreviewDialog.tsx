'use client'

// 결과 미리보기 모달(앞 50행). document.body에 포털로 그려 지도 패널의 overflow에 잘리지 않게 한다. Esc·배경 클릭으로 닫는다.

import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { buildPreview, usePnuAddressJob } from './pnuAddressJob'
import { RESULT_COLUMN_NAMES } from './pnuAddressModel'
import type { StatusTone } from './pnuAddressModel'

const PREVIEW_ROWS = 50

const TONE_CLASS: Readonly<Record<StatusTone, string>> = Object.freeze({
    ok: 'bg-[#F0FDF4] text-[#15803D]',
    warn: 'bg-[#FFFBEB] text-[#B45309]',
    err: 'bg-[#FEF2F2] text-[#DC2626]',
    none: 'bg-[#F3F4F6] text-gray-600',
})

const fmt = (n: number): string => n.toLocaleString('ko-KR')

interface PnuPreviewDialogProps {
    onClose: () => void
}

export default function PnuPreviewDialog({ onClose }: PnuPreviewDialogProps) {
    const titleId = useId()
    const [onlyIssues, setOnlyIssues] = useState(false)
    const closeRef = useRef<HTMLButtonElement>(null)
    const dialogRef = useRef<HTMLDivElement>(null)
    const summary = usePnuAddressJob((s) => s.resultSummary)
    const issueCount = useMemo(() => (summary ? Object.values(summary).reduce((a, b) => a + b, 0) - summary.SUCCESS : 0), [summary])
    const preview = useMemo(() => buildPreview(onlyIssues, PREVIEW_ROWS), [onlyIssues])

    // onClose는 부모가 렌더마다 새로 만들 수 있어 ref로 잡는다(효과가 다시 돌아 초점을 뺏지 않게)
    const onCloseRef = useRef(onClose)
    useEffect(() => { onCloseRef.current = onClose }, [onClose])

    // 열 때 닫기 단추로 초점, 닫을 때 원래 자리로. Esc 닫기, Tab은 모달 안에서만 돈다.
    useEffect(() => {
        const before = document.activeElement instanceof HTMLElement ? document.activeElement : null
        closeRef.current?.focus()
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                e.stopPropagation()
                onCloseRef.current()
                return
            }
            if (e.key !== 'Tab' || !dialogRef.current) return
            const items = Array.from(dialogRef.current.querySelectorAll<HTMLElement>('button, [href], [tabindex]:not([tabindex="-1"])'))
            if (items.length === 0) return
            const first = items[0]
            const last = items[items.length - 1]
            if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
            else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
        }
        document.addEventListener('keydown', onKey, true)
        return () => {
            document.removeEventListener('keydown', onKey, true)
            before?.focus()
        }
    }, [])

    const tabCls = (on: boolean) =>
        `rounded-t-md border-b-2 px-2.5 py-1.5 text-[12px] focus-visible:outline-2 focus-visible:outline-[#F26722] ${on ? 'border-[#F26722] font-bold text-[#F26722]' : 'border-transparent text-gray-500 hover:text-gray-700'}`

    return createPortal(
        <div
            className="fixed inset-0 z-[1000] flex items-center justify-center bg-[rgba(17,24,39,0.45)] p-3"
            onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}
        >
            <div
                ref={dialogRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby={titleId}
                className="flex max-h-[85vh] w-[min(760px,92vw)] flex-col overflow-hidden rounded-[10px] bg-white shadow-[0_10px_30px_rgba(0,0,0,0.2)]"
            >
                <div className="flex shrink-0 items-center justify-between border-b border-[#E5E7EB] px-3.5 py-3">
                    <b id={titleId} className="text-[14px] text-gray-900">결과 미리보기</b>
                    <button
                        ref={closeRef}
                        type="button"
                        onClick={onClose}
                        aria-label="닫기"
                        className="rounded text-gray-400 hover:text-gray-700 focus-visible:outline-2 focus-visible:outline-[#F26722]"
                    >
                        <X size={16} aria-hidden />
                    </button>
                </div>
                <div role="tablist" className="flex shrink-0 gap-1 px-3.5 pt-2">
                    <button type="button" role="tab" aria-selected={!onlyIssues} onClick={() => setOnlyIssues(false)} className={tabCls(!onlyIssues)}>
                        전체
                    </button>
                    <button type="button" role="tab" aria-selected={onlyIssues} onClick={() => setOnlyIssues(true)} className={tabCls(onlyIssues)}>
                        확인 필요한 행 {fmt(issueCount)}
                    </button>
                </div>
                <div className="min-h-0 flex-1 overflow-auto border-t border-[#E5E7EB]">
                    <table className="w-full min-w-[640px] border-collapse text-[12px]">
                        <thead>
                            <tr className="sticky top-0 bg-[#F9FAFB] text-left text-[11px] font-semibold text-gray-500">
                                <th className="whitespace-nowrap border-b border-[#F3F4F6] px-2.5 py-[7px]">행</th>
                                <th className="whitespace-nowrap border-b border-[#F3F4F6] px-2.5 py-[7px]">PNU(원본)</th>
                                <th className="whitespace-nowrap border-b border-[#F3F4F6] px-2.5 py-[7px]">상태</th>
                                <th className="whitespace-nowrap border-b border-[#F3F4F6] px-2.5 py-[7px]">지번주소</th>
                                <th className="whitespace-nowrap border-b border-[#F3F4F6] px-2.5 py-[7px]">도로명주소(대표)</th>
                            </tr>
                        </thead>
                        <tbody>
                            {preview.rows.map((r) => (
                                <tr key={r.rowNumber}>
                                    <td className="whitespace-nowrap border-b border-[#F3F4F6] px-2.5 py-[7px] tabular-nums">{r.rowNumber}</td>
                                    <td className="whitespace-nowrap border-b border-[#F3F4F6] px-2.5 py-[7px] font-mono text-[11.5px] text-gray-700">{r.rawPnu || '—'}</td>
                                    <td className="whitespace-nowrap border-b border-[#F3F4F6] px-2.5 py-[7px]">
                                        <span title={r.detail ?? undefined} className={`rounded px-1.5 py-0.5 text-[10.5px] font-bold ${TONE_CLASS[r.status.tone]}`}>
                                            {r.status.label}
                                        </span>
                                    </td>
                                    <td className="whitespace-nowrap border-b border-[#F3F4F6] px-2.5 py-[7px]">{r.jibun ?? '—'}</td>
                                    <td className="whitespace-nowrap border-b border-[#F3F4F6] px-2.5 py-[7px]">
                                        {r.road ?? '—'}
                                        {r.moreRoads > 0 && (
                                            <span title={r.allRoads ?? undefined} className="ml-1 rounded bg-[#FFF7ED] px-[5px] py-px text-[10px] font-bold text-[#F26722]">
                                                +{r.moreRoads}
                                            </span>
                                        )}
                                    </td>
                                </tr>
                            ))}
                            {preview.rows.length === 0 && (
                                <tr><td colSpan={5} className="px-2.5 py-6 text-center text-[12px] text-gray-500">표시할 행이 없습니다.</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
                <div className="flex shrink-0 flex-wrap justify-between gap-1.5 border-t border-[#E5E7EB] px-3.5 py-2.5 text-[11.5px] text-gray-500">
                    <span>결과 파일에는 원본 열 오른쪽에 {RESULT_COLUMN_NAMES.join(' · ')}이(가) 붙습니다.</span>
                    <span>{fmt(preview.rows.length)} / {fmt(preview.total)}행 표시(앞 {PREVIEW_ROWS}행까지)</span>
                </div>
            </div>
        </div>,
        document.body,
    )
}
