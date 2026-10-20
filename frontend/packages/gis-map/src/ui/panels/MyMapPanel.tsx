'use client'

// 나만의지도 패널 — 스타일: gm-panel(TIFF·나만의지도 공용), gm-mymap-panel
// 내 레이어 / 공유받은 레이어 두 묶음, 종류 배지, 처리 중 진행률 막대, 끝난 뒤 `매칭 N · 실패 M`(실패를 누르면 결과 보고서),
// 상단 `내 레이어 n/20`(한도는 소스의 quota가 있을 때만). 항목 상태(켜짐·실패·처리 중)에 따라 바뀌는 값만 인라인 style로 남겼다
import { useMemo, useState } from 'react'
import { Trash2, Upload, Loader2, AlertCircle, Share2, Locate, Lock } from 'lucide-react'
import { EMPTY_MYMAP_CATALOG_STATE } from '../../core'
import type { MyMapCatalogState, MyMapConfirmResult, UserMapListItem, VectorOverlayState } from '../../core'
import { useGisMap, useMyMapCatalog, useStoreValue, useVectorOverlayState } from '../../react'
import { cx } from '../cx'
import MyMapUploadModal from '../mymap/MyMapUploadModal'
import MyMapShareDialog from '../mymap/MyMapShareDialog'
import MyMapImportReportDialog from '../mymap/MyMapImportReport'
import { formatCount, kindLabel } from '../mymap/format'

/** 종류 배지 색 클래스(sourceKind를 아는 새 서버일 때만) */
const KIND_CLASS: Readonly<Record<string, string>> = Object.freeze({
    SHP: 'gm-mymap-panel__kind--shp', EXCEL_PNU: 'gm-mymap-panel__kind--pnu',
    EXCEL_ADDRESS: 'gm-mymap-panel__kind--address', EXCEL_COORD: 'gm-mymap-panel__kind--coord',
})

const selectCatalog = (s: MyMapCatalogState) => s
const selectVisibleIds = (s: VectorOverlayState) => s.visibleIds

// 목록·상태 폴링·삭제는 패널이 열려 있는 동안의 목록 객체(map.vector.openCatalog)가,
// 지도에 올린 레이어와 체크 상태는 엔진 인스턴스(map.vector)가 가진다 → 패널을 닫았다 열어도 체크 = 지도
export default function MyMapPanel() {
    const map = useGisMap()
    const vector = map?.vector ?? null
    const reportAvailable = !!map?.sources.myMap?.importReport
    const catalog = useMyMapCatalog()
    const { items, loading, quota } = useStoreValue(catalog?.store, selectCatalog, EMPTY_MYMAP_CATALOG_STATE)
    const visibleIdList = useVectorOverlayState(selectVisibleIds)
    const visibleIds = useMemo(() => new Set(visibleIdList), [visibleIdList])
    const [showUpload, setShowUpload] = useState(false)
    const [shareTarget, setShareTarget] = useState<{ id: number; name: string } | null>(null)
    const [reportTarget, setReportTarget] = useState<{ id: number; name: string } | null>(null)
    // 업로드 직후 확정 응답의 "예정" 기준월(처리 중인 동안만 쓴다 — 끝나면 목록·상태의 확정값). 패널이 닫히면 사라진다
    const [expectedVersions, setExpectedVersions] = useState<Readonly<Record<number, string>>>({})

    const owned = useMemo(() => items.filter(i => i.owner), [items])
    const shared = useMemo(() => items.filter(i => !i.owner), [items])
    // 한도: 서버가 준 maxLayers에 지금 목록의 내 레이어 수(업로드·삭제 직후에도 맞는 값)
    const maxLayers = quota?.maxLayers ?? null
    const layerFull = maxLayers !== null && owned.length >= maxLayers

    // 업로드 뒤 목록 다시 받기(옛 fetchList — loading 표시는 다시 켜지 않는다)
    const fetchList = (result?: MyMapConfirmResult) => {
        if (result && typeof result.parcelVersion === 'string' && result.parcelVersion) {
            const { id, parcelVersion } = result
            setExpectedVersions(cur => ({ ...cur, [id]: parcelVersion }))
        }
        void catalog?.load()
    }

    // 옛 동작: 서버 응답과 관계없이 지도·목록에서 뺀다(네트워크 오류만 드러남)
    const handleDelete = (id: number) => catalog?.remove(id)

    const toggleVisibility = (item: UserMapListItem) => {
        if (item.status !== 'READY') return
        if (visibleIds.has(item.id)) {
            vector?.hide(item.id)
        } else {
            void vector?.show(item.id)
        }
    }

    // 지도에 없으면 먼저 불러와 켠 뒤(체크도 켜짐) 피처 범위로 이동
    const handleLocate = async (item: UserMapListItem) => {
        if (item.status !== 'READY') return
        await vector?.zoomTo(item.id)
    }

    const renderItem = (item: UserMapListItem) => {
        const active = visibleIds.has(item.id)
        const isProcessing = item.status === 'PROCESSING'
        const isFailed = item.status === 'FAILED'
        const total = item.progressTotal ?? 0
        const done = Math.min(item.progressDone ?? 0, total)
        const hasProgress = isProcessing && total > 0
        const matched = item.matchedCount ?? 0
        const failedRows = item.failedCount ?? 0
        const hasResult = !isProcessing && matched + failedRows > 0
        // 보고서는 소유자만(서버가 403) — 소스가 importReport를 안 가졌으면 글자로만
        const canOpenReport = reportAvailable && item.owner && failedRows > 0
        return (
            <div key={item.id} className="gm-panel__item" style={{
                background: active ? 'rgba(var(--gm-primary-rgb), 0.04)' : 'transparent',
            }}>
                <input type="checkbox" checked={active} disabled={isProcessing || isFailed}
                    onChange={() => toggleVisibility(item)}
                    className="gm-panel__item-check"
                    style={{ cursor: isProcessing || isFailed ? 'default' : 'pointer' }} />

                <div className="gm-panel__item-body">
                    <div className="gm-panel__item-name" style={{
                        color: isFailed ? '#ef4444' : active ? '#111827' : '#374151',
                        fontWeight: active ? 500 : 400,
                    }}>
                        {item.name}
                        {!item.owner && (
                            <span className="gm-mymap-panel__shared">
                                {' '}<Lock size={9} className="gm-mymap-panel__lock" /> (공유됨)
                            </span>
                        )}
                    </div>
                    {!item.owner && item.ownerId && (
                        <div className="gm-mymap-panel__sender" title={`보낸 사람 ${item.ownerId}`}>보낸 사람 {item.ownerId}</div>
                    )}
                    <div className="gm-panel__item-meta gm-mymap-panel__meta">
                        <span>
                            <span className={cx('gm-mymap-panel__kind', item.sourceKind && 'gm-mymap-panel__kind--badge', item.sourceKind && KIND_CLASS[item.sourceKind])}>{kindLabel(item)}</span>
                            {' · '}{formatCount(item.featureCount)}개
                        </span>
                        {isProcessing && !hasProgress && (
                            <span className="gm-panel__item-status gm-panel__item-status--busy">
                                <Loader2 size={9} className="gm-loader" /> 처리 중
                            </span>
                        )}
                        {isFailed && (
                            <span className="gm-panel__item-status gm-panel__item-status--failed" title={item.errorMessage ?? undefined}>
                                <AlertCircle size={9} /> 실패
                            </span>
                        )}
                        {isProcessing && (item.parcelVersion ?? expectedVersions[item.id]) && (
                            <span className="gm-mymap-panel__version" title="매칭에 쓸 연속지적도 기준월(예정)">
                                · 지적도 {item.parcelVersion ?? expectedVersions[item.id]} 예정
                            </span>
                        )}
                    </div>

                    {hasProgress && (
                        <div className="gm-mymap-panel__progress">
                            <div className="gm-mymap-panel__progress-bar" role="progressbar"
                                aria-valuemin={0} aria-valuemax={total} aria-valuenow={done}>
                                <div className="gm-mymap-panel__progress-fill" style={{ width: `${(done / total) * 100}%` }} />
                            </div>
                            <span className="gm-mymap-panel__progress-text">처리 중 {formatCount(done)}/{formatCount(total)}</span>
                        </div>
                    )}

                    {hasResult && (
                        <div className="gm-mymap-panel__result">
                            매칭 {formatCount(matched)}
                            {' · '}
                            {canOpenReport ? (
                                <button type="button" className="gm-mymap-panel__fail-link"
                                    onClick={() => setReportTarget({ id: item.id, name: item.name })}>
                                    실패 {formatCount(failedRows)} 보기
                                </button>
                            ) : (
                                <span className={cx(failedRows > 0 && 'gm-mymap-panel__fail-text')}>실패 {formatCount(failedRows)}</span>
                            )}
                            {item.parcelVersion && (item.sourceKind === 'EXCEL_PNU' || item.sourceKind === 'EXCEL_ADDRESS') && (
                                <span className="gm-mymap-panel__version" title="매칭에 쓴 연속지적도 기준월"> · 지적도 {item.parcelVersion}</span>
                            )}
                        </div>
                    )}
                    {isFailed && item.errorMessage && (
                        <div className="gm-mymap-panel__error" title={item.errorMessage}>{item.errorMessage}</div>
                    )}
                </div>

                {item.status === 'READY' && (
                    <button onClick={() => handleLocate(item)} title="레이어 위치로 이동"
                        className="gm-panel__item-btn"
                        onMouseEnter={e => (e.currentTarget.style.color = 'var(--gm-primary)')}
                        onMouseLeave={e => (e.currentTarget.style.color = '#9ca3af')}>
                        <Locate size={12} />
                    </button>
                )}

                {item.owner && (
                    <button onClick={() => setShareTarget({ id: item.id, name: item.name })} title="공유 설정"
                        className="gm-panel__item-btn"
                        onMouseEnter={e => (e.currentTarget.style.color = 'var(--gm-primary)')}
                        onMouseLeave={e => (e.currentTarget.style.color = '#9ca3af')}>
                        <Share2 size={12} />
                    </button>
                )}

                {item.owner && (
                    <button onClick={() => handleDelete(item.id)} title="삭제"
                        className="gm-panel__item-btn gm-panel__item-btn--delete"
                        onMouseEnter={e => (e.currentTarget.style.color = '#ef4444')}
                        onMouseLeave={e => (e.currentTarget.style.color = '#d1d5db')}>
                        <Trash2 size={13} />
                    </button>
                )}
            </div>
        )
    }

    return (
        <div className="gm-panel">
            <div className="gm-panel__header">
                <span className="gm-panel__title">나만의지도</span>
                <button onClick={() => setShowUpload(true)} disabled={layerFull}
                    title={layerFull ? `나만의지도는 최대 ${maxLayers}개까지 만들 수 있습니다` : undefined}
                    className="gm-mymap-panel__upload">
                    <Upload size={13} /> 업로드
                </button>
            </div>
            {maxLayers !== null && (
                <div className={cx('gm-mymap-panel__quota', layerFull && 'gm-is-full')}>
                    내 레이어 {formatCount(owned.length)}/{formatCount(maxLayers)}
                </div>
            )}

            <div className="gm-panel__list">
                {loading ? (
                    <div className="gm-panel__loading">
                        <Loader2 size={18} className="gm-loader gm-loader--primary" />
                    </div>
                ) : items.length === 0 ? (
                    <div className="gm-panel__empty">
                        업로드된 나만의지도 없음
                    </div>
                ) : (
                    <>
                        {shared.length > 0 && owned.length > 0 && (
                            <div className="gm-mymap-panel__group">내 레이어 <span>{formatCount(owned.length)}</span></div>
                        )}
                        {owned.map(renderItem)}
                        {shared.length > 0 && (
                            <div className="gm-mymap-panel__group">공유받은 레이어 <span>{formatCount(shared.length)}</span></div>
                        )}
                        {shared.map(renderItem)}
                    </>
                )}
            </div>

            {showUpload && <MyMapUploadModal quota={quota} onClose={() => setShowUpload(false)} onUploaded={fetchList} />}
            {shareTarget && <MyMapShareDialog id={shareTarget.id} name={shareTarget.name} onClose={() => setShareTarget(null)} />}
            {reportTarget && <MyMapImportReportDialog id={reportTarget.id} name={reportTarget.name} onClose={() => setReportTarget(null)} />}
        </div>
    )
}
