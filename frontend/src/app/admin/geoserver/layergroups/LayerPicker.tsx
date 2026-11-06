'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { ArrowRight, Check, ChevronDown, Layers, Lock, RefreshCw, Search, Upload } from 'lucide-react'
import Alert from './Alert'
import { MAX_LAYERS, PICKER_RENDER_LIMIT } from './types'

interface LayerPickerProps {
    workspaces: string[]
    workspace: string
    onWorkspaceChange: (ws: string) => void
    /** 수정 모드의 작업공간 소속 그룹처럼 작업공간을 바꿀 수 없을 때 */
    workspaceLocked?: boolean
    workspacesLoading: boolean
    /** 이 작업공간의 발행된 레이어 이름(접두사 없음). 아직 못 받았으면 빈 배열 */
    names: string[]
    loading: boolean
    error: string | null
    /** 새로고침 단추 — 캐시를 버리고 다시 받는다 */
    onRefresh: () => void
    /** 이 작업공간에서 이미 고른 이름(접두사 없음) */
    selectedNames: ReadonlySet<string>
    /** 모든 작업공간을 합친 고른 개수(100개 상한 판단) */
    totalSelected: number
    onToggle: (name: string) => void
    onSetMany: (names: string[], on: boolean) => void
    /** 고르기 영역 전체를 끄는 이유(예: 그룹 스타일이 있어 구성 변경 불가) */
    disabledReason?: string | null
}

const selectStyle: React.CSSProperties = {
    background: 'var(--bg-page)',
    border: '1px solid var(--border)',
    color: 'var(--text-primary)',
    borderRadius: '8px',
    padding: '6px 32px 6px 12px',
    fontSize: '14px',
    minWidth: '180px',
    appearance: 'none',
}

/** 검색어와 겹치는 부분을 표시 — 정규식을 쓰지 않아 특수문자가 들어와도 안전하다 */
function highlight(name: string, q: string): React.ReactNode {
    if (!q) return name
    const i = name.toLowerCase().indexOf(q.toLowerCase())
    if (i < 0) return name
    return (
        <>
            {name.slice(0, i)}
            <mark style={{ background: 'rgba(249,115,22,0.25)', color: 'inherit', borderRadius: '2px' }}>
                {name.slice(i, i + q.length)}
            </mark>
            {name.slice(i + q.length)}
        </>
    )
}

/** 작업공간을 고르고, 그 작업공간의 발행된 레이어를 체크박스로 여러 개 고른다. 고른 것은 부모가 순서 목록 맨 아래에 붙인다 */
export default function LayerPicker({
    workspaces, workspace, onWorkspaceChange, workspaceLocked = false, workspacesLoading,
    names, loading, error, onRefresh, selectedNames, totalSelected, onToggle, onSetMany, disabledReason,
}: LayerPickerProps) {
    const [search, setSearch] = useState('')
    const [query, setQuery] = useState('')
    const [onlySelected, setOnlySelected] = useState(false)

    // 검색은 200ms 쉬었다가 반영 — 수백 줄을 매 글자마다 다시 거르지 않는다
    useEffect(() => {
        const t = window.setTimeout(() => setQuery(search.trim()), 200)
        return () => window.clearTimeout(t)
    }, [search])

    // 작업공간을 바꾸면 검색·필터는 처음으로
    useEffect(() => {
        setSearch('')
        setQuery('')
        setOnlySelected(false)
    }, [workspace])

    const filtered = useMemo(() => {
        const q = query.toLowerCase()
        return names.filter(n => (!q || n.toLowerCase().includes(q)) && (!onlySelected || selectedNames.has(n)))
    }, [names, query, onlySelected, selectedNames])

    const shown = filtered.length > PICKER_RENDER_LIMIT ? filtered.slice(0, PICKER_RENDER_LIMIT) : filtered
    const hidden = filtered.length - shown.length
    const full = totalSelected >= MAX_LAYERS
    const toAdd = filtered.filter(n => !selectedNames.has(n)).length
    const toRemove = filtered.length - toAdd
    const addOverflow = totalSelected + toAdd > MAX_LAYERS
    const locked = !!disabledReason

    // 새로고침 중에도 받아 둔 목록은 계속 보여 준다(깜빡임 방지)
    const ready = !!workspace && !error && names.length > 0

    return (
        <div className="rounded-[10px] overflow-hidden min-w-0" style={{ border: '1px solid var(--border)', background: 'var(--bg-surface)' }}>
            {/* 작업공간 선택 */}
            <div className="px-3 py-2.5 flex flex-wrap items-end gap-2.5" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                <div className="flex flex-col gap-1.5 min-w-0">
                    <label htmlFor="lg-picker-ws" className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
                        레이어를 고를 작업공간
                    </label>
                    <div className="flex items-center gap-2">
                        <div className="relative">
                            <select id="lg-picker-ws" value={workspace} onChange={e => onWorkspaceChange(e.target.value)}
                                disabled={workspacesLoading || workspaceLocked || locked}
                                style={{ ...selectStyle, opacity: workspaceLocked ? 0.7 : 1 }}>
                                <option value="">{workspacesLoading ? '불러오는 중...' : '선택'}</option>
                                {workspaces.map(w => <option key={w} value={w}>{w}</option>)}
                            </select>
                            {workspaceLocked
                                ? <Lock size={14} className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--text-faint)' }} />
                                : <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--text-faint)' }} />}
                        </div>
                        <button type="button" onClick={onRefresh} disabled={!workspace || loading || locked} title="새로고침"
                            className="flex items-center justify-center w-8 h-8 rounded-lg cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                            style={{ border: '1px solid var(--border)', background: 'var(--bg-page)', color: 'var(--text-muted)' }}>
                            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
                        </button>
                    </div>
                </div>
            </div>

            {/* 머리줄 */}
            <div className="px-3 py-2 flex flex-wrap items-center justify-between gap-2 text-xs"
                style={{ background: 'var(--bg-hover)', borderBottom: '1px solid var(--border)', color: 'var(--text-secondary)' }}>
                <span>
                    <b className="font-medium">{workspace || '작업공간'}</b>의 발행된 레이어
                    {workspace && !loading && !error && <span style={{ color: 'var(--text-faint)' }}> {names.length}개</span>}
                    {selectedNames.size > 0 && <span style={{ color: 'var(--accent)' }}> · {selectedNames.size}개 고름</span>}
                </span>
                <span className="flex items-center gap-1">
                    {([false, true] as const).map(only => (
                        <button key={String(only)} type="button" onClick={() => setOnlySelected(only)} disabled={!ready || locked}
                            className="text-xs px-2.5 py-0.5 rounded-full cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                            style={{
                                background: onlySelected === only ? 'var(--accent)' : 'transparent',
                                color: onlySelected === only ? '#fff' : 'var(--text-faint)',
                                border: `1px solid ${onlySelected === only ? 'var(--accent)' : 'var(--border)'}`,
                            }}>
                            {only ? '고른 것만' : '전체'}
                        </button>
                    ))}
                </span>
            </div>

            {disabledReason && (
                <div className="p-3"><Alert tone="warn" compact>{disabledReason}</Alert></div>
            )}

            {!workspace && (
                <div className="px-3 py-8 text-center text-[13px]" style={{ color: 'var(--text-faint)' }}>
                    위에서 작업공간을 고르면 발행된 레이어가 나타납니다.
                </div>
            )}

            {workspace && loading && names.length === 0 && (
                <ul className="m-0 p-0 list-none" aria-busy="true">
                    {[1, 2, 3, 4, 5, 6].map(i => (
                        <li key={i} className="flex items-center gap-2.5 px-3 py-2.5" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                            <span className="w-4 h-4 rounded shrink-0" style={{ background: 'var(--bg-hover)', border: '1px solid var(--border)', opacity: 0.5 }} />
                            <span className="h-3 rounded-md animate-pulse" style={{ width: `${60 + i * 25}px`, background: 'var(--border)' }} />
                        </li>
                    ))}
                </ul>
            )}

            {workspace && error && (
                <div className="p-3">
                    <Alert tone="err" title="레이어 목록을 불러오지 못했습니다"
                        action={
                            <button type="button" onClick={onRefresh} className="text-xs underline cursor-pointer" style={{ color: '#ef4444' }}>
                                다시 시도
                            </button>
                        }>
                        {error}
                    </Alert>
                </div>
            )}

            {workspace && !loading && !error && names.length === 0 && (
                <div className="px-3 py-8 text-center">
                    <Layers size={20} className="mx-auto" style={{ color: 'var(--text-faint)' }} />
                    <div className="mt-2 text-[13px]" style={{ color: 'var(--text-secondary)' }}>이 작업공간에 발행된 레이어가 없습니다.</div>
                    <div className="text-[11px] mt-1" style={{ color: 'var(--text-faint)' }}>먼저 레이어를 발행한 뒤 그룹으로 묶을 수 있습니다.</div>
                    <Link href="/admin/geoserver/publish"
                        className="inline-flex items-center gap-1.5 mt-3 px-2.5 py-1 text-xs rounded-lg"
                        style={{ border: '1px solid var(--border)', background: 'var(--bg-page)', color: 'var(--text-secondary)' }}>
                        <Upload size={12} />
                        레이어 발행으로
                        <ArrowRight size={12} />
                    </Link>
                </div>
            )}

            {ready && (
                <div className={locked ? 'opacity-50 pointer-events-none' : undefined}>
                    <div className="px-3 py-2.5" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                        <div className="relative">
                            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-faint)' }} />
                            <input type="search" value={search} onChange={e => setSearch(e.target.value)}
                                placeholder="레이어 이름 검색" aria-label="레이어 이름 검색"
                                className="w-full rounded-lg text-[13px] outline-none"
                                style={{ background: 'var(--bg-page)', border: '1px solid var(--border)', color: 'var(--text-primary)', padding: '7px 12px 7px 32px' }} />
                        </div>
                        <div className="flex flex-wrap items-center justify-between gap-2 mt-2">
                            <span className="text-[11px]" style={{ color: 'var(--text-faint)' }}>
                                {query ? `"${query}" 검색 결과 ${filtered.length}개` : '줄을 누르면 고르거나 뺍니다'}
                            </span>
                            <span className="flex items-center gap-1">
                                <button type="button" onClick={() => onSetMany(filtered.filter(n => !selectedNames.has(n)), true)}
                                    disabled={toAdd === 0 || addOverflow}
                                    title={addOverflow ? `한 그룹에는 레이어를 ${MAX_LAYERS}개까지 넣을 수 있습니다` : undefined}
                                    className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded-lg cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                                    style={{ border: '1px solid var(--border)', background: 'var(--bg-page)', color: 'var(--text-secondary)' }}>
                                    <Check size={12} />
                                    보이는 것 모두 고르기
                                </button>
                                <button type="button" onClick={() => onSetMany(filtered.filter(n => selectedNames.has(n)), false)}
                                    disabled={toRemove === 0}
                                    className="px-2 py-1 text-xs rounded-lg cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                                    style={{ color: 'var(--text-muted)' }}>
                                    보이는 것 빼기
                                </button>
                            </span>
                        </div>
                        {addOverflow && toAdd > 0 && (
                            <div className="text-[11px] mt-1.5" style={{ color: '#b45309' }}>
                                보이는 {toAdd}개를 모두 고르면 {MAX_LAYERS}개를 넘습니다. 검색어로 줄이세요.
                            </div>
                        )}
                    </div>

                    {filtered.length === 0 ? (
                        <div className="px-3 py-6 text-center text-[13px]" style={{ color: 'var(--text-faint)' }}>
                            {onlySelected && !query ? '이 작업공간에서 고른 레이어가 없습니다.' : '검색 결과가 없습니다.'}
                        </div>
                    ) : (
                        <ul className="m-0 p-0 list-none overflow-auto max-h-[260px] sm:max-h-[340px]">
                            {shown.map(n => {
                                const on = selectedNames.has(n)
                                const blocked = !on && full
                                return (
                                    <li key={n} style={{ borderBottom: '1px solid var(--border-subtle)', background: on ? 'var(--accent-bg)' : undefined }}>
                                        <label className={`flex items-center gap-2.5 px-3 py-2 text-[13px] min-w-0 ${blocked ? 'opacity-45 cursor-not-allowed' : 'cursor-pointer'}`}>
                                            <input type="checkbox" checked={on} disabled={blocked} onChange={() => onToggle(n)}
                                                className="w-4 h-4 shrink-0 cursor-pointer disabled:cursor-not-allowed"
                                                style={{ accentColor: 'var(--accent)' }} />
                                            <span className="flex-1 min-w-0 font-mono" style={{ overflowWrap: 'anywhere', color: 'var(--text-primary)' }}>
                                                {highlight(n, query)}
                                            </span>
                                        </label>
                                    </li>
                                )
                            })}
                        </ul>
                    )}

                    {hidden > 0 && (
                        <div className="px-3 py-2.5 text-xs text-center flex items-center justify-center gap-1.5"
                            style={{ background: 'var(--bg-hover)', color: 'var(--text-muted)' }}>
                            <Search size={12} />
                            앞 {PICKER_RENDER_LIMIT}개만 보입니다 — 검색어로 좁히세요 ({hidden}개 더 있음)
                        </div>
                    )}
                    {full && (
                        <div className="px-3 py-2 text-[11px] text-center" style={{ color: '#b45309', background: 'var(--bg-hover)' }}>
                            레이어는 {MAX_LAYERS}개까지 고를 수 있어 더 고를 수 없습니다.
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}
