'use client'

// 나만의지도 속성 테이블 — 레이어의 피처 속성을 표로(열 = 모든 피처 속성 키 합집합, 맨 앞 `#` 행 번호).
// 데이터는 소스의 geojson(id)(EPSG:4326 FeatureCollection)을 한 번 받아 한 번만 파싱한다(useMemo). 큰 레이어(shp 최대 10만 피처)에서도
// 멈추지 않게 현재 쪽(100행)만 그리고, 필터·정렬은 행 번호 배열(tableModel)만 만든다. 공유받은 레이어도 연다(서버가 권한을 판단).
// 행을 누르면 그 피처의 좌표 범위로 지도를 옮기고(레이어가 꺼져 있으면 켠다) 모달을 작은 막대로 접는다 — 막대를 누르면 필터·정렬·쪽 그대로 다시 펼쳐진다.
// 스타일: gm-modal(업로드·공유와 공용), gm-table-dialog
import { useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { X, Loader2, ChevronLeft, ChevronRight, ArrowUp, ArrowDown, Search, Table2 } from 'lucide-react'
import { useGisMap } from '../../react'
import { cx } from '../cx'
import { formatCount } from './format'
import {
    CELL_MAX_CHARS, CELL_TITLE_MAX_CHARS, CELL_TITLE_MIN_CHARS, TABLE_MAX_COLUMNS, TABLE_PAGE_SIZE,
    buildTable, cellText, clampPage, clipText, featureExtent, filterIndices, hasFeatureGeometry, pageCount, pageRange, sortIndices,
} from './tableModel'
import type { RowOrder, SortDir } from './tableModel'

interface MyMapTableDialogProps {
    id: number
    name: string
    onClose: () => void
}

/** 필터 입력이 멈춘 뒤 이만큼(ms) 기다렸다가 걸러 낸다(10만 행에서 글자마다 걸러 내지 않게) */
const FILTER_DELAY_MS = 250

interface SortState { key: string; dir: SortDir }

export default function MyMapTableDialog({ id, name, onClose }: MyMapTableDialogProps) {
    // 엔진·소스 객체는 엔진마다 하나(참조 고정) → 아래 effect가 다시 돌지 않는다
    const map = useGisMap()
    const myMap = map?.sources.myMap
    const [raw, setRaw] = useState<unknown>(null)
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

    // 요청 도중 닫거나 다른 레이어로 바뀌면 늦게 온 응답은 버린다
    useEffect(() => {
        let cancelled = false
        setLoading(true)
        setError(null)
        setRaw(null)
        ;(async () => {
            try {
                if (!myMap) throw new Error('속성 정보를 불러오지 못했습니다')
                const res = await myMap.geojson(id)
                if (cancelled) return
                if (!res || typeof res !== 'object') throw new Error('속성 정보를 읽을 수 없습니다')
                setRaw(res)
            } catch (e) {
                if (!cancelled) setError(e instanceof Error && e.message ? e.message : '속성 정보를 불러오지 못했습니다')
            } finally {
                if (!cancelled) setLoading(false)
            }
        })()
        return () => {
            cancelled = true
        }
    }, [id, myMap])

    // Esc로 닫기(부모가 매번 새 콜백을 줘도 리스너를 다시 달지 않는다)
    const closeRef = useRef(onClose)
    closeRef.current = onClose
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') closeRef.current() }
        document.addEventListener('keydown', onKey)
        return () => document.removeEventListener('keydown', onKey)
    }, [])

    // 접히면 펼치기 단추로 포커스를 옮긴다(키보드 사용자가 길을 잃지 않게)
    useEffect(() => { if (minimized) pillOpenRef.current?.focus() }, [minimized])

    // 입력 지연 처리: 멈춘 뒤에 적용한다(쪽은 입력하는 순간 첫 쪽으로 — onChange)
    useEffect(() => {
        const t = setTimeout(() => setFilter(filterInput), FILTER_DELAY_MS)
        return () => clearTimeout(t)
    }, [filterInput])

    // 파싱은 응답이 바뀔 때 한 번만
    const table = useMemo(() => (raw === null ? null : buildTable(raw)), [raw])
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

    // 행 → 지도: 피처 범위로 이동. 레이어가 꺼져 있으면 켜서 피처가 보이게 하고, 점 하나면 너무 확대되지 않게 17까지만
    const goTo = (ri: number) => {
        const extent = featureExtent(raw, ri)
        if (!map || !extent) return
        setPicked(ri)
        if (!map.vector.isVisible(id)) Promise.resolve(map.vector.show(id)).catch(() => {})
        const isPoint = extent[0] === extent[2] && extent[1] === extent[3]
        map.fitLonLatExtent(extent, { maxZoom: isPoint ? 17 : 18 })
        setMinimized(true)
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
            const canGo = !!map && hasFeatureGeometry(raw, ri)
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
        <div className={cx('gm-modal', minimized && 'gm-is-min')} onClick={onClose}>
            <div onClick={e => e.stopPropagation()} className="gm-modal__dialog gm-table-dialog" role="dialog" aria-modal="true" aria-label={`속성 테이블 — ${name}`}>
                <div className="gm-modal__header">
                    <span className="gm-modal__title gm-table-dialog__title">
                        <span className="gm-table-dialog__name">속성 테이블 — {name}</span>
                        {table && <span className="gm-table-dialog__dims">{formatCount(table.rows.length)}행 · {formatCount(table.totalColumns)}열</span>}
                    </span>
                    <button onClick={onClose} className="gm-modal__close" aria-label="닫기"><X size={16} /></button>
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
            <div className="gm-table-dialog__pill" role="region" aria-label="속성 테이블(접힘)">
                <button type="button" ref={pillOpenRef} className="gm-table-dialog__pill-open" onClick={() => setMinimized(false)}>
                    <Table2 size={12} /> 속성 테이블 — {name} · 펼치기
                </button>
                <button type="button" className="gm-table-dialog__pill-close" aria-label="닫기" onClick={onClose}><X size={12} /></button>
            </div>
        )}
        </>
    )
}
