'use client'

// 나만의지도 패널 — 스타일: gm-panel(TIFF·나만의지도 공용), gm-mymap-panel
// 머리줄: 공유(보조 단추·선택 모드) + 업로드(주 단추). 그 아래 탭 `내 레이어` / `공유받은`(한 번에 한쪽 목록만 — 지도에 켠 레이어는 그대로),
// 내 레이어 탭에만 `3 / 20`·한도 안내. 목록 전체(두 탭 합계)가 8개 이상이면 검색창(검색은 현재 탭 안에서만). 선택 모드(일괄 공유)는 내 레이어 탭에서만. 행은 ui/mymap/MyMapListRow(그리는 규칙은 mymap/listModel), 빈 화면·목록 오류는 mymap/MyMapEmptyState.
// 목록 행에는 실패 개수·사유를 적지 않는다 — 처음 등록한 레이어의 처리가 끝나면 업로드 결과 창(MyMapImportReport)을 한 번 자동으로 띄우고(처음 한 번 규칙은
// listModel.planFreshReports, 기억은 엔진 map.vector.freshUploads), 이후에는 ⋯ 메뉴 `업로드 결과 보기`로 다시 연다.
// ⋯ 메뉴: 스타일·라벨 / 속성 테이블 / 내보내기 / 업로드 결과 보기 / 삭제. 켜짐·진행률처럼 값에 따라 바뀌는 것만 인라인 style
// 파일(엑셀·SHP)을 패널 위에 끌어 놓으면 업로드 창이 그 파일로 채워져 열린다(덮개 문구는 gm-mymap-panel__dropcover). 업로드할 수 없는 소스·창이 열려 있을 때는 무시, 한도가 가득 차면 덮개 문구만
import { useEffect, useId, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Trash2, Loader2, Share2, Palette, ClipboardList, Table2, Download, Plus, Search, X, AlertTriangle, Info, Upload } from 'lucide-react'
import { EMPTY_MYMAP_CATALOG_STATE } from '../../core'
import type { MyMapCatalogState, MyMapConfirmResult, UserMapListItem, VectorOverlayState } from '../../core'
import { useGisMap, useMyMapCatalog, useStoreValue, useVectorOverlayState } from '../../react'
import { cx } from '../cx'
import MyMapUploadModal from '../mymap/MyMapUploadModal'
import { filesFromDataTransfer } from '../mymap/folderEntries'
import { useFileDrop } from '../mymap/useFileDrop'
import MyMapShareDialog from '../mymap/MyMapShareDialog'
import MyMapImportReportDialog from '../mymap/MyMapImportReport'
import MyMapStyleDialog from '../mymap/MyMapStyleDialog'
import MyMapDeleteConfirm from '../mymap/MyMapDeleteConfirm'
import MyMapTableDialog from '../mymap/MyMapTableDialog'
import MyMapExportDialog from '../mymap/MyMapExportDialog'
import type { ItemMenuEntry } from '../mymap/MyMapItemMenu'
import MyMapListRow from '../mymap/MyMapListRow'
import MyMapEmptyState, { MyMapListError, MyMapSharedEmpty } from '../mymap/MyMapEmptyState'
import MyMapTabs, { tabId, tabPanelId } from '../mymap/MyMapTabs'
import { canViewImportResult, itemMenuIds } from '../mymap/itemMenuModel'
import type { ItemMenuId } from '../mymap/itemMenuModel'
import { formatCount } from '../mymap/format'
import { defaultTab, hasNoLocation, hiddenActiveCount, itemsForTab, limitNoteText, newOwnedIds, planFreshReports, quotaText, resolveTab, rowView, shouldShowSearch, splitItems, swatchOf } from '../mymap/listModel'
import type { ListTab } from '../mymap/listModel'
import { SHARE_MAX_ITEMS } from '../share/shareModel'

/** ⋯ 메뉴 항목의 글자·아이콘(어떤 항목이 들어가는지는 mymap/itemMenuModel이 정한다) */
const MENU_DEF: Readonly<Record<ItemMenuId, { label: string; icon: ReactNode }>> = Object.freeze({
    style: { label: '스타일·라벨', icon: <Palette size={13} /> },
    report: { label: '업로드 결과 보기', icon: <ClipboardList size={13} /> },
    table: { label: '속성 테이블', icon: <Table2 size={13} /> },
    export: { label: '내보내기', icon: <Download size={13} /> },
    delete: { label: '삭제', icon: <Trash2 size={13} /> },
})

const selectCatalog = (s: MyMapCatalogState) => s
const selectVisibleIds = (s: VectorOverlayState) => s.visibleIds
const selectLoadingIds = (s: VectorOverlayState) => s.loadingIds
const selectLoadProgress = (s: VectorOverlayState) => s.loadProgress
const selectClusteredIds = (s: VectorOverlayState) => s.clusteredIds

/** 결과 창에 넘길 대상. auto = 처음 등록 직후 자동으로 띄운 창, failure = 처리 실패 레이어의 이유 */
interface ReportTarget {
    id: number
    name: string
    auto?: boolean
    failure?: { message: string | null } | null
}

// 목록·상태 폴링·삭제는 패널이 열려 있는 동안의 목록 객체(map.vector.openCatalog)가,
// 지도에 올린 레이어와 체크 상태는 엔진 인스턴스(map.vector)가 가진다 → 패널을 닫았다 열어도 체크 = 지도
export default function MyMapPanel() {
    const map = useGisMap()
    const vector = map?.vector ?? null
    const myMapSource = map?.sources.myMap
    const reportAvailable = !!myMapSource?.importReport
    // 스타일 저장(PATCH)을 할 수 있는 소스일 때만 스타일 단추를 보인다(없으면 옛 화면 그대로)
    const styleAvailable = !!myMapSource?.update
    // 내보내기(exportLayer)가 있는 소스일 때만 ⋯ 메뉴에 `내보내기`를 보인다
    const exportAvailable = !!myMapSource?.exportLayer
    // 업로드 단추·빈 화면의 첫 레이어 올리기는 올릴 수 있는 소스일 때만
    const uploadAvailable = !!(myMapSource?.uploadShp || myMapSource?.previewExcel)
    const catalog = useMyMapCatalog()
    const { items, loading, error: listError, quota } = useStoreValue(catalog?.store, selectCatalog, EMPTY_MYMAP_CATALOG_STATE)
    const visibleIdList = useVectorOverlayState(selectVisibleIds)
    const visibleIds = useMemo(() => new Set(visibleIdList), [visibleIdList])
    const loadingIdList = useVectorOverlayState(selectLoadingIds)
    const loadingIds = useMemo(() => new Set(loadingIdList), [loadingIdList])
    const loadProgress = useVectorOverlayState(selectLoadProgress)
    const clusteredIdList = useVectorOverlayState(selectClusteredIds)
    const clusteredIds = useMemo(() => new Set(clusteredIdList), [clusteredIdList])
    const [showUpload, setShowUpload] = useState(false)
    // 패널에 끌어 놓아 연 업로드 창에 미리 채울 파일(폴더는 읽지 않고 안내만 한다) · 열기 단추(창이 닫히면 포커스를 돌려준다)
    const [dropped, setDropped] = useState<{ files: File[]; notice: string | null } | null>(null)
    const uploadBtnRef = useRef<HTMLButtonElement>(null)
    // 공유 대화상자에 넘길 레이어(하나면 단일, 둘 이상이면 일괄)
    const [shareItems, setShareItems] = useState<Array<{ id: number; name: string }> | null>(null)
    // 선택 모드의 공유 단추로 열었는지(1개만 골랐을 때 안내 한 줄)
    const [shareFromSelection, setShareFromSelection] = useState(false)
    // 다중 선택 모드(일괄 공유) — 표시 체크와 따로 고르는 선택 집합
    const [selectMode, setSelectMode] = useState(false)
    const [selectedIds, setSelectedIds] = useState<ReadonlySet<number>>(() => new Set<number>())
    const [reportTarget, setReportTarget] = useState<ReportTarget | null>(null)
    const [styleTarget, setStyleTarget] = useState<{ id: number; name: string } | null>(null)
    const [tableTarget, setTableTarget] = useState<{ id: number; name: string } | null>(null)
    const [exportTarget, setExportTarget] = useState<{ id: number; name: string; featureCount: number } | null>(null)
    // 열려 있는 ⋯ 메뉴의 레이어(한 번에 하나만 — 다른 항목의 메뉴를 열면 이전 것이 닫힌다)
    const [openMenuId, setOpenMenuId] = useState<number | null>(null)
    // 삭제 확인창에 띄울 레이어(삭제 단추 → 확인 → 실제 삭제)
    const [deleteTarget, setDeleteTarget] = useState<{ id: number; name: string } | null>(null)
    // 스타일 저장 요청이 도는 동안 true — 그 사이 다른 레이어의 스타일 창을 열면 저장 결과·오류를 볼 창이 사라진다
    const styleSavingRef = useRef(false)
    const [query, setQuery] = useState('')
    // 사용자가 직접 고른 탭(null이면 기본 규칙: 내 레이어, 내 레이어가 0개이고 공유받은 것만 있으면 공유받은). 패널이 닫히면 사라진다
    const [tabChoice, setTabChoice] = useState<ListTab | null>(null)
    const limitNoteId = useId()
    const tabsId = useId()
    // 처음 등록 결과 창: 이 패널을 연 뒤 이 화면에서 올린 id(목록에 아직 없을 수 있다) · 처리 중으로 관찰한 id. 패널이 닫히면 사라지고, 엔진의 vector.freshUploads가 그 너머를 기억한다
    const mineRef = useRef<Set<number>>(new Set())
    const seenProcessingRef = useRef<Set<number>>(new Set())

    const { owned, shared } = useMemo(() => splitItems(items), [items])
    const searching = query.trim() !== ''
    // 기본 탭 규칙은 목록을 처음 제대로 받았을 때 한 번만 적용해 고정한다(그 뒤 마지막 내 레이어를 지워도 보던 탭을 유지)
    const listReady = !loading && !(listError && items.length === 0)
    useEffect(() => {
        if (listReady && tabChoice === null) setTabChoice(defaultTab(owned.length, shared.length))
    }, [listReady, tabChoice, owned.length, shared.length])
    const activeTab = resolveTab(tabChoice, owned.length, shared.length)
    // 현재 탭의 목록(검색은 이 탭 안에서만)
    const tabItems = useMemo(() => itemsForTab(items, activeTab, query), [items, activeTab, query])
    // 공유(선택 모드) 단추: 항상 보인다. 내 레이어가 1개 이상이면 눌리고, 0개면 비활성
    // (1개만 골라도 단일 공유 창이 열린다 — 레이어를 1개만 가진 사용자도 쓸 수 있게).
    // 소스에 일괄 공유(shareTarget.bulk)가 없으면(옛 소스) 한 번에 1개만 고른다 — 공유 창이 단일 모드만 지원한다
    const bulkAvailable = !!myMapSource?.shareTarget?.bulk
    const selecting = selectMode && owned.length >= 1 && activeTab === 'owned'
    // 선택 모드에서 고를 수 있는 내 레이어(처리 실패는 공유할 게 없다)
    const pickableOwned = useMemo(() => owned.filter(i => i.status !== 'FAILED'), [owned])
    const visiblePickable = useMemo(() => (activeTab === 'owned' ? tabItems.filter(i => i.status !== 'FAILED') : []), [activeTab, tabItems])
    // 목록이 바뀌어 사라진 레이어는 선택에서 뺀다
    const pickedIds = useMemo(() => pickableOwned.filter(i => selectedIds.has(i.id)).map(i => i.id), [pickableOwned, selectedIds])
    // 선택(공유) 모드로 들어가면 항목 버튼이 사라지므로 열린 메뉴도 닫는다(끝났을 때 다시 열려 있지 않게)
    useEffect(() => { if (selecting) setOpenMenuId(null) }, [selecting])
    const menuEnv = useMemo(() => ({ styleAvailable, reportAvailable, exportAvailable }), [styleAvailable, reportAvailable, exportAvailable])
    const maxLayers = quota?.maxLayers ?? null
    const layerFull = maxLayers !== null && owned.length >= maxLayers
    const hasFailedOwned = owned.some(i => i.status === 'FAILED')
    const modalOpen = showUpload || !!shareItems || !!reportTarget || !!styleTarget || !!tableTarget || !!exportTarget || !!deleteTarget

    // 패널에 파일 끌어 놓기 → 업로드 창이 채워진 채 열린다. 업로드 불가·한도 가득·다른 창이 열려 있으면 받지 않는다(브라우저가 파일을 여는 것만 막는다)
    const dropOpen = (dt: DataTransfer) => {
        void (async () => {
            const r = await filesFromDataTransfer(dt)
            if (r.files.length === 0 && r.folders.length === 0) return
            let notice: string | null = null
            if (r.files.length === 0) notice = '폴더는 올릴 수 없습니다. 폴더를 열어 안의 파일을 직접 끌어 놓아 주세요.'
            else if (r.folders.length > 0) notice = '폴더는 올릴 수 없어 빼고 파일만 올렸습니다.'
            setDropped({ files: r.files, notice })
            setShowUpload(true)
        })()
    }
    const panelDrop = useFileDrop({ accepting: uploadAvailable && !layerFull && !modalOpen, onDropFiles: dropOpen })
    const showDropCover = panelDrop.dragging && uploadAvailable && !modalOpen
    // 창이 열리거나 닫히면 창이 가로챈 끌기 이벤트 때문에 계수가 어긋날 수 있다 — 0으로 되돌려 닫힌 뒤 덮개가 남지 않게
    const resetPanelDrop = panelDrop.reset
    useEffect(() => { resetPanelDrop() }, [modalOpen, resetPanelDrop])

    // 업로드 뒤 목록 다시 받기(옛 fetchList — loading 표시는 다시 켜지 않는다).
    // 방금 올린 레이어를 기억한다: 엑셀은 확정 응답의 id, SHP·옛 서버는 id가 없으니 올리기 전 목록과 비교해 새로 생긴 내 레이어
    const fetchList = (result?: MyMapConfirmResult) => {
        if (!catalog) return
        const mem = vector?.freshUploads
        // 방금 올린 레이어가 보이도록 내 레이어 탭으로
        setTabChoice('owned')
        if (typeof result?.id === 'number') {
            mineRef.current.add(result.id)
            mem?.add(result.id)
            void catalog.load()
            return
        }
        // 올리기 직전 목록을 제대로 받아 둔 경우에만 비교한다(조회 실패·로딩 중이면 기존 레이어를 새 것으로 잘못 잡는다) — listModel.newOwnedIds
        const prev = catalog.store.getState()
        const trusted = !prev.loading && prev.error === null
        void catalog.load().then(() => {
            newOwnedIds(prev.items, trusted, catalog.store.getState().items).forEach(id => {
                mineRef.current.add(id)
                mem?.add(id)
            })
        })
    }

    // 처음 등록한 레이어의 처리가 끝나면 결과 창을 한 번만(listModel.planFreshReports). 다른 창이 열려 있으면 닫힌 뒤에, 여럿이 끝나면 가장 최근 하나만
    useEffect(() => {
        if (!vector || loading) return
        const mem = vector.freshUploads
        const plan = planFreshReports({
            fresh: mem.ids(), mine: mineRef.current, seenProcessing: seenProcessingRef.current, items,
            canOpen: item => canViewImportResult(item, reportAvailable),
        })
        plan.seen.forEach(id => seenProcessingRef.current.add(id))
        plan.drop.forEach(id => { mem.remove(id); mineRef.current.delete(id); seenProcessingRef.current.delete(id) })
        if (plan.open === null || modalOpen) return
        const target = items.find(i => i.id === plan.open)
        plan.ready.forEach(id => { mem.remove(id); mineRef.current.delete(id); seenProcessingRef.current.delete(id) })
        if (target) {
            setReportTarget({
                id: target.id, name: target.name, auto: true,
                failure: target.status === 'FAILED' ? { message: target.errorMessage ?? null } : null,
            })
        }
    }, [vector, items, loading, modalOpen, reportAvailable])

    const exitSelect = () => { setSelectMode(false); setSelectedIds(new Set<number>()) }
    // 탭을 바꾸면 선택 모드는 끝난다(선택 모드는 내 레이어 탭에서만). 지도에 켠 레이어(체크)는 엔진 상태라 그대로
    const changeTab = (tab: ListTab) => {
        if (tab !== activeTab) exitSelect()
        setTabChoice(tab)
    }
    // 공유 단추: 공유받은 탭에서 누르면 내 레이어 탭으로 옮긴 뒤 선택 모드로 들어간다
    const toggleSelectMode = () => {
        if (selecting) { exitSelect(); return }
        setTabChoice('owned')
        setSelectMode(true)
    }
    const toggleSelected = (id: number) => setSelectedIds(cur => {
        // 일괄 공유가 없는 소스: 하나만 고른다(이미 고른 걸 다시 누르면 해제, 다른 걸 누르면 바뀜)
        if (!bulkAvailable) return cur.has(id) ? new Set<number>() : new Set([id])
        const next = new Set(cur)
        if (next.has(id)) next.delete(id)
        else if (next.size < SHARE_MAX_ITEMS) next.add(id)
        return next
    })
    // 전체 선택: 지금 보이는(검색으로 걸러진) 고를 수 있는 행만
    const visibleIdsToPick = visiblePickable.slice(0, SHARE_MAX_ITEMS).map(i => i.id)
    const allPicked = visibleIdsToPick.length > 0 && visibleIdsToPick.every(id => selectedIds.has(id))
    const toggleAllSelected = () => setSelectedIds(cur => {
        if (allPicked) return new Set(Array.from(cur).filter(id => !visibleIdsToPick.includes(id)))
        const next = new Set(cur)
        for (const id of visibleIdsToPick) {
            if (next.size >= SHARE_MAX_ITEMS) break
            next.add(id)
        }
        return next
    })

    // 옛 동작: 서버 응답과 관계없이 지도·목록에서 뺀다(네트워크 오류만 드러남)
    const handleDelete = (id: number): Promise<void> => catalog?.remove(id) ?? Promise.resolve()

    const toggleVisibility = (item: UserMapListItem) => {
        if (item.status !== 'READY' || hasNoLocation(item)) return
        if (visibleIds.has(item.id)) {
            vector?.hide(item.id)
        } else {
            void vector?.show(item.id)
        }
    }

    // 지도에 없으면 먼저 불러와 켠 뒤(체크도 켜짐) 피처 범위로 이동
    const handleLocate = async (item: UserMapListItem) => {
        if (item.status !== 'READY' || hasNoLocation(item)) return
        await vector?.zoomTo(item.id)
    }

    // ⋯ 메뉴 항목의 글자·아이콘(어떤 항목이 들어가는지는 itemMenuModel이 정한다)
    const selectMenu = (id: ItemMenuId, item: UserMapListItem) => {
        const target = { id: item.id, name: item.name }
        if (id === 'style') { if (!styleSavingRef.current) setStyleTarget(target) }
        else if (id === 'report') setReportTarget({ ...target, failure: item.status === 'FAILED' ? { message: item.errorMessage ?? null } : null })
        else if (id === 'table') setTableTarget(target)
        else if (id === 'export') setExportTarget({ ...target, featureCount: item.featureCount })
        else setDeleteTarget(target)
    }

    const renderItem = (item: UserMapListItem) => {
        const active = visibleIds.has(item.id)
        // 지도에 올리는 중(받기 → 피처 변환). 진행률은 변환 단계에서만 있다
        const pctRaw = loadProgress[item.id]
        const mapLoadPct = pctRaw === undefined ? null : Math.min(100, Math.floor(pctRaw * 100))
        const view = rowView(item, {
            selecting, active, mapLoading: loadingIds.has(item.id), mapLoadPct, mapClustered: clusteredIds.has(item.id),
        })
        const menuEntries: ItemMenuEntry[] = itemMenuIds(item, menuEnv).map(mid => ({
            id: mid, ...MENU_DEF[mid], danger: mid === 'delete', onSelect: () => selectMenu(mid, item),
        }))
        return (
            <MyMapListRow key={item.id} item={item} view={view} swatch={swatchOf(item)} active={active}
                selecting={selecting} picked={view.pickable && selectedIds.has(item.id)} mapLoadPct={mapLoadPct}
                menuEntries={menuEntries} menuOpen={openMenuId === item.id}
                onMenuOpenChange={o => setOpenMenuId(cur => (o ? item.id : cur === item.id ? null : cur))}
                onToggle={() => toggleVisibility(item)} onLocate={() => { void handleLocate(item) }}
                onPick={() => toggleSelected(item.id)} onDelete={() => setDeleteTarget({ id: item.id, name: item.name })} />
        )
    }

    const showSearch = shouldShowSearch(items.length) || searching
    const hiddenActive = searching ? hiddenActiveCount(items.filter(i => i.owner === (activeTab === 'owned')), tabItems, visibleIds) : 0
    const noMatch = searching && tabItems.length === 0 && (activeTab === 'owned' ? owned.length : shared.length) > 0
    const reloadList = () => { void catalog?.load() }

    return (
        <div className="gm-panel" style={showDropCover ? { position: 'relative' } : undefined} {...panelDrop.bind}>
            <div className="gm-panel__header">
                <span className="gm-panel__title">나만의지도</span>
                <div className="gm-mymap-panel__header-actions">
                    <button type="button" onClick={toggleSelectMode} aria-pressed={selecting}
                        disabled={owned.length === 0}
                        title={owned.length === 0 ? '공유할 내 레이어가 없습니다' : owned.length === 1 || !bulkAvailable ? '내 레이어를 골라 공유' : '여러 레이어를 골라 한 번에 공유'}
                        className={cx('gm-mymap-panel__ghost', selecting && 'gm-is-on')}>
                        <Share2 size={12} aria-hidden="true" />{selecting ? '공유 취소' : '공유'}
                    </button>
                    {uploadAvailable && (
                        <button type="button" ref={uploadBtnRef} onClick={() => setShowUpload(true)} disabled={layerFull}
                            aria-describedby={layerFull && activeTab === 'owned' ? limitNoteId : undefined}
                            title={layerFull ? `나만의지도는 최대 ${maxLayers}개까지 만들 수 있습니다` : undefined}
                            className="gm-mymap-panel__primary">
                            <Plus size={12} aria-hidden="true" />업로드
                        </button>
                    )}
                </div>
            </div>
            {selecting && (
                <div className="gm-mymap-panel__select-banner">
                    {bulkAvailable && pickableOwned.length >= 2 ? '공유할 내 레이어를 고르세요 (여러 개 선택 가능)' : '공유할 내 레이어를 고르세요'}
                </div>
            )}

            {!loading && !(items.length === 0 && listError) && (
                <MyMapTabs active={activeTab} ownedCount={owned.length} sharedCount={shared.length} onChange={changeTab} idBase={tabsId} />
            )}
            <div className="gm-panel__list">
                {loading ? (
                    <div className="gm-panel__loading">
                        <Loader2 size={18} className="gm-loader gm-loader--primary" />
                    </div>
                ) : items.length === 0 && listError ? (
                    <MyMapListError onRetry={reloadList} />
                ) : (
                    <div role="tabpanel" id={tabPanelId(tabsId)} aria-labelledby={tabId(tabsId, activeTab)}>
                        {listError && <MyMapListError banner onRetry={reloadList} />}
                        {showSearch && (
                            <div className="gm-mymap-panel__search">
                                <label className="gm-mymap-panel__searchbox">
                                    <Search size={12} aria-hidden="true" />
                                    <input type="text" value={query} onChange={e => setQuery(e.target.value)}
                                        placeholder="이름·보낸 사람 검색" aria-label="레이어 검색(현재 탭 안에서)" className="gm-mymap-panel__search-input" />
                                    {query !== '' && (
                                        <button type="button" onClick={() => setQuery('')} aria-label="검색어 지우기" className="gm-mymap-panel__search-clear">
                                            <X size={12} aria-hidden="true" />
                                        </button>
                                    )}
                                </label>
                            </div>
                        )}
                        {hiddenActive > 0 && (
                            <div className="gm-mymap-panel__snote">지도에 켠 레이어 {formatCount(hiddenActive)}개가 목록에서 가려져 있습니다</div>
                        )}
                        {noMatch && (
                            <div className="gm-mymap-panel__nomatch" role="status">
                                <span>&quot;{query.trim()}&quot;에 맞는 레이어가 없습니다</span>
                                <button type="button" className="gm-mymap-panel__sbtn" onClick={() => setQuery('')}>검색 지우기</button>
                            </div>
                        )}

                        {activeTab === 'owned' ? (
                            <>
                                {maxLayers !== null && owned.length > 0 && (
                                    <div className="gm-mymap-panel__sec">
                                        <span>내 레이어</span>
                                        <span className={cx('gm-mymap-panel__sec-count', layerFull && 'gm-is-full')}>
                                            {layerFull && <AlertTriangle size={11} aria-hidden="true" />}{quotaText(owned.length, maxLayers)}
                                        </span>
                                    </div>
                                )}
                                {layerFull && maxLayers !== null && (
                                    <div id={limitNoteId} className="gm-mymap-panel__limit-note">
                                        <Info size={12} aria-hidden="true" />{limitNoteText(maxLayers, hasFailedOwned)}
                                    </div>
                                )}
                                {owned.length === 0 ? (
                                    <MyMapEmptyState uploadAvailable={uploadAvailable} onUpload={() => setShowUpload(true)} />
                                ) : (
                                    tabItems.map(renderItem)
                                )}
                            </>
                        ) : shared.length === 0 ? (
                            <MyMapSharedEmpty />
                        ) : (
                            tabItems.map(renderItem)
                        )}
                    </div>
                )}
            </div>

            {selecting && (
                <div className="gm-mymap-panel__select-bar">
                    <span className="gm-mymap-panel__select-count">{formatCount(pickedIds.length)}개 선택</span>
                    {bulkAvailable && (
                        <button type="button" onClick={toggleAllSelected} className="gm-mymap-panel__select-link">{allPicked ? '선택 해제' : '전체 선택'}</button>
                    )}
                    <button type="button" disabled={pickedIds.length === 0}
                        onClick={() => { setShareFromSelection(true); setShareItems(pickableOwned.filter(i => selectedIds.has(i.id)).map(i => ({ id: i.id, name: i.name }))) }}
                        className="gm-mymap-panel__select-share"><Share2 size={12} /> 공유하기</button>
                    <button type="button" onClick={exitSelect} className="gm-mymap-panel__select-link">취소</button>
                </div>
            )}

            {showUpload && (
                <MyMapUploadModal quota={quota} onClose={() => { setShowUpload(false); setDropped(null) }} onUploaded={fetchList}
                    initialFiles={dropped?.files} initialNotice={dropped?.notice} returnFocusRef={uploadBtnRef} />
            )}
            {shareItems && (
                <MyMapShareDialog items={shareItems} fromSelection={shareFromSelection && bulkAvailable} onClose={() => setShareItems(null)}
                    onDone={() => {
                        // 공유 수(shareCount) 갱신을 위해 목록을 다시 받고, 선택 모드에서 연 공유였다면(1개만 골라도) 선택 모드를 끝낸다(결과 화면은 닫기 전까지 그대로)
                        if (shareFromSelection) exitSelect()
                        void catalog?.load()
                    }} />
            )}
            {reportTarget && (
                <MyMapImportReportDialog key={`${reportTarget.id}-${reportTarget.auto ? 'auto' : 'manual'}`} id={reportTarget.id} name={reportTarget.name}
                    auto={reportTarget.auto} failure={reportTarget.failure} onClose={() => setReportTarget(null)} />
            )}
            {deleteTarget && (
                <MyMapDeleteConfirm key={deleteTarget.id} name={deleteTarget.name} onConfirm={() => handleDelete(deleteTarget.id)}
                    onClose={() => setDeleteTarget(null)} />
            )}
            {tableTarget && (
                <MyMapTableDialog key={tableTarget.id} id={tableTarget.id} name={tableTarget.name} onClose={() => setTableTarget(null)} />
            )}
            {exportTarget && (
                <MyMapExportDialog key={exportTarget.id} id={exportTarget.id} name={exportTarget.name} featureCount={exportTarget.featureCount}
                    onClose={() => setExportTarget(null)} />
            )}
            {styleTarget && (
                <MyMapStyleDialog key={styleTarget.id} id={styleTarget.id} name={styleTarget.name} catalog={catalog}
                    onClose={() => setStyleTarget(null)} onSavingChange={saving => { styleSavingRef.current = saving }} />
            )}
            {showDropCover && (
                <div className={cx('gm-mymap-panel__dropcover', layerFull && 'gm-is-full')} aria-hidden="true">
                    <span className="gm-mymap-panel__dropcover-icon">{layerFull ? <AlertTriangle size={20} /> : <Upload size={20} />}</span>
                    <b>{layerFull ? `레이어가 가득 찼습니다(${owned.length}/${maxLayers})` : '놓으면 업로드 창이 열립니다'}</b>
                    <small>{layerFull ? '안 쓰는 레이어를 지운 뒤 올려 주세요' : '올린 파일이 미리 채워집니다'}</small>
                </div>
            )}
        </div>
    )
}
