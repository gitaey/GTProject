'use client'

// 주소 변환 결과 화면 — 업로드 마법사가 변환을 끝내면 같은 자리에서 이 화면으로 바뀐다.
// 전체·성공·실패 카드 / 결과 파일(엑셀 다시 받기 = 메모리의 Blob을 다시 저장, 서버 재요청 없음) / 미리보기 표(붙은 열 주황, 실패 행 연한 빨강).
// 스타일: gm-modal, gm-upload-modal(--result), gm-report 카드, gm-wizard 표·하단, gm-convert-result
import { useState } from 'react'
import { X, Download } from 'lucide-react'
import type { MyMapConvertResult } from '../../core'
import { cx } from '../cx'
import { appendedStart, CONVERT_PREVIEW_ROWS, FAILED_STATUS, formatBytes, isFailedRow } from './convertModel'
import { formatCount } from './format'
import { saveBlob } from './saveBlob'

interface MyMapConvertResultDialogProps {
    /** 올린 원본 파일 이름(제목에 표시) */
    sourceName: string
    result: MyMapConvertResult
    /** 자동 내려받기가 실패했을 때 마법사가 넘기는 안내 */
    notice?: string | null
    /** 고친 행만 다시 올리기 — 마법사 처음으로 */
    onRestart: () => void
    onClose: () => void
}

export default function MyMapConvertResultDialog({ sourceName, result, notice, onRestart, onClose }: MyMapConvertResultDialogProps) {
    const [error, setError] = useState<string | null>(notice ?? null)
    const { columns, rows } = result.preview
    const start = appendedStart(columns)
    const statusAt = start
    const shown = rows.slice(0, CONVERT_PREVIEW_ROWS)
    const hasAppended = start >= 0

    // 메모리에 둔 결과를 그대로 다시 저장한다(서버에 다시 묻지 않는다)
    const saveAgain = () => {
        setError(null)
        try {
            saveBlob(result.file, result.fileName)
        } catch (e) {
            setError(e instanceof Error && e.message ? e.message : '파일을 저장하지 못했습니다')
        }
    }

    return (
        <div className="gm-modal" onClick={onClose}>
            <div onClick={e => e.stopPropagation()} className="gm-modal__dialog gm-upload-modal gm-upload-modal--result"
                role="dialog" aria-label="주소 변환 결과">
                <div className="gm-modal__header">
                    <span className="gm-modal__title gm-convert-result__title" title={sourceName}>주소 변환 결과 — {sourceName}</span>
                    <button onClick={onClose} className="gm-modal__close" aria-label="닫기"><X size={16} /></button>
                </div>

                <div className="gm-modal__body">
                    <div className="gm-report__cards">
                        <div className="gm-report__card">
                            <span className="gm-report__card-label">전체</span>
                            <span className="gm-report__card-value">{formatCount(result.total)}</span>
                        </div>
                        <div className="gm-report__card gm-report__card--ok">
                            <span className="gm-report__card-label">변환 성공</span>
                            <span className="gm-report__card-value">{formatCount(result.matched)}</span>
                        </div>
                        <div className="gm-report__card gm-report__card--fail">
                            <span className="gm-report__card-label">실패</span>
                            <span className="gm-report__card-value">{formatCount(result.failed)}</span>
                        </div>
                    </div>

                    <div className="gm-convert-result__file">
                        <div className="gm-convert-result__file-info">
                            <span className="gm-convert-result__file-name" title={result.fileName}>{result.fileName}</span>
                            <span className="gm-convert-result__file-meta">엑셀 · {formatBytes(result.file.size)} · 실패 행은 사유와 함께 남아 있습니다</span>
                        </div>
                        <button type="button" className="gm-wizard__submit" onClick={saveAgain}>
                            <Download size={13} /> 엑셀 다시 받기
                        </button>
                    </div>

                    {shown.length > 0 && columns.length > 0 && (
                        <>
                            <span className="gm-modal__label">
                                미리보기 <span className="gm-convert-result__hint">(앞 {CONVERT_PREVIEW_ROWS}행{hasAppended ? ' · 붙은 열은 주황 머리글' : ''})</span>
                            </span>
                            <div className="gm-wizard__table-wrap">
                                <table className="gm-wizard__table">
                                    <thead>
                                        <tr>
                                            {columns.map((c, ci) => (
                                                <th key={ci} className={cx(hasAppended && ci >= start && 'gm-is-appended')}>{c}</th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {shown.map((row, ri) => (
                                            <tr key={ri} className={cx(isFailedRow(columns, row) && 'gm-is-fail')}>
                                                {columns.map((_, ci) => {
                                                    const v = row[ci] ?? ''
                                                    const isStatus = ci === statusAt
                                                    return (
                                                        <td key={ci} title={v}
                                                            className={cx(hasAppended && ci >= start && 'gm-is-appended',
                                                                isStatus && (v.trim() === FAILED_STATUS ? 'gm-is-bad' : v.trim() ? 'gm-is-ok' : false))}>
                                                            {v}
                                                        </td>
                                                    )
                                                })}
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                            {hasAppended && (
                                <div className="gm-convert-result__legend">
                                    <span><i className="gm-convert-result__swatch gm-convert-result__swatch--add" />붙은 열</span>
                                    <span><i className="gm-convert-result__swatch gm-convert-result__swatch--fail" />실패 행(사유는 마지막 열)</span>
                                </div>
                            )}
                        </>
                    )}

                    {error && <div className="gm-modal__error">{error}</div>}
                </div>

                <div className="gm-wizard__footer">
                    <span className="gm-wizard__footer-note">이 파일은 서버에 저장되지 않았습니다.</span>
                    <button type="button" className="gm-wizard__back" onClick={onRestart}>고친 행만 다시 올리기</button>
                    <button type="button" className="gm-wizard__submit" onClick={onClose}>닫기</button>
                </div>
            </div>
        </div>
    )
}
