'use client'

// 영역 분석 결과 목록(원격 레이어 — GeoServer·VWorld): 선택된 피처의 속성 + 면적·잘라낸 면적을 표로. 받은 순서 그대로, 쪽당 100행.
// 행을 누르면 지도가 그 피처로 이동하고 빨간 강조가 붙으며 모달은 작은 막대로 접힌다(막대를 누르면 같은 쪽으로 펼침).
// 지도에서 강조 피처를 누르면(활성 피처가 바뀌면) 이 목록의 그 행으로 쪽이 넘어간다. 모달 모양은 속성 테이블과 같은 gm-modal·gm-table-dialog.
import { useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { ChevronLeft, ChevronRight, Table2, X } from 'lucide-react'
import type { AreaResultRecord, LayerAnalysisResult } from '../../core'
import { cx } from '../cx'
import { formatCount } from '../mymap/format'
import { CELL_MAX_CHARS, CELL_TITLE_MAX_CHARS, CELL_TITLE_MIN_CHARS, TABLE_PAGE_SIZE, cellText, clampPage, clipText, pageCount, pageRange } from '../mymap/tableModel'
import { LIST_MAX_COLUMNS, formatAreaText, listColumns } from './areaAnalysisModel'

export interface ResultListDialogProps {
    result: LayerAnalysisResult
    records: readonly AreaResultRecord[]
    /** 지도·목록에서 가리키는 피처의 번호(이 레이어 것일 때만, 아니면 null) */
    activeIndex: number | null
    onPick(index: number): void
    onClose(): void
}

export default function ResultListDialog({ result, records, activeIndex, onPick, onClose }: ResultListDialogProps) {
    const [page, setPage] = useState(0)
    const [pageDraft, setPageDraft] = useState<string | null>(null)
    const [minimized, setMinimized] = useState(false)
    const pillOpenRef = useRef<HTMLButtonElement>(null)
    const columns = useMemo(() => listColumns(result), [result])
    const hasArea = result.sumAreaM2 !== null
    const total = records.length
    const pages = pageCount(total)
    const safePage = clampPage(page, total)
    const { start, end } = pageRange(safePage, total)

    // Esc로 닫기
    const closeRef = useRef(onClose)
    closeRef.current = onClose
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') closeRef.current() }
        document.addEventListener('keydown', onKey)
        return () => document.removeEventListener('keydown', onKey)
    }, [])
    useEffect(() => { if (minimized) pillOpenRef.current?.focus() }, [minimized])

    // 지도에서 강조 피처를 눌렀다 → 그 행이 보이는 쪽으로(활성 피처가 바뀔 때만)
    useEffect(() => {
        if (activeIndex === null) return
        const pos = records.findIndex(r => r.index === activeIndex)
        if (pos >= 0) setPage(Math.floor(pos / TABLE_PAGE_SIZE))
        // records·쪽 상태가 바뀔 때는 쪽을 건드리지 않는다
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeIndex])

    const commitPage = () => {
        const n = Number.parseInt(pageDraft ?? '', 10)
        if (Number.isFinite(n)) setPage(clampPage(n - 1, total))
        setPageDraft(null)
    }

    const pick = (index: number) => {
        onPick(index)
        setMinimized(true)
    }

    const rows: ReactNode[] = []
    for (let p = start; p < end; p++) {
        const rec = records[p]
        rows.push(
            <tr key={rec.index} className={cx('gm-table-dialog__row--go', activeIndex === rec.index && 'gm-is-picked')}
                tabIndex={0} title="누르면 지도에서 이 위치로 이동합니다" onClick={() => pick(rec.index)}
                onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(rec.index) } }}>
                <td className="gm-table-dialog__rowno">{rec.index + 1}</td>
                {columns.map(c => {
                    const v = rec.props[c.name]
                    const full = cellText(v)
                    return (
                        <td key={c.name} className={cx(typeof v === 'number' && 'gm-table-dialog__num')}
                            title={full.length > CELL_TITLE_MIN_CHARS ? clipText(full, CELL_TITLE_MAX_CHARS) : undefined}>
                            {clipText(full, CELL_MAX_CHARS)}
                        </td>
                    )
                })}
                {hasArea && <td className="gm-table-dialog__num">{rec.areaM2 === null ? '' : formatAreaText(rec.areaM2)}</td>}
                {hasArea && <td className="gm-table-dialog__num">{rec.clipAreaM2 === null ? '' : formatAreaText(rec.clipAreaM2)}</td>}
            </tr>,
        )
    }

    return (
        <>
            <div className={cx('gm-modal', minimized && 'gm-is-min')} onClick={onClose}>
                <div onClick={e => e.stopPropagation()} className="gm-modal__dialog gm-table-dialog" role="dialog" aria-modal="true" aria-label={`영역 분석 결과 목록 — ${result.name}`}>
                    <div className="gm-modal__header">
                        <span className="gm-modal__title gm-table-dialog__title">
                            <span className="gm-table-dialog__name">결과 목록 — {result.name}</span>
                            <span className="gm-table-dialog__dims">{formatCount(total)}행</span>
                        </span>
                        <button onClick={onClose} className="gm-modal__close" aria-label="닫기"><X size={16} /></button>
                    </div>
                    {total === 0 ? (
                        <div className="gm-modal__body"><div className="gm-panel__empty">표시할 피처가 없습니다</div></div>
                    ) : (
                        <>
                            {result.columns.length > LIST_MAX_COLUMNS && (
                                <div className="gm-table-dialog__toolbar">
                                    <span className="gm-table-dialog__note">열이 많아 앞의 {formatCount(LIST_MAX_COLUMNS)}개만 표시합니다(전체 {formatCount(result.columns.length)}열 — 내보내기에는 모두 들어갑니다)</span>
                                </div>
                            )}
                            <div className="gm-table-dialog__scroll">
                                <table className="gm-table-dialog__table gm-table-dialog__table--plain">
                                    <thead>
                                        <tr>
                                            <th className="gm-table-dialog__rowno">#</th>
                                            {columns.map(c => <th key={c.name} title={c.name}><span className="gm-table-dialog__col-name">{c.label}</span></th>)}
                                            {hasArea && <th className="gm-table-dialog__num"><span className="gm-table-dialog__col-name">면적</span></th>}
                                            {hasArea && <th className="gm-table-dialog__num"><span className="gm-table-dialog__col-name">잘라낸 면적</span></th>}
                                        </tr>
                                    </thead>
                                    <tbody>{rows}</tbody>
                                </table>
                            </div>
                            <div className="gm-table-dialog__pager">
                                <button type="button" className="gm-report__page-btn" disabled={safePage <= 0} aria-label="이전 쪽" onClick={() => setPage(safePage - 1)}>
                                    <ChevronLeft size={13} />
                                </button>
                                <input type="number" min={1} max={pages} value={pageDraft ?? String(safePage + 1)} aria-label="쪽 번호"
                                    className="gm-table-dialog__page-input" onChange={e => setPageDraft(e.target.value)}
                                    onBlur={() => { if (pageDraft !== null) commitPage() }} onKeyDown={e => { if (e.key === 'Enter') commitPage() }} />
                                <span className="gm-table-dialog__page-info">
                                    / {formatCount(pages)} 쪽 · {formatCount(start + 1)}–{formatCount(end)}행 (페이지당 {TABLE_PAGE_SIZE}행)
                                </span>
                                <button type="button" className="gm-report__page-btn" disabled={safePage + 1 >= pages} aria-label="다음 쪽" onClick={() => setPage(safePage + 1)}>
                                    <ChevronRight size={13} />
                                </button>
                            </div>
                        </>
                    )}
                </div>
            </div>
            {minimized && (
                <div className="gm-table-dialog__pill" role="region" aria-label="결과 목록(접힘)">
                    <button type="button" ref={pillOpenRef} className="gm-table-dialog__pill-open" onClick={() => setMinimized(false)}>
                        <Table2 size={12} /> 결과 목록 — {result.name} · 펼치기
                    </button>
                    <button type="button" className="gm-table-dialog__pill-close" aria-label="닫기" onClick={onClose}><X size={12} /></button>
                </div>
            )}
        </>
    )
}
