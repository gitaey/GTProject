'use client'

// 나만의지도 속성 테이블 — 레이어의 피처 속성을 표로(열 = 모든 피처 속성 키 합집합, 맨 앞 `#` 행 번호).
// 데이터: 이 레이어가 지도에 올라와 있으면 그 피처(서버 응답 순서 그대로, vector.featuresInOrder)를 그대로 쓴다 — 큰 레이어에서 같은 GeoJSON을 두 번 받지 않는다.
// 꺼져 있으면 소스의 geojson(id)(EPSG:4326 FeatureCollection)을 한 번 받아 한 번만 파싱한다(useMemo). 큰 레이어(shp 최대 10만 피처)에서도
// 멈추지 않게 현재 쪽(100행)만 그리고, 필터·정렬은 행 번호 배열(tableModel)만 만든다. 공유받은 레이어도 연다(서버가 권한을 판단).
// 행을 누르면 그 피처의 좌표 범위로 지도를 옮기고(레이어가 꺼져 있으면 켠다) 창은 그대로 둔다(접지 않는다).
// 처음에는 지도 영역의 왼쪽 위에 열린다(가운데가 아니다 — 지도를 가리지 않게).
// 창은 지도를 막지 않는 떠 있는 창이다: 뒷배경이 클릭을 통과시키고(지도를 계속 움직일 수 있다), 머리줄을 끌어 옮길 수 있다.
// 직접 접고 싶으면 머리줄의 접기 단추 — 막대를 누르면 필터·정렬·쪽 그대로 다시 펼쳐진다.
// 스타일: gm-modal(업로드·공유와 공용) + gm-table-modal(막지 않는 변형), gm-table-dialog
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent, ReactNode } from 'react'
import { X, Loader2, ChevronLeft, ChevronRight, ArrowUp, ArrowDown, Search, Table2, Minus } from 'lucide-react'
import type Feature from 'ol/Feature'
import type Geometry from 'ol/geom/Geometry'
import { useGisMap } from '../../react'
import { cx } from '../cx'
import { formatCount } from './format'
import {
    CELL_MAX_CHARS, CELL_TITLE_MAX_CHARS, CELL_TITLE_MIN_CHARS, TABLE_MAX_COLUMNS, TABLE_PAGE_SIZE,
    buildTable, buildTableFromFeatures, cellText, clampPage, clipText, featureExtent, filterIndices, hasFeatureGeometry, pageCount, pageRange, sortIndices,
} from './tableModel'
import type { RowOrder, SortDir } from './tableModel'

interface MyMapTableDialogProps {
    id: number
    name: string
    onClose: () => void
}

/** 필터 입력이 멈춘 뒤 이만큼(ms) 기다렸다가 걸러 낸다(10만 행에서 글자마다 걸러 내지 않게) */
const FILTER_DELAY_MS = 250

/** 끌어서 옮길 때 화면 밖으로 나가도 남겨 두는 최소 길이(px) — 머리줄을 다시 잡을 수 있게 */
const DRAG_KEEP_X = 96
const DRAG_KEEP_Y = 40
/** 처음 열 때 지도 영역의 왼쪽·위 모서리에서 띄우는 거리(px) */
const OPEN_GAP = 16

interface Offset { x: number; y: number }
interface DragStart { px: number; py: number; ox: number; oy: number; baseLeft: number; baseTop: number; width: number }

/** 창 기준 위치(가운데, 옮기기 전)에서 x·y만큼 옮긴 값을 화면 안으로 되돌린다 */
function clampOffset(x: number, y: number, baseLeft: number, baseTop: number, width: number): Offset {
    const vw = window.innerWidth
    const vh = window.innerHeight
    const minX = DRAG_KEEP_X - width - baseLeft
    const maxX = vw - DRAG_KEEP_X - baseLeft
    const minY = -baseTop
    const maxY = vh - DRAG_KEEP_Y - baseTop
    return { x: Math.min(Math.max(x, minX), Math.max(minX, maxX)), y: Math.min(Math.max(y, minY), Math.max(minY, maxY)) }
}

interface SortState { key: string; dir: SortDir }

/** 표의 원자료: 서버 GeoJSON(raw) 또는 지도에 올라온 피처(features — 행 번호 = 배열 위치) */
type TableData = { kind: 'raw'; raw: unknown } | { kind: 'features'; features: readonly Feature<Geometry>[] }

export default function MyMapTableDialog({ id, name, onClose }: MyMapTableDialogProps) {
    // 엔진·소스 객체는 엔진마다 하나(참조 고정) → 아래 effect가 다시 돌지 않는다
    const map = useGisMap()
    const myMap = map?.sources.myMap
    const [data, setData] = useState<TableData | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [filterInput, setFilterInput] = useState('')
    const [filter, setFilter] = useState('')
    const [sort, setSort] = useState<SortState | null>(null)
    const [page, setPage] = useState(0)
    // 쪽 번호 입력 중인 글자(null이면 현재 쪽 번호를 보여 준다)
    const [pageDraft, setPageDraft] = useState<string | null>(null)
    // 마지막으로 눌러 지도로 간 행(표시용) · 지도를 보려고 모달을 접은 상태(마운트는 그대로 — 필터·정렬·쪽을 지킨다)
    const [picked, setPicked] = useState<number | null>(null)
    const [minimized, setMinimized] = useState(false)
    const pillOpenRef = useRef<HTMLButtonElement>(null)
    // 창을 끌어 옮긴 만큼(가운데 기준) · 끌기 시작 때의 값(끄는 동안만)
    const dialogRef = useRef<HTMLDivElement>(null)
    const [offset, setOffset] = useState<Offset>({ x: 0, y: 0 })
    const dragRef = useRef<DragStart | null>(null)
    // 처음 열 때의 최대 높이(px) — 위쪽에 붙어 열리므로 아래가 화면 밖으로 잘리지 않게 남은 높이로 줄인다
    const [openMaxHeight, setOpenMaxHeight] = useState<number | null>(null)

    // 처음 놓을 자리: 지도 영역의 왼쪽 위(없으면 화면 왼쪽 위). 첫 그림 전에 정해 가운데에서 깜빡이며 옮겨 가지 않는다.
    // 오버레이가 왼쪽 위 기준(flex-start)이라 이 값이 곧 화면 좌표다. 창이 화면보다 크면 화면 안으로 당긴다
    useLayoutEffect(() => {
        const el = dialogRef.current
        if (!el) return
        const r = el.getBoundingClientRect()
        const area = map?.olMap.getTargetElement()?.getBoundingClientRect()
        const vw = window.innerWidth
        const vh = window.innerHeight
        const x = Math.max(OPEN_GAP, Math.min((area ? area.left : 0) + OPEN_GAP, vw - r.width - OPEN_GAP))
        const y = Math.max(OPEN_GAP, Math.min((area ? area.top : 0) + OPEN_GAP, vh - r.height - OPEN_GAP))
        setOffset({ x, y })
        setOpenMaxHeight(Math.max(240, vh - y - OPEN_GAP))
        // 처음 한 번만(map은 엔진마다 하나)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    // 요청 도중 닫거나 다른 레이어로 바뀌면 늦게 온 응답은 버린다
    useEffect(() => {
        let cancelled = false
        setLoading(true)
        setError(null)
        setData(null)
        // 지도에 올라와 있는 레이어면 그 피처를 쓴다(다시 받지 않는다). 올리는 중이거나 꺼져 있으면 null → 받아 온다
        const onMap = map?.vector.featuresInOrder(id) ?? null
        if (onMap) {
            setData({ kind: 'features', features: onMap })
            setLoading(false)
            return () => {
                cancelled = true
            }
        }
        ;(async () => {
            try {
                if (!myMap) throw new Error('속성 정보를 불러오지 못했습니다')
                const res = await myMap.geojson(id)
                if (cancelled) return
                if (!res || typeof res !== 'object') throw new Error('속성 정보를 읽을 수 없습니다')
                setData({ kind: 'raw', raw: res })
            } catch (e) {
                if (!cancelled) setError(e instanceof Error && e.message ? e.message : '속성 정보를 불러오지 못했습니다')
            } finally {
                if (!cancelled) setLoading(false)
            }
        })()
        return () => {
            cancelled = true
        }
    }, [id, myMap, map])

    // 창이 지도를 막지 않으므로 Esc는 창 안에 포커스가 있을 때만 닫는다(지도에서 그리기를 취소하는 Esc까지 먹지 않게).
    // 열릴 때 창으로 포커스를 옮겨 열자마자 Esc가 되게 한다
    useEffect(() => { dialogRef.current?.focus({ preventScroll: true }) }, [])

    // 화면 크기가 줄어 창이 밖으로 밀려나면 다시 안으로 당긴다
    useEffect(() => {
        const onResize = () => {
            const el = dialogRef.current
            if (!el) return
            setOffset(cur => {
                if (cur.x === 0 && cur.y === 0) return cur
                const r = el.getBoundingClientRect()
                const next = clampOffset(cur.x, cur.y, r.left - cur.x, r.top - cur.y, r.width)
                return next.x === cur.x && next.y === cur.y ? cur : next
            })
        }
        window.addEventListener('resize', onResize)
        return () => window.removeEventListener('resize', onResize)
    }, [])

    // 머리줄 끌기: 포인터를 잡아 두고(setPointerCapture) 움직인 만큼 옮긴다. 머리줄의 단추(접기·닫기)는 끌기를 시작하지 않는다
    const onDragStart = (e: ReactPointerEvent<HTMLDivElement>) => {
        if (e.button !== 0 || (e.target as HTMLElement).closest('button')) return
        const el = dialogRef.current
        if (!el) return
        const r = el.getBoundingClientRect()
        dragRef.current = { px: e.clientX, py: e.clientY, ox: offset.x, oy: offset.y, baseLeft: r.left - offset.x, baseTop: r.top - offset.y, width: r.width }
        e.currentTarget.setPointerCapture(e.pointerId)
    }
    const onDragMove = (e: ReactPointerEvent<HTMLDivElement>) => {
        const d = dragRef.current
        if (!d) return
        setOffset(clampOffset(d.ox + e.clientX - d.px, d.oy + e.clientY - d.py, d.baseLeft, d.baseTop, d.width))
    }
    const onDragEnd = (e: ReactPointerEvent<HTMLDivElement>) => {
        if (!dragRef.current) return
        dragRef.current = null
        if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId)
    }

    // 접히면 펼치기 단추로 포커스를 옮긴다(키보드 사용자가 길을 잃지 않게)
    useEffect(() => { if (minimized) pillOpenRef.current?.focus() }, [minimized])

    // 입력 지연 처리: 멈춘 뒤에 적용한다(쪽은 입력하는 순간 첫 쪽으로 — onChange)
    useEffect(() => {
        const t = setTimeout(() => setFilter(filterInput), FILTER_DELAY_MS)
        return () => clearTimeout(t)
    }, [filterInput])

    // 파싱은 응답이 바뀔 때 한 번만
    const table = useMemo(
        () => (data === null ? null : data.kind === 'raw' ? buildTable(data.raw) : buildTableFromFeatures(data.features)),
        [data],
    )
    const filtered = useMemo<RowOrder>(() => (table ? filterIndices(table.rows, table.columns, filter) : null), [table, filter])
    const order = useMemo<RowOrder>(
        () => (table && sort ? sortIndices(table.rows, filtered, sort.key, sort.dir) : filtered),
        [table, filtered, sort],
    )

    const total = table ? (order ? order.length : table.rows.length) : 0
    const pages = pageCount(total)
    const safePage = clampPage(page, total)
    const { start, end } = pageRange(safePage, total)

    // 머리글 클릭: 오름 → 내림 → 원래 순서
    const toggleSort = (key: string) => {
        setPage(0)
        setSort(cur => {
            if (!cur || cur.key !== key) return { key, dir: 'asc' }
            return cur.dir === 'asc' ? { key, dir: 'desc' } : null
        })
    }

    // 행 → 지도: 피처 범위로 이동(창은 그대로 둔다). 레이어가 꺼져 있으면 켜서 피처가 보이게 하고, 점 하나면 너무 확대되지 않게 17까지만
    const rowHasGeometry = (ri: number): boolean =>
        data === null ? false : data.kind === 'raw' ? hasFeatureGeometry(data.raw, ri) : !!data.features[ri]?.getGeometry()
    const rowExtent = (ri: number) => {
        if (data === null) return null
        if (data.kind === 'raw') return featureExtent(data.raw, ri)
        const f = data.features[ri]
        return f && map ? map.vector.featureLonLatExtent(f) : null
    }
    const goTo = (ri: number) => {
        const extent = rowExtent(ri)
        if (!map || !extent) return
        setPicked(ri)
        if (!map.vector.isVisible(id)) Promise.resolve(map.vector.show(id)).catch(() => {})
        const isPoint = extent[0] === extent[2] && extent[1] === extent[3]
        map.fitLonLatExtent(extent, { maxZoom: isPoint ? 17 : 18 })
    }

    const commitPage = () => {
        const n = Number.parseInt(pageDraft ?? '', 10)
        if (Number.isFinite(n)) setPage(clampPage(n - 1, total))
        setPageDraft(null)
    }

    const bodyRows: ReactNode[] = []
    if (table) {
        for (let p = start; p < end; p++) {
            const ri = order ? order[p] : p
            const row = table.rows[ri]
            const canGo = !!map && rowHasGeometry(ri)
            bodyRows.push(
                <tr key={ri} className={cx(canGo && 'gm-table-dialog__row--go', picked === ri && 'gm-is-picked')}
                    tabIndex={canGo ? 0 : undefined} title={canGo ? '누르면 지도에서 이 위치로 이동합니다' : undefined}
                    onClick={canGo ? () => goTo(ri) : undefined}
                    onKeyDown={canGo ? e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); goTo(ri) } } : undefined}>
                    <td className="gm-table-dialog__rowno">{ri + 1}</td>
                    {table.columns.map(col => {
                        const v = row[col]
                        const full = cellText(v)
                        return (
                            <td key={col} className={cx(typeof v === 'number' && 'gm-table-dialog__num')}
                                title={full.length > CELL_TITLE_MIN_CHARS ? clipText(full, CELL_TITLE_MAX_CHARS) : undefined}>
                                {clipText(full, CELL_MAX_CHARS)}
                            </td>
                        )
                    })}
                </tr>,
            )
        }
    }
    const filtering = filter.trim() !== ''
    // 머리글 정렬 방향 맞춤: 첫 200행에서 숫자만 있으면 오른쪽(셀은 값마다 따로 정한다)
    const headerNumeric = useMemo(() => {
        const set = new Set<string>()
        if (!table) return set
        for (const col of table.columns) {
            let any = false, allNum = true
            for (let i = 0; i < table.rows.length && i < 200; i++) {
                const v = table.rows[i][col]
                if (v === null || v === undefined || v === '') continue
                any = true
                if (typeof v !== 'number') { allNum = false; break }
            }
            if (any && allNum) set.add(col)
        }
        return set
    }, [table])

    return (
        <>
        <div className={cx('gm-modal', 'gm-table-modal', minimized && 'gm-is-min')}>
            <div ref={dialogRef} tabIndex={-1} className="gm-modal__dialog gm-table-dialog" role="dialog" aria-modal="false" aria-label={`속성 테이블 — ${name}`}
                style={{
                    transform: `translate(${offset.x}px, ${offset.y}px)`,
                    ...(openMaxHeight !== null ? { maxHeight: `min(85vh, ${openMaxHeight}px)` } : null),
                }}
                onKeyDown={e => { if (e.key === 'Escape') onClose() }}>
                <div className="gm-modal__header gm-table-dialog__drag" title="끌어서 옮길 수 있습니다"
                    onPointerDown={onDragStart} onPointerMove={onDragMove} onPointerUp={onDragEnd} onPointerCancel={onDragEnd}>
                    <span className="gm-modal__title gm-table-dialog__title">
                        <span className="gm-table-dialog__name">속성 테이블 — {name}</span>
                        {table && <span className="gm-table-dialog__dims">{formatCount(table.rows.length)}행 · {formatCount(table.totalColumns)}열</span>}
                    </span>
                    <span className="gm-table-dialog__actions">
                        <button type="button" onClick={() => setMinimized(true)} className="gm-modal__close" aria-label="접기" title="접기"><Minus size={16} /></button>
                        <button type="button" onClick={onClose} className="gm-modal__close" aria-label="닫기" title="닫기"><X size={16} /></button>
                    </span>
                </div>

                {loading ? (
                    <div className="gm-modal__loading">
                        <Loader2 size={18} className="gm-loader gm-loader--primary" />
                    </div>
                ) : error ? (
                    <div className="gm-modal__body">
                        <div className="gm-modal__error">{error}</div>
                    </div>
                ) : table && table.rows.length === 0 ? (
                    <div className="gm-modal__body">
                        <div className="gm-panel__empty">표시할 피처가 없습니다</div>
                    </div>
                ) : table ? (
                    <>
                        <div className="gm-table-dialog__toolbar">
                            <label className="gm-table-dialog__search">
                                <Search size={12} aria-hidden="true" />
                                <input type="text" value={filterInput} onChange={e => { setFilterInput(e.target.value); setPage(0) }}
                                    placeholder="전체 열에서 찾기" aria-label="속성 필터" className="gm-table-dialog__filter" />
                            </label>
                            {filtering && (
                                <span className="gm-table-dialog__found">{formatCount(total)}행 / 전체 {formatCount(table.rows.length)}행</span>
                            )}
                            {table.totalColumns > TABLE_MAX_COLUMNS && (
                                <span className="gm-table-dialog__note">열이 많아 앞의 {formatCount(TABLE_MAX_COLUMNS)}개만 표시합니다(전체 {formatCount(table.totalColumns)}열)</span>
                            )}
                        </div>
                        <div className="gm-table-dialog__scroll">
                            <table className="gm-table-dialog__table">
                                <thead>
                                    <tr>
                                        <th className="gm-table-dialog__rowno">#</th>
                                        {table.columns.map(col => {
                                            const active = sort?.key === col
                                            return (
                                                <th key={col} aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
                                                    className={cx(headerNumeric.has(col) && 'gm-table-dialog__num')}>
                                                    <button type="button" className={cx('gm-table-dialog__sort', active && 'gm-is-active')}
                                                        title={col} onClick={() => toggleSort(col)}>
                                                        <span className="gm-table-dialog__col-name">{col}</span>
                                                        {active && (sort.dir === 'asc' ? <ArrowUp size={11} /> : <ArrowDown size={11} />)}
                                                    </button>
                                                </th>
                                            )
                                        })}
                                    </tr>
                                </thead>
                                <tbody>{bodyRows}</tbody>
                            </table>
                            {total === 0 && <div className="gm-panel__empty">조건에 맞는 행이 없습니다</div>}
                        </div>
                        <div className="gm-table-dialog__pager">
                            <button type="button" className="gm-report__page-btn" disabled={safePage <= 0} aria-label="이전 쪽"
                                onClick={() => setPage(safePage - 1)}>
                                <ChevronLeft size={13} />
                            </button>
                            <input type="number" min={1} max={pages} value={pageDraft ?? String(safePage + 1)} aria-label="쪽 번호"
                                className="gm-table-dialog__page-input"
                                onChange={e => setPageDraft(e.target.value)} onBlur={() => { if (pageDraft !== null) commitPage() }}
                                onKeyDown={e => { if (e.key === 'Enter') commitPage() }} />
                            <span className="gm-table-dialog__page-info">
                                / {formatCount(pages)} 쪽 · {total === 0 ? '0행' : `${formatCount(start + 1)}–${formatCount(end)}행`} (페이지당 {TABLE_PAGE_SIZE}행)
                            </span>
                            <button type="button" className="gm-report__page-btn" disabled={safePage + 1 >= pages} aria-label="다음 쪽"
                                onClick={() => setPage(safePage + 1)}>
                                <ChevronRight size={13} />
                            </button>
                        </div>
                    </>
                ) : null}
            </div>
        </div>
        {minimized && (
            <div className="gm-table-dialog__pill" role="region" aria-label="속성 테이블(접힘)"
                onKeyDown={e => { if (e.key === 'Escape') onClose() }}>
                <button type="button" ref={pillOpenRef} className="gm-table-dialog__pill-open" onClick={() => setMinimized(false)}>
                    <Table2 size={12} /> 속성 테이블 — {name} · 펼치기
                </button>
                <button type="button" className="gm-table-dialog__pill-close" aria-label="닫기" onClick={onClose}><X size={12} /></button>
            </div>
        )}
        </>
    )
}
