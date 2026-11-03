'use client'

// 영역 분석 결과 카드(레이어 하나): 상태 · 개수/면적 · 숫자 열 · 범주 집계표 · 경고 · 표/CSV/GeoJSON.
// 숫자는 전부 엔진 결과(LayerAnalysisResult)를 그대로 보여 주고, 취소·오류는 숫자를 내지 않는다.
import { AlertTriangle, Download, Table2 } from 'lucide-react'
import type { LayerAnalysisResult } from '../../core'
import { formatCount } from '../mymap/format'
import {
    CANCELLED_NOTE, badgeClass, statusClass, NO_HIT_NOTE, OFF_MAP_NOTE, categoryOptions, categoryRows, countLabel, formatAreaCompact,
    formatPercent, kindSummary, progressNote, providerLabel, statusView,
} from './areaAnalysisModel'

export interface LayerResultCardProps {
    result: LayerAnalysisResult
    /** 결과 목록 열기(끝난 결과에서만 넘긴다) */
    onList?(): void
    onCategory(column: string | null): void
    onExport(format: 'csv' | 'geojson'): void
}

export default function LayerResultCard({ result: r, onList, onCategory, onExport }: LayerResultCardProps) {
    const st = statusView(r)
    const finished = r.status === 'done' || r.status === 'partial'
    return (
        <section className="gm-analysis__card" aria-label={r.name + ' 결과'}>
            <header className="gm-analysis__card-head">
                <span className={badgeClass(r.provider)}>{providerLabel(r.provider)}</span>
                <span className="gm-analysis__card-name" title={r.name}>{r.name}</span>
                <span className={statusClass(st.tone)}>{st.label}</span>
            </header>

            {(r.status === 'computing' || r.status === 'counting' || r.status === 'loading' || r.status === 'confirm') && (
                <div className="gm-analysis__card-body">
                    <div className="gm-analysis__progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(r.progress * 100)}>
                        <i style={{ width: Math.round(r.progress * 100) + '%' }} />
                    </div>
                    <p className="gm-analysis__fine">{progressNote(r)}</p>
                </div>
            )}
            {r.status === 'error' && (
                <div className="gm-analysis__card-body"><div className="gm-analysis__error">{r.error}</div></div>
            )}
            {r.status === 'cancelled' && (
                <div className="gm-analysis__card-body"><p className="gm-analysis__fine">{r.error ?? CANCELLED_NOTE}</p></div>
            )}

            {finished && (
                <div className="gm-analysis__card-body">
                    {r.offMap && <div className="gm-analysis__warn"><AlertTriangle size={12} /><span>{OFF_MAP_NOTE}</span></div>}
                    {r.warnings.map(w => (
                        <div key={w.code} className="gm-analysis__warn"><AlertTriangle size={12} /><span>{w.message}</span></div>
                    ))}
                    {r.count === 0 ? <p className="gm-analysis__fine">{NO_HIT_NOTE}</p> : (
                        <>
                            {/* 카드에는 매칭된 건수만 크게 보인다 — 면적 합계·열 통계는 사용자 요청으로 뺐다(범주 집계표·목록·내보내기에는 남아 있다).
                                요약 줄: 왼쪽 건수 · 오른쪽 범주 열 선택 */}
                            <div className="gm-analysis__summary">
                                <div className="gm-analysis__kv">
                                    <div className="gm-analysis__kv-item gm-is-main">
                                        <span className="gm-analysis__kv-k">{countLabel(r)}</span>
                                        <span className="gm-analysis__kv-v">{formatCount(r.count)}<small>건</small></span>
                                    </div>
                                </div>
                                {r.columns.length > 0 && (
                                    <label className="gm-analysis__cat-select">
                                        <span>범주 열</span>
                                        <select value={r.category ? r.category.column : ''} onChange={e => onCategory(e.target.value === '' ? null : e.target.value)}>
                                            <option value="">(고르지 않음)</option>
                                            {categoryOptions(r).map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                                        </select>
                                    </label>
                                )}
                            </div>
                            {kindSummary(r) !== '' && (r.byKind.polygon > 0 ? 1 : 0) + (r.byKind.line > 0 ? 1 : 0) + (r.byKind.point > 0 ? 1 : 0) > 1 && (
                                <p className="gm-analysis__fine">{kindSummary(r)}</p>
                            )}
                            {r.category && (
                                <table className="gm-analysis__table" aria-label="범주 집계표">
                                    <thead>
                                        <tr>
                                            <th>{r.category.label}</th><th>건</th>{r.clipAreaM2 !== null && <th>잘라낸 면적</th>}<th>비율</th><th />
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {categoryRows(r, r.category).map(row => (
                                            <tr key={row.key} className={row.rowClass || undefined}>
                                                <td title={row.label}>{row.label}</td>
                                                <td>{formatCount(row.count)}</td>
                                                {r.clipAreaM2 !== null && <td>{row.areaText}</td>}
                                                <td>{row.ratioText}</td>
                                                <td className="gm-analysis__bar"><i style={{ width: row.bar + '%' }} /></td>
                                            </tr>
                                        ))}
                                        <tr className="gm-is-sum">
                                            <td>합계</td>
                                            <td>{formatCount(r.count)}</td>
                                            {r.clipAreaM2 !== null && <td>{formatAreaCompact(r.clipAreaM2).value + ' ' + formatAreaCompact(r.clipAreaM2).unit}</td>}
                                            <td>{formatPercent(1, 1)}</td>
                                            <td />
                                        </tr>
                                    </tbody>
                                </table>
                            )}
                            {r.category && r.category.distinctCapped && (
                                <p className="gm-analysis__fine">서로 다른 값이 너무 많아 일부는 기타로 묶어 셌습니다.</p>
                            )}
                        </>
                    )}
                </div>
            )}

            {finished && r.count > 0 && (
                <footer className="gm-analysis__card-foot">
                    {onList && (
                        <button type="button" className="gm-analysis__btn gm-analysis__btn--sm" onClick={onList}>
                            <Table2 size={12} />목록
                        </button>
                    )}
                    <button type="button" className="gm-analysis__btn gm-analysis__btn--sm" onClick={() => onExport('csv')}>
                        <Download size={12} />CSV
                    </button>
                    <button type="button" className="gm-analysis__btn gm-analysis__btn--sm" onClick={() => onExport('geojson')}>GeoJSON</button>
                </footer>
            )}
        </section>
    )
}
