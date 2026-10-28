'use client'

// 나만의지도 패널 — 스타일: gm-panel(TIFF·나만의지도 공용), gm-mymap-panel
// 내 레이어 / 공유받은 레이어 두 묶음. 항목은 두 줄(이름 / 종류 칩·개수·공유 수·처리 중·실패 N·보낸 사람) + 위치 이동·⋯ 메뉴.
// 결과 줄(매칭·실패·기준월)은 툴팁으로만, 실패가 있으면 줄 끝 빨간 `실패 N`(누르면 결과 보고서). ⋯ 메뉴: 스타일·라벨 / 업로드 결과 / 속성 테이블 / 삭제.
// 처리 중은 항목 아래 얇은 진행 막대, 상단 `내 레이어 n/20`(한도는 소스의 quota가 있을 때만). 켜짐·진행률처럼 값에 따라 바뀌는 것만 인라인 style
import { useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Trash2, Upload, Loader2, Share2, Locate, Palette, Users, ClipboardList, Table2 } from 'lucide-react'
import { EMPTY_MYMAP_CATALOG_STATE } from '../../core'
import type { MyMapCatalogState, MyMapConfirmResult, UserMapListItem, VectorOverlayState } from '../../core'
import { useGisMap, useMyMapCatalog, useStoreValue, useVectorOverlayState } from '../../react'
import { cx } from '../cx'
import MyMapUploadModal from '../mymap/MyMapUploadModal'
import MyMapShareDialog from '../mymap/MyMapShareDialog'
import MyMapImportReportDialog from '../mymap/MyMapImportReport'
import MyMapStyleDialog from '../mymap/MyMapStyleDialog'
import MyMapDeleteConfirm from '../mymap/MyMapDeleteConfirm'
import MyMapTableDialog from '../mymap/MyMapTableDialog'
import MyMapItemMenu from '../mymap/MyMapItemMenu'
import type { ItemMenuEntry } from '../mymap/MyMapItemMenu'
import { hasImportResult, itemMenuIds } from '../mymap/itemMenuModel'
import type { ItemMenuId } from '../mymap/itemMenuModel'
import { formatCount, kindLabel, resultTooltip } from '../mymap/format'
import { SHARE_MAX_ITEMS } from '../share/shareModel'

/** 종류 배지 색 클래스(sourceKind를 아는 새 서버일 때만) */
const KIND_CLASS: Readonly<Record<string, string>> = Object.freeze({
    SHP: 'gm-mymap-panel__kind--shp', EXCEL_PNU: 'gm-mymap-panel__kind--pnu',
    EXCEL_ADDRESS: 'gm-mymap-panel__kind--address', EXCEL_COORD: 'gm-mymap-panel__kind--coord',
})

/** ⋯ 메뉴 항목의 글자·아이콘(어떤 항목이 들어가는지는 mymap/itemMenuModel이 정한다) */
const MENU_DEF: Readonly<Record<ItemMenuId, { label: string; icon: ReactNode }>> = Object.freeze({
    style: { label: '스타일·라벨', icon: <Palette size={13} /> },
    report: { label: '업로드 결과', icon: <ClipboardList size={13} /> },
    table: { label: '속성 테이블', icon: <Table2 size={13} /> },
    delete: { label: '삭제', icon: <Trash2 size={13} /> },
})

const selectCatalog = (s: MyMapCatalogState) => s
const selectVisibleIds = (s: VectorOverlayState) => s.visibleIds

// 목록·상태 폴링·삭제는 패널이 열려 있는 동안의 목록 객체(map.vector.openCatalog)가,
// 지도에 올린 레이어와 체크 상태는 엔진 인스턴스(map.vector)가 가진다 → 패널을 닫았다 열어도 체크 = 지도
export default function MyMapPanel() {
    const map = useGisMap()
    const vector = map?.vector ?? null
    const reportAvailable = !!map?.sources.myMap?.importReport
    // 스타일 저장(PATCH)을 할 수 있는 소스일 때만 스타일 단추를 보인다(없으면 옛 화면 그대로)
    const styleAvailable = !!map?.sources.myMap?.update
    const catalog = useMyMapCatalog()
    const { items, loading, quota } = useStoreValue(catalog?.store, selectCatalog, EMPTY_MYMAP_CATALOG_STATE)
    const visibleIdList = useVectorOverlayState(selectVisibleIds)
    const visibleIds = useMemo(() => new Set(visibleIdList), [visibleIdList])
    const [showUpload, setShowUpload] = useState(false)
    // 공유 대화상자에 넘길 레이어(하나면 단일, 둘 이상이면 일괄)
    const [shareItems, setShareItems] = useState<Array<{ id: number; name: string }> | null>(null)
    // 선택 모드의 공유 단추로 열었는지(1개만 골랐을 때 안내 한 줄)
    const [shareFromSelection, setShareFromSelection] = useState(false)
    // 다중 선택 모드(일괄 공유) — 표시 체크와 따로 고르는 선택 집합
    const [selectMode, setSelectMode] = useState(false)
    const [selectedIds, setSelectedIds] = useState<ReadonlySet<number>>(() => new Set<number>())
    const [reportTarget, setReportTarget] = useState<{ id: number; name: string } | null>(null)
    const [styleTarget, setStyleTarget] = useState<{ id: number; name: string } | null>(null)
    const [tableTarget, setTableTarget] = useState<{ id: number; name: string } | null>(null)
    // 열려 있는 ⋯ 메뉴의 레이어(한 번에 하나만 — 다른 항목의 메뉴를 열면 이전 것이 닫힌다)
    const [openMenuId, setOpenMenuId] = useState<number | null>(null)
    // 삭제 확인창에 띄울 레이어(삭제 단추 → 확인 → 실제 삭제)
    const [deleteTarget, setDeleteTarget] = useState<{ id: number; name: string } | null>(null)
    // 스타일 저장 요청이 도는 동안 true — 그 사이 다른 레이어의 스타일 창을 열면 저장 결과·오류를 볼 창이 사라진다
    const styleSavingRef = useRef(false)
    // 업로드 직후 확정 응답의 "예정" 기준월(처리 중인 동안만 쓴다 — 끝나면 목록·상태의 확정값). 패널이 닫히면 사라진다
    const [expectedVersions, setExpectedVersions] = useState<Readonly<Record<number, string>>>({})

    const owned = useMemo(() => items.filter(i => i.owner), [items])
    const shared = useMemo(() => items.filter(i => !i.owner), [items])
    // 한도: 서버가 준 maxLayers에 지금 목록의 내 레이어 수(업로드·삭제 직후에도 맞는 값)
    // 공유(선택 모드) 단추: 항상 보인다. 내 레이어가 1개 이상이면 눌리고, 0개면 비활성
    // (1개만 골라도 단일 공유 창이 열린다 — 레이어를 1개만 가진 사용자도 쓸 수 있게).
    // 소스에 일괄 공유(shareTarget.bulk)가 없으면(옛 소스) 한 번에 1개만 고른다 — 공유 창이 단일 모드만 지원한다
    const bulkAvailable = !!map?.sources.myMap?.shareTarget?.bulk
    const selecting = selectMode && owned.length >= 1
    // 목록이 바뀌어 사라진 레이어는 선택에서 뺀다
    const pickedIds = useMemo(() => owned.filter(i => selectedIds.has(i.id)).map(i => i.id), [owned, selectedIds])
    // 선택(공유) 모드로 들어가면 항목 버튼이 사라지므로 열린 메뉴도 닫는다(끝났을 때 다시 열려 있지 않게)
    useEffect(() => { if (selecting) setOpenMenuId(null) }, [selecting])
    const menuEnv = useMemo(() => ({ styleAvailable, reportAvailable }), [styleAvailable, reportAvailable])
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

    const exitSelect = () => { setSelectMode(false); setSelectedIds(new Set<number>()) }
    const toggleSelected = (id: number) => setSelectedIds(cur => {
        // 일괄 공유가 없는 소스: 하나만 고른다(이미 고른 걸 다시 누르면 해제, 다른 걸 누르면 바뀜)
        if (!bulkAvailable) return cur.has(id) ? new Set<number>() : new Set([id])
        const next = new Set(cur)
        if (next.has(id)) next.delete(id)
        else if (next.size < SHARE_MAX_ITEMS) next.add(id)
        return next
    })
    const allPicked = owned.length > 0 && pickedIds.length === Math.min(owned.length, SHARE_MAX_ITEMS)
    const toggleAllSelected = () => setSelectedIds(allPicked ? new Set<number>() : new Set(owned.slice(0, SHARE_MAX_ITEMS).map(i => i.id)))

    // 옛 동작: 서버 응답과 관계없이 지도·목록에서 뺀다(네트워크 오류만 드러남)
    const handleDelete = (id: number): Promise<void> => catalog?.remove(id) ?? Promise.resolve()

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

    // ⋯ 메뉴 항목의 글자·아이콘(어떤 항목이 들어가는지는 itemMenuModel이 정한다)
    const selectMenu = (id: ItemMenuId, item: UserMapListItem) => {
        const target = { id: item.id, name: item.name }
        if (id === 'style') { if (!styleSavingRef.current) setStyleTarget(target) }
        else if (id === 'report') setReportTarget(target)
        else if (id === 'table') setTableTarget(target)
        else setDeleteTarget(target)
    }

    const renderItem = (item: UserMapListItem) => {
        const active = visibleIds.has(item.id)
        const isProcessing = item.status === 'PROCESSING'
        const isFailed = item.status === 'FAILED'
        const total = item.progressTotal ?? 0
        const done = Math.min(item.progressDone ?? 0, total)
        const hasProgress = isProcessing && total > 0
        const failedRows = item.failedCount ?? 0
        const hasResult = hasImportResult(item)
        // 보고서는 소유자만(서버가 403) — 소스가 importReport를 안 가졌으면 글자로만
        const canOpenReport = reportAvailable && item.owner && failedRows > 0
        // 결과 줄(매칭·실패·기준월)은 평소 숨기고 툴팁으로만 — 실패가 있을 때만 줄 끝에 빨간 `실패 N`
        const tip = resultTooltip(item, expectedVersions[item.id])
        // 공유받은 레이어: 보낸 사람 이름만 줄 끝에(없으면 아이디), 툴팁에 이름(아이디)
        const senderName = !item.owner ? (item.ownerName || item.ownerId || '') : ''
        const senderTitle = item.ownerName && item.ownerId ? `${item.ownerName}(${item.ownerId})` : senderName
        // 선택 모드: 내 레이어는 줄 전체가 선택 대상(왼쪽 체크 = 선택 체크), 공유받은 레이어는 흐리게·선택 불가
        const pickable = selecting && item.owner
        const dim = selecting && !item.owner
        const picked = pickable && selectedIds.has(item.id)
        const menuEntries: ItemMenuEntry[] = itemMenuIds(item, menuEnv).map(mid => ({
            id: mid, ...MENU_DEF[mid], danger: mid === 'delete', onSelect: () => selectMenu(mid, item),
        }))
        return (
            <div key={item.id} className={cx('gm-panel__item', 'gm-mymap-panel__item', pickable && 'gm-panel__item--select', picked && 'gm-is-picked', dim && 'gm-is-dim')}
                style={selecting ? undefined : { background: active ? 'rgba(var(--gm-primary-rgb), 0.04)' : 'transparent' }}
                onClick={pickable ? e => {
                    // 체크 상자를 직접 누른 클릭은 onChange가 처리한다(두 번 바뀌지 않게)
                    if ((e?.target as { tagName?: string } | null | undefined)?.tagName !== 'INPUT') toggleSelected(item.id)
                } : undefined}>
                {pickable ? (
                    <input type="checkbox" checked={picked} onChange={() => toggleSelected(item.id)}
                        aria-label={`${item.name} 선택`} className="gm-panel__item-check gm-panel__item-check--select" />
                ) : (
                    <input type="checkbox" checked={active} disabled={isProcessing || isFailed || dim}
                        onChange={() => toggleVisibility(item)}
                        className="gm-panel__item-check"
                        style={{ cursor: isProcessing || isFailed || dim ? 'default' : 'pointer' }} />
                )}

                <div className="gm-panel__item-body">
                    <div className={cx('gm-panel__item-name', 'gm-mymap-panel__name', active && 'gm-is-active', isFailed && 'gm-is-failed')} title={tip ?? item.name}>
                        {item.name}
                    </div>
                    <div className="gm-panel__item-meta gm-mymap-panel__meta" title={tip}>
                        <span className={cx('gm-mymap-panel__kind', item.sourceKind && 'gm-mymap-panel__kind--badge', item.sourceKind && KIND_CLASS[item.sourceKind])}>{kindLabel(item)}</span>
                        {!isProcessing && !isFailed && (
                            <>
                                <span className="gm-mymap-panel__dot" aria-hidden="true" />
                                <span>{formatCount(item.featureCount)}개</span>
                            </>
                        )}
                        {item.owner && (item.shareCount ?? 0) > 0 && (
                            <>
                                <span className="gm-mymap-panel__dot" aria-hidden="true" />
                                <span className="gm-mymap-panel__share-count" title={`공유 대상 ${item.shareCount}`} role="img" aria-label={`공유 ${item.shareCount}`}>
                                    <Users size={10} aria-hidden="true" />{formatCount(item.shareCount ?? 0)}
                                </span>
                            </>
                        )}
                        {isProcessing && (
                            <>
                                <span className="gm-mymap-panel__dot" aria-hidden="true" />
                                <span className="gm-panel__item-status gm-panel__item-status--busy">
                                    {hasProgress ? `처리 중 ${formatCount(done)}/${formatCount(total)}` : <><Loader2 size={9} className="gm-loader" /> 처리 중</>}
                                </span>
                            </>
                        )}
                        {isFailed && (
                            <>
                                <span className="gm-mymap-panel__dot" aria-hidden="true" />
                                <span className="gm-panel__item-status gm-panel__item-status--failed" title={item.errorMessage ?? undefined}>처리 실패</span>
                                {item.errorMessage && (
                                    <>
                                        <span className="gm-mymap-panel__dot" aria-hidden="true" />
                                        <span className="gm-mymap-panel__error" title={item.errorMessage}>{item.errorMessage}</span>
                                    </>
                                )}
                            </>
                        )}
                        {hasResult && failedRows > 0 && (
                            <>
                                <span className="gm-mymap-panel__dot" aria-hidden="true" />
                                {canOpenReport ? (
                                    <button type="button" className="gm-mymap-panel__fail-link" title="실패한 행 보기"
                                        onClick={() => setReportTarget({ id: item.id, name: item.name })}>
                                        실패 {formatCount(failedRows)}
                                    </button>
                                ) : (
                                    <span className="gm-mymap-panel__fail-text">실패 {formatCount(failedRows)}</span>
                                )}
                            </>
                        )}
                        {senderName && (
                            <>
                                <span className="gm-mymap-panel__dot" aria-hidden="true" />
                                <span className="gm-mymap-panel__sender" title={senderTitle}>{senderName}</span>
                            </>
                        )}
                    </div>
                </div>

                {!selecting && (item.status === 'READY' || menuEntries.length > 0) && (
                    <div className="gm-mymap-panel__acts">
                        {item.status === 'READY' && (
                            <button onClick={() => handleLocate(item)} title="레이어 위치로 이동" aria-label="레이어 위치로 이동"
                                className="gm-panel__item-btn gm-mymap-panel__ib">
                                <Locate size={13} />
                            </button>
                        )}
                        {menuEntries.length > 0 && (
                            <MyMapItemMenu label={item.name} open={openMenuId === item.id}
                                onOpenChange={o => setOpenMenuId(cur => (o ? item.id : cur === item.id ? null : cur))}
                                entries={menuEntries} />
                        )}
                    </div>
                )}

                {hasProgress && (
                    <div className="gm-mymap-panel__bar" role="progressbar" aria-label={`${item.name} 처리 진행률`}
                        aria-valuemin={0} aria-valuemax={total} aria-valuenow={done}>
                        <div className="gm-mymap-panel__bar-fill" style={{ width: `${(done / total) * 100}%` }} />
                    </div>
                )}
            </div>
        )
    }

    return (
        <div className="gm-panel">
            <div className="gm-panel__header">
                <span className="gm-panel__title">나만의지도</span>
                <div className="gm-mymap-panel__header-actions">
                    <button onClick={() => (selecting ? exitSelect() : setSelectMode(true))} aria-pressed={selecting}
                        disabled={owned.length === 0}
                        title={owned.length === 0 ? '공유할 내 레이어가 없습니다' : owned.length === 1 || !bulkAvailable ? '내 레이어를 골라 공유' : '여러 레이어를 골라 한 번에 공유'}
                        aria-label="공유"
                        className={cx('gm-mymap-panel__upload', selecting && 'gm-is-on')}>
                        <Share2 size={13} /> 공유
                    </button>
                    <button onClick={() => setShowUpload(true)} disabled={layerFull}
                        title={layerFull ? `나만의지도는 최대 ${maxLayers}개까지 만들 수 있습니다` : undefined}
                        className="gm-mymap-panel__upload">
                        <Upload size={13} /> 업로드
                    </button>
                </div>
            </div>
            {selecting && (
                <div className="gm-mymap-panel__select-banner">
                    {bulkAvailable && owned.length >= 2 ? '공유할 내 레이어를 고르세요 (여러 개 선택 가능)' : '공유할 내 레이어를 고르세요'}
                </div>
            )}
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

            {selecting && (
                <div className="gm-mymap-panel__select-bar">
                    <span className="gm-mymap-panel__select-count">{formatCount(pickedIds.length)}개 선택</span>
                    {bulkAvailable && (
                        <button type="button" onClick={toggleAllSelected} className="gm-mymap-panel__select-link">{allPicked ? '선택 해제' : '전체 선택'}</button>
                    )}
                    <button type="button" disabled={pickedIds.length === 0}
                        onClick={() => { setShareFromSelection(true); setShareItems(owned.filter(i => selectedIds.has(i.id)).map(i => ({ id: i.id, name: i.name }))) }}
                        className="gm-mymap-panel__select-share"><Share2 size={12} /> 공유하기</button>
                    <button type="button" onClick={exitSelect} className="gm-mymap-panel__select-link">취소</button>
                </div>
            )}

            {showUpload && <MyMapUploadModal quota={quota} onClose={() => setShowUpload(false)} onUploaded={fetchList} />}
            {shareItems && (
                <MyMapShareDialog items={shareItems} fromSelection={shareFromSelection && bulkAvailable} onClose={() => setShareItems(null)}
                    onDone={() => {
                        // 공유 수(shareCount) 갱신을 위해 목록을 다시 받고, 선택 모드에서 연 공유였다면(1개만 골라도) 선택 모드를 끝낸다(결과 화면은 닫기 전까지 그대로)
                        if (shareFromSelection) exitSelect()
                        void catalog?.load()
                    }} />
            )}
            {reportTarget && <MyMapImportReportDialog id={reportTarget.id} name={reportTarget.name} onClose={() => setReportTarget(null)} />}
            {deleteTarget && (
                <MyMapDeleteConfirm key={deleteTarget.id} name={deleteTarget.name} onConfirm={() => handleDelete(deleteTarget.id)}
                    onClose={() => setDeleteTarget(null)} />
            )}
            {tableTarget && (
                <MyMapTableDialog key={tableTarget.id} id={tableTarget.id} name={tableTarget.name} onClose={() => setTableTarget(null)} />
            )}
            {styleTarget && (
                <MyMapStyleDialog key={styleTarget.id} id={styleTarget.id} name={styleTarget.name} catalog={catalog}
                    onClose={() => setStyleTarget(null)} onSavingChange={saving => { styleSavingRef.current = saving }} />
            )}
        </div>
    )
}
