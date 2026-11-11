'use client'

// 나만의지도 업로드 결과 보고서 — 한 줄 요약(모두 표시 / N행 중 M행 / 모두 못 찾음) · 요약(전체·매칭·실패) · 사유별 막대(누르면 그 사유만) · 실패 행 표(페이지) · 실패 행 엑셀 받기.
// 소유자만 열 수 있다(서버가 403). 요청은 엔진의 나만의지도 소스(importReport·downloadImportFailures)가 보낸다.
// 처리 실패(failure 지정)는 보고서를 부르지 않고 이유 문장만 보여 준다(목록 행에는 이유를 안 적으므로 여기서 본다).
// 지도 위 모달이라 바깥 클릭으로 닫히지 않는다(X·확인 단추만). auto(처음 등록 직후 자동으로 띄운 창)는 요약이 오기 전엔 아무것도 그리지 않고,
// 조회에 실패하면 오류 창을 띄우지 않고 조용히 닫힌다. 창이 보이면 창으로 포커스를 옮기고(자동·수동 모두), 닫히면 열기 전 있던 곳으로 되돌린다.
// 스타일: gm-modal(업로드·공유와 공용), gm-report
import { useEffect, useRef, useState } from 'react'
import { X, Loader2, Download, ChevronLeft, ChevronRight, CheckCircle2, AlertTriangle, XCircle } from 'lucide-react'
import type { MyMapImportReport } from '../../core'
import { useGisMap } from '../../react'
import { cx } from '../cx'
import { formatCount, reasonLabel, safeFileName } from './format'
import { saveBlob } from './saveBlob'

interface MyMapImportReportProps {
    id: number
    name: string
    onClose: () => void
    /** 처음 등록 직후 자동으로 띄운 창 — 요약이 오기 전엔 안 그리고, 조회 실패면 조용히 닫는다 */
    auto?: boolean
    /** 처리 실패(FAILED) 레이어면 이유 문장(없으면 null). 지정하면 보고서를 부르지 않는다 */
    failure?: { message: string | null } | null
}

const HEADLINE_CLASS: Readonly<Record<'ok' | 'warn' | 'fail', string>> = Object.freeze({
    ok: 'gm-report__headline--ok', warn: 'gm-report__headline--warn', fail: 'gm-report__headline--fail',
})

/** 요약 한 줄(순수) — 실패 0 / 일부 / 전부. 단위는 행 */
export function reportHeadline(summary: Pick<MyMapImportReport, 'total' | 'matched' | 'failed'>): { tone: 'ok' | 'warn' | 'fail'; text: string; sub: string | null } {
    const { total, matched, failed } = summary
    if (failed <= 0) {
        return matched > 0
            ? { tone: 'ok', text: '모두 지도에 표시했습니다', sub: `전체 ${formatCount(total)}행` }
            : { tone: 'warn', text: '지도에 표시할 행이 없습니다', sub: null }
    }
    if (matched <= 0) return { tone: 'fail', text: `${formatCount(total)}행 모두 위치를 못 찾았습니다`, sub: null }
    return { tone: 'warn', text: `${formatCount(total)}행 중 ${formatCount(matched)}행을 지도에 표시했습니다`, sub: `${formatCount(failed)}행은 위치를 못 찾았습니다` }
}

/** 한 번에 보는 실패 행 수 */
const PAGE_SIZE = 100

export default function MyMapImportReportDialog({ id, name, onClose, auto, failure }: MyMapImportReportProps) {
    // 소스 객체는 엔진마다 하나(참조 고정) → 아래 effect가 다시 돌지 않는다
    const myMap = useGisMap()?.sources.myMap
    const [page, setPage] = useState(0)
    const [reason, setReason] = useState<string | null>(null)
    const [report, setReport] = useState<MyMapImportReport | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [downloading, setDownloading] = useState(false)
    // 요약·사유별 막대는 첫 응답(필터 없음)으로 고정한다 — 사유를 눌러도 막대가 사라지지 않게
    const [overview, setOverview] = useState<MyMapImportReport | null>(null)

    // 부모가 매 렌더 새 onClose를 줘도 아래 효과가 다시 돌지 않게
    const closeRef = useRef(onClose)
    closeRef.current = onClose
    // 포커스 이동·복귀: 열기 전에 있던 요소(업로드 단추·⋯ 단추 등)를 기억했다가 닫을 때 되돌린다
    const dialogRef = useRef<HTMLDivElement>(null)
    const prevFocusRef = useRef<Element | null>(typeof document !== 'undefined' ? document.activeElement : null)
    useEffect(() => {
        const prev = prevFocusRef.current
        return () => {
            if (prev instanceof HTMLElement && prev.isConnected) prev.focus({ preventScroll: true })
        }
    }, [])
    const failed = !!failure

    useEffect(() => {
        if (failed) {
            setLoading(false)
            return
        }
        let cancelled = false
        setLoading(true)
        setError(null)
        ;(async () => {
            try {
                if (!myMap?.importReport) throw new Error('보고서를 불러오지 못했습니다')
                const res = await myMap.importReport(id, { page, size: PAGE_SIZE, ...(reason ? { reason } : {}) })
                if (cancelled) return
                setReport(res)
                if (!reason) setOverview(res)
            } catch (e) {
                if (!cancelled) setError(e instanceof Error ? e.message : '보고서를 불러오지 못했습니다')
            } finally {
                if (!cancelled) setLoading(false)
            }
        })()
        return () => {
            cancelled = true
        }
    }, [id, myMap, page, reason, failed])

    // 자동으로 띄운 창은 조회에 실패하면 오류만 보이지 않게 조용히 닫는다
    const summaryReady = overview !== null || report !== null
    useEffect(() => {
        if (auto && !failed && error && !summaryReady) closeRef.current()
    }, [auto, failed, error, summaryReady])

    const handleDownload = async () => {
        setDownloading(true)
        setError(null)
        try {
            if (!myMap?.downloadImportFailures) throw new Error('실패 행 엑셀을 받지 못했습니다')
            saveBlob(await myMap.downloadImportFailures(id), `나만의지도_실패행_${safeFileName(name)}.xlsx`)
        } catch (e) {
            setError(e instanceof Error ? e.message : '실패 행 엑셀을 받지 못했습니다')
        } finally {
            setDownloading(false)
        }
    }

    const toggleReason = (code: string) => {
        setPage(0)
        setReason(cur => (cur === code ? null : code))
    }

    const summary = overview ?? report
    const reasons = summary ? Object.entries(summary.byReason).sort((a, b) => b[1] - a[1]) : []
    const maxCount = reasons.length > 0 ? reasons[0][1] : 0
    // 실패 수는 있는데 상세 행이 하나도 없다 = 보관 기간(30일)이 지나 지워졌다
    const rowsExpired = !!report && !reason && !loading && summary !== null && summary.failed > 0 && report.rows.length === 0 && report.totalRows === 0
    const totalPages = report ? Math.max(1, Math.ceil(report.totalRows / (report.size || PAGE_SIZE))) : 1

    // 자동 창: 요약이 올 때까지(또는 조용히 닫힐 때까지) 아무것도 그리지 않는다
    const hidden = !!auto && !failed && !summary
    // 보이게 되면 창으로 포커스(화면 낭독기가 창 이름을 읽고 Tab이 창 안에서 시작)
    useEffect(() => {
        if (!hidden) dialogRef.current?.focus({ preventScroll: true })
    }, [hidden])
    if (hidden) return null

    const headline = summary && !failed ? reportHeadline(summary) : null
    const HeadIcon = headline?.tone === 'ok' ? CheckCircle2 : headline?.tone === 'fail' ? XCircle : AlertTriangle

    return (
        <div className="gm-modal">
            <div ref={dialogRef} tabIndex={-1} className="gm-modal__dialog gm-report" role="dialog" aria-modal="true" aria-label={`업로드 결과 ${name}`}>
                <div className="gm-modal__header">
                    <span className="gm-modal__title">업로드 결과 — {name}</span>
                    <button onClick={onClose} className="gm-modal__close" aria-label="닫기"><X size={16} /></button>
                </div>

                {failed ? (
                    <div className="gm-modal__body">
                        <div className="gm-report__headline gm-report__headline--fail" role="status">
                            <XCircle size={15} aria-hidden="true" />
                            <span className="gm-report__headline-text">등록하지 못했습니다</span>
                        </div>
                        <div className="gm-report__failmsg">{failure?.message || '이유를 받지 못했습니다. 파일을 확인하고 다시 올려 주세요.'}</div>
                        <div className="gm-modal__note">목록의 ⋯ 메뉴에서 지우고, 고친 파일을 다시 올려 주세요. 등록하지 못한 레이어도 개수 한도에 들어갑니다.</div>
                        <button type="button" onClick={onClose} className="gm-report__confirm">확인</button>
                    </div>
                ) : !summary && loading ? (
                    <div className="gm-modal__loading">
                        <Loader2 size={18} className="gm-loader gm-loader--primary" />
                    </div>
                ) : !summary ? (
                    <div className="gm-modal__body">
                        {error && <div className="gm-modal__error">{error}</div>}
                    </div>
                ) : (
                    <div className="gm-modal__body">
                        {headline && (
                            <div className={cx('gm-report__headline', HEADLINE_CLASS[headline.tone])} role="status">
                                <HeadIcon size={15} aria-hidden="true" />
                                <span className="gm-report__headline-text">
                                    {headline.text}
                                    {headline.sub && <span className="gm-report__headline-sub">{headline.sub}</span>}
                                </span>
                            </div>
                        )}
                        <div className="gm-report__cards">
                            <div className="gm-report__card">
                                <span className="gm-report__card-label">전체</span>
                                <span className="gm-report__card-value">{formatCount(summary.total)}</span>
                            </div>
                            <div className="gm-report__card gm-report__card--ok">
                                <span className="gm-report__card-label">매칭</span>
                                <span className="gm-report__card-value">{formatCount(summary.matched)}</span>
                            </div>
                            <div className={cx('gm-report__card', summary.failed > 0 ? 'gm-report__card--fail' : 'gm-report__card--zero')}>
                                <span className="gm-report__card-label">실패</span>
                                <span className="gm-report__card-value">{formatCount(summary.failed)}</span>
                            </div>
                        </div>

                        {(summary.duplicatePnuCount ?? 0) > 0 && (
                            <div className="gm-report__dup">중복 PNU {formatCount(summary.duplicatePnuCount ?? 0)}건(같은 PNU도 행마다 피처가 만들어졌습니다)</div>
                        )}

                        {reasons.length > 0 && (
                            <div className="gm-report__reasons">
                                <div className="gm-modal__label">실패 사유 (누르면 그 사유만 표시)</div>
                                {reasons.map(([code, count]) => (
                                    <button key={code} type="button" onClick={() => toggleReason(code)}
                                        className={cx('gm-report__reason', reason === code && 'gm-is-active')}>
                                        <span className="gm-report__reason-name">{reasonLabel(code)}</span>
                                        <span className="gm-report__reason-bar">
                                            <span className="gm-report__reason-fill" style={{ width: `${maxCount > 0 ? Math.max(4, Math.round((count / maxCount) * 1000) / 10) : 0}%` }} />
                                        </span>
                                        <span className="gm-report__reason-count">{formatCount(count)}</span>
                                    </button>
                                ))}
                            </div>
                        )}

                        {report && report.rows.length > 0 && (
                            <>
                                <div className="gm-report__table-wrap">
                                    <table className="gm-report__table">
                                        <thead>
                                            <tr><th>행</th><th>입력값</th><th>사유</th><th>후보</th></tr>
                                        </thead>
                                        <tbody>
                                            {report.rows.map(r => (
                                                <tr key={r.rowNo}>
                                                    <td>{r.rowNo}</td>
                                                    <td title={r.input ?? ''}>{r.input ?? ''}</td>
                                                    <td title={r.message}>{r.message || reasonLabel(r.reason)}</td>
                                                    <td title={(r.candidates ?? []).join(' / ')}>{(r.candidates ?? []).join(' / ')}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                                {totalPages > 1 && (
                                    <div className="gm-report__pager">
                                        <button type="button" className="gm-report__page-btn" disabled={loading || report.page <= 0}
                                            aria-label="이전 쪽" onClick={() => setPage(p => Math.max(0, p - 1))}>
                                            <ChevronLeft size={13} />
                                        </button>
                                        <span>{report.page + 1} / {totalPages} 쪽 · 실패 {formatCount(report.totalRows)}행</span>
                                        <button type="button" className="gm-report__page-btn" disabled={loading || report.page + 1 >= totalPages}
                                            aria-label="다음 쪽" onClick={() => setPage(p => p + 1)}>
                                            <ChevronRight size={13} />
                                        </button>
                                    </div>
                                )}
                            </>
                        )}
                        {rowsExpired && (
                            <div className="gm-panel__empty">보관 기간(30일)이 지나 실패 행 상세가 삭제되었습니다. 필요하면 파일을 다시 올려 주세요.</div>
                        )}

                        {error && <div className="gm-modal__error">{error}</div>}

                        {summary.failed > 0 && (
                            <>
                                {myMap?.downloadImportFailures && !rowsExpired && (
                                    <button type="button" onClick={handleDownload} disabled={downloading} className="gm-modal__submit">
                                        {downloading ? <Loader2 size={13} className="gm-loader" /> : <Download size={13} />}
                                        실패 행 엑셀 받기
                                    </button>
                                )}
                                {!rowsExpired && <div className="gm-modal__note">고친 행만 새 파일로 올리면 새 레이어가 됩니다.</div>}
                            </>
                        )}
                        <button type="button" onClick={onClose} className="gm-report__confirm">확인</button>
                    </div>
                )}
            </div>
        </div>
    )
}
