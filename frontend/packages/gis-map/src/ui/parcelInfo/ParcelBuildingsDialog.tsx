'use client'

// 필지 정보 카드의 "건물 전체 보기" 대화상자: 도로명주소 묶음별 건물 표(동·건물명·시군구용 이름·건물관리번호) + 검색.
// 카드 안이 아니라 지도 루트(gm-root)로 portal해 그린다(호출부) — 도구 모음(z-index 10) 안이면 모달(1000)이 왼쪽 패널 뒤로 깔린다.
// 모달 껍데기는 gm-modal 재사용, 안쪽은 gm-parcel-dialog*.
import { useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, Loader2, Search, X } from 'lucide-react'
import type { ParcelBuildingsResult } from '../../core'
import { cx } from '../cx'
import { dialogCountText, filterGroups } from './parcelInfoModel'

export interface ParcelBuildingsDialogProps {
    /** 지금까지 받은 결과(잘렸을 수 있다 — 전체를 받는 중이면 loadingAll) */
    result: ParcelBuildingsResult
    /** 전체(limit 1000) 목록을 받는 중 */
    loadingAll: boolean
    /** 전체 목록을 못 받았을 때의 사유 */
    error: string | null
    onRetry(): void
    onClose(): void
}

export default function ParcelBuildingsDialog({ result, loadingAll, error, onRetry, onClose }: ParcelBuildingsDialogProps) {
    const [query, setQuery] = useState('')
    const groups = useMemo(() => filterGroups(result.addresses, query), [result, query])
    const shown = useMemo(() => result.addresses.reduce((n, g) => n + g.buildings.length, 0), [result])

    // Esc로 닫기
    const closeRef = useRef(onClose)
    closeRef.current = onClose
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') closeRef.current() }
        document.addEventListener('keydown', onKey)
        return () => document.removeEventListener('keydown', onKey)
    }, [])

    return (
        <div className="gm-modal" onClick={onClose}>
            <div onClick={e => e.stopPropagation()} className="gm-modal__dialog gm-parcel-dialog" role="dialog" aria-modal="true" aria-label="필지의 건물 전체 보기">
                <div className="gm-modal__header">
                    <span className="gm-modal__title">
                        건물 전체 보기 <span className="gm-parcel-dialog__count">{dialogCountText(result, shown)}</span>
                    </span>
                    <button type="button" onClick={onClose} className="gm-modal__close" aria-label="닫기"><X size={16} /></button>
                </div>

                <div className="gm-parcel-dialog__tool">
                    <label className="gm-parcel-dialog__search">
                        <Search size={13} />
                        <input type="text" value={query} onChange={e => setQuery(e.target.value)} placeholder="주소·건물명·동 검색" aria-label="건물 검색" />
                    </label>
                    {loadingAll && <span className="gm-parcel-dialog__status"><Loader2 size={13} className="gm-loader" />전체 목록을 받는 중…</span>}
                </div>

                {error && (
                    <div className="gm-parcel-dialog__error" role="alert">
                        <AlertTriangle size={13} />
                        <span>{error}</span>
                        <button type="button" className="gm-parcel-card__link" onClick={onRetry}>다시 시도</button>
                    </div>
                )}
                {result.truncated && !loadingAll && !error && (
                    <div className="gm-parcel-dialog__note">전체 {result.buildingCount}동 중 {shown}동까지만 표시합니다.</div>
                )}

                <div className="gm-parcel-dialog__list">
                    {groups.length === 0 ? (
                        <div className="gm-parcel-dialog__empty">{query ? '검색 결과가 없습니다.' : '건물이 없습니다.'}</div>
                    ) : groups.map((g, i) => (
                        <section key={g.roadAddress + '|' + i} className="gm-parcel-dialog__group">
                            <h4 className="gm-parcel-dialog__addr">
                                <span>{g.roadAddress}</span>
                                {g.apartment && <span className="gm-parcel-card__badge gm-parcel-card__badge--apt">공동주택</span>}
                                {g.underground && <span className="gm-parcel-card__badge gm-parcel-card__badge--sub">지하</span>}
                                {g.relation === 'RELATED' && <span className="gm-parcel-card__badge gm-parcel-card__badge--rel">관련지번</span>}
                                <small>{g.name ?? '이름 없음'}{g.zipCode ? ` · 기초구역 ${g.zipCode}` : ''}</small>
                            </h4>
                            <table className="gm-parcel-dialog__table">
                                <thead>
                                    <tr><th>동</th><th>건물명</th><th>시군구용 이름</th><th className="gm-parcel-dialog__id">건물관리번호</th></tr>
                                </thead>
                                <tbody>
                                    {g.buildings.map(b => (
                                        <tr key={b.id}>
                                            <td>{b.detailName ?? '—'}</td>
                                            <td className={cx(!b.name && 'gm-is-empty')}>{b.name ?? '—'}</td>
                                            <td className={cx(!b.sggName && 'gm-is-empty')}>{b.sggName ?? '—'}</td>
                                            <td className="gm-parcel-dialog__id">{b.id}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </section>
                    ))}
                </div>
            </div>
        </div>
    )
}
