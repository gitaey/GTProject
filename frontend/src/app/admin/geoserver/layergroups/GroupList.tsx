'use client'

import { ChevronDown, ChevronRight, Folder, Globe, Layers, Lock, Pencil, Plus, RefreshCw, Trash2 } from 'lucide-react'
import Alert from './Alert'
import CopyButton from './CopyButton'
import {
    DOT_NAME_MESSAGE, MODE_LABEL, formatBounds, frontBlockedReason, groupKey, hasDot,
    type LayerGroupDetail, type LayerGroupSummary,
} from './types'

export type DetailState =
    | { status: 'loading' }
    | { status: 'ok'; detail: LayerGroupDetail }
    | { status: 'error'; message: string }

/** 한 범위(전역 또는 작업공간)의 그룹 목록 상태 */
export interface ScopeGroups {
    status: 'loading' | 'ok' | 'error'
    items: LayerGroupSummary[]
    message: string | null
}

interface GroupListProps {
    workspaces: string[]
    /** 목록에 함께 보여 줄 작업공간(전역은 항상 보임). 빈 문자열 = 전역만 */
    listWorkspace: string
    onListWorkspaceChange: (ws: string) => void
    globalGroups: ScopeGroups | undefined
    workspaceGroups: ScopeGroups | undefined
    details: Record<string, DetailState>
    expandedKey: string | null
    onToggle: (g: LayerGroupSummary) => void
    onDelete: (g: LayerGroupSummary) => void
    /** [수정] — 상세를 새로 읽어 수정 화면으로 */
    onEdit: (g: LayerGroupSummary) => void
    onRefresh: () => void
    onNewGroup: () => void
    /** 삭제 요청이 나가 있는 그룹 */
    deletingKey: string | null
    /** 수정 화면으로 들어가려고 상세를 읽는 중인 그룹 */
    editingKey: string | null
    /** 삭제 실패·알림 문구 */
    notice: { tone: 'err' | 'info' | 'warn'; message: string } | null
}

const selectStyle: React.CSSProperties = {
    background: 'var(--bg-page)',
    border: '1px solid var(--border)',
    color: 'var(--text-primary)',
    borderRadius: '8px',
    padding: '3px 28px 3px 10px',
    fontSize: '12px',
    minWidth: '120px',
    appearance: 'none',
}

function Detail({ state, onEdit, busy }: { state: DetailState | undefined; onEdit: () => void; busy: boolean }) {
    if (!state || state.status === 'loading') {
        return (
            <div className="px-4 pb-4 sm:pl-11 text-xs flex items-center gap-2" style={{ color: 'var(--text-faint)' }}>
                <RefreshCw size={12} className="animate-spin" />
                상세를 불러오는 중...
            </div>
        )
    }
    if (state.status === 'error') {
        return <div className="px-4 pb-4 sm:pl-11"><Alert tone="err" compact>{state.message}</Alert></div>
    }
    const d = state.detail
    const blockedReason = d.editBlockedReason ?? frontBlockedReason(d)
    const dash = <span style={{ color: 'var(--text-faint)' }}>—</span>
    return (
        <div className="px-3 sm:pl-11 sm:pr-4 pb-4 pt-1 flex flex-col gap-3">
            <div className="grid gap-x-5 gap-y-2.5 grid-cols-1 sm:grid-cols-3 text-[13px]">
                <div className="min-w-0">
                    <span className="block text-[11px] mb-0.5" style={{ color: 'var(--text-faint)' }}>WMS 이름</span>
                    <span className="inline-flex items-center gap-1 font-mono text-[13px] min-w-0" style={{ overflowWrap: 'anywhere' }}>
                        {d.wmsName}
                        <CopyButton text={d.wmsName} title="WMS 이름 복사" />
                    </span>
                </div>
                <div className="min-w-0 break-words">
                    <span className="block text-[11px] mb-0.5" style={{ color: 'var(--text-faint)' }}>방식</span>
                    {d.mode}{MODE_LABEL[d.mode] ? ` (${MODE_LABEL[d.mode]})` : ''}
                </div>
                <div className="min-w-0 break-words">
                    <span className="block text-[11px] mb-0.5" style={{ color: 'var(--text-faint)' }}>제목</span>
                    {d.title || dash}
                </div>
                <div className="min-w-0">
                    <span className="block text-[11px] mb-0.5" style={{ color: 'var(--text-faint)' }}>영역</span>
                    {d.bounds ? <span className="font-mono text-xs break-words">{formatBounds(d.bounds)}</span> : dash}
                </div>
                <div className="min-w-0">
                    <span className="block text-[11px] mb-0.5" style={{ color: 'var(--text-faint)' }}>좌표계</span>
                    {d.bounds?.crs ?? dash}
                </div>
                <div className="min-w-0 break-words">
                    <span className="block text-[11px] mb-0.5" style={{ color: 'var(--text-faint)' }}>설명</span>
                    {d.description || dash}
                </div>
            </div>

            <div>
                <div className="text-[11px] mb-1" style={{ color: 'var(--text-faint)' }}>레이어 {d.members.length}개</div>
                <ul className="list-none m-0 p-0 rounded-lg overflow-hidden" style={{ border: '1px solid var(--border)', background: 'var(--bg-surface)' }}>
                    {d.members.map((m, i) => (
                        <li key={`${i}-${m.name}`} className="flex items-center gap-2 px-2.5 py-1.5 text-xs min-w-0"
                            style={{ borderBottom: i < d.members.length - 1 ? '1px solid var(--border-subtle)' : 'none' }}>
                            <span className="w-4 shrink-0" style={{ color: 'var(--text-faint)' }}>{i + 1}</span>
                            {m.type === 'layerGroup' && <Layers size={12} className="shrink-0" style={{ color: 'var(--text-faint)' }} />}
                            <span className="flex-1 min-w-0 font-mono" style={{ overflowWrap: 'anywhere' }}>{m.name}</span>
                            <span style={{ color: m.style ? 'var(--text-muted)' : 'var(--text-faint)' }}>{m.style ?? '기본 스타일'}</span>
                        </li>
                    ))}
                </ul>
                <div className="text-[11px] mt-1" style={{ color: 'var(--text-faint)' }}>1번이 가장 먼저 그려져 지도에서 맨 아래에 깔립니다.</div>
            </div>

            {blockedReason && (
                <div className="flex items-start gap-2 text-xs rounded-lg px-2.5 py-2"
                    style={{ background: 'var(--bg-hover)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}>
                    <Lock size={14} className="shrink-0 mt-px" />
                    <span>{blockedReason}</span>
                </div>
            )}
            {!blockedReason && d.layersLockedReason && (
                <Alert tone="warn" compact>
                    {d.layersLockedReason} 레이어 구성은 바꿀 수 없습니다(제목·방식만).
                </Alert>
            )}
            {!d.verified && <Alert tone="warn" compact>GeoServer에서 다시 읽지 못한 값입니다.</Alert>}
            {!blockedReason && !hasDot(d.name) && (
                <div>
                    <button type="button" onClick={onEdit} disabled={busy}
                        className="inline-flex items-center gap-1 px-2.5 py-1 text-xs rounded-lg cursor-pointer disabled:opacity-50"
                        style={{ border: '1px solid var(--border)', background: 'var(--bg-page)', color: 'var(--text-secondary)' }}>
                        <Pencil size={12} />
                        이 그룹 수정
                    </button>
                </div>
            )}
        </div>
    )
}

function SectionHeader({ children }: { children: React.ReactNode }) {
    return (
        <li className="flex items-center gap-1.5 px-4 py-2 text-[11px]"
            style={{ background: 'var(--bg-hover)', color: 'var(--text-faint)', borderBottom: '1px solid var(--border-subtle)' }}>
            {children}
        </li>
    )
}

interface RowsProps
    extends Pick<GroupListProps, 'details' | 'expandedKey' | 'onToggle' | 'onDelete' | 'onEdit' | 'deletingKey' | 'editingKey'> {
    groups: ScopeGroups | undefined
    emptyText: string
}

function Rows({ groups, emptyText, details, expandedKey, onToggle, onDelete, onEdit, deletingKey, editingKey }: RowsProps) {
    if (!groups || (groups.status === 'loading' && groups.items.length === 0)) {
        return (
            <li className="px-4 py-3 text-xs flex items-center gap-2" style={{ color: 'var(--text-faint)', borderBottom: '1px solid var(--border-subtle)' }}>
                <RefreshCw size={12} className="animate-spin" />불러오는 중...
            </li>
        )
    }
    if (groups.status === 'error') {
        return <li className="px-4 py-3"><Alert tone="err" compact>{groups.message ?? '레이어 그룹 목록을 불러오지 못했습니다.'}</Alert></li>
    }
    if (groups.items.length === 0) {
        return <li className="px-4 py-3 text-xs" style={{ color: 'var(--text-faint)', borderBottom: '1px solid var(--border-subtle)' }}>{emptyText}</li>
    }
    return (
        <>
            {groups.items.map(g => {
                const key = groupKey(g.workspace, g.name)
                const open = expandedKey === key
                const dot = hasDot(g.name)
                const deleting = deletingKey === key
                const state = details[key]
                const blocked = state?.status === 'ok' ? state.detail.editBlockedReason ?? frontBlockedReason(state.detail) : null
                const entering = editingKey === key
                const Chevron = open ? ChevronDown : ChevronRight
                return (
                    <li key={key} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                        <div className="flex items-center gap-2.5 px-4 py-2.5 min-w-0">
                            <button type="button" onClick={() => onToggle(g)} aria-expanded={open}
                                className="flex items-center gap-2.5 flex-1 min-w-0 text-left cursor-pointer" style={{ background: 'transparent' }}>
                                <Chevron size={14} className="shrink-0" style={{ color: 'var(--text-faint)' }} />
                                <Layers size={14} className="shrink-0" style={{ color: 'var(--accent)' }} />
                                <span className="flex-1 min-w-0 font-mono text-[13px]" style={{ overflowWrap: 'anywhere', color: 'var(--text-primary)' }}>{g.name}</span>
                            </button>
                            <span className="inline-flex items-center gap-1 text-[11px] px-2 py-px rounded-full font-medium whitespace-nowrap"
                                style={{ background: 'var(--bg-hover)', color: 'var(--text-faint)', border: '1px solid var(--border)' }}>
                                {g.workspace ? <><Folder size={12} />{g.workspace}</> : <><Globe size={12} />전역</>}
                            </span>
                            <button type="button" onClick={() => onEdit(g)} disabled={dot || !!blocked || editingKey !== null}
                                title={dot ? DOT_NAME_MESSAGE : blocked ?? '수정'} aria-label={`${g.name} 수정`}
                                className="flex items-center justify-center w-8 h-8 rounded-lg cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                                style={{ border: '1px solid var(--border)', color: 'var(--text-muted)' }}>
                                {entering ? <RefreshCw size={14} className="animate-spin" /> : <Pencil size={14} />}
                            </button>
                            <button type="button" onClick={() => onDelete(g)} disabled={dot || deleting}
                                title={dot ? DOT_NAME_MESSAGE : '삭제'} aria-label={`${g.name} 삭제`}
                                className="flex items-center justify-center w-8 h-8 rounded-lg cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                                style={{ border: '1px solid var(--border)', color: '#ef4444' }}>
                                {deleting ? <RefreshCw size={14} className="animate-spin" /> : <Trash2 size={14} />}
                            </button>
                        </div>
                        {dot && !open && (
                            <div className="px-4 pb-2.5 sm:pl-11">
                                <div className="flex items-start gap-2 text-xs rounded-lg px-2.5 py-2"
                                    style={{ background: 'var(--bg-hover)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}>
                                    <Lock size={14} className="shrink-0 mt-px" />
                                    <span>이름에 점(.)이 있어 수정·삭제를 막았습니다 — GeoServer가 점 뒤를 형식으로 읽어 다른 그룹을 가리킬 수 있습니다. GeoServer 관리 화면에서 하세요.</span>
                                </div>
                            </div>
                        )}
                        {open && <Detail state={state} onEdit={() => onEdit(g)} busy={editingKey !== null} />}
                    </li>
                )
            })}
        </>
    )
}

/** 그룹 목록 — 전역 + 고른 작업공간. 줄을 펼치면 상세(처음 한 번만 불러옴), [삭제] */
export default function GroupList({
    workspaces, listWorkspace, onListWorkspaceChange, globalGroups, workspaceGroups,
    details, expandedKey, onToggle, onDelete, onEdit, onRefresh, onNewGroup, deletingKey, editingKey, notice,
}: GroupListProps) {
    const rowProps = { details, expandedKey, onToggle, onDelete, onEdit, deletingKey, editingKey }
    const globalCount = globalGroups?.items.length ?? 0
    const wsCount = workspaceGroups?.items.length ?? 0
    const loading = globalGroups?.status === 'loading' || workspaceGroups?.status === 'loading'
    const empty = globalGroups?.status === 'ok' && globalCount === 0 && (!listWorkspace || (workspaceGroups?.status === 'ok' && wsCount === 0))

    return (
        <div className="space-y-3">
            {notice && <Alert tone={notice.tone}>{notice.message}</Alert>}
            <div className="rounded-xl overflow-hidden" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
                <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-xs font-medium"
                    style={{ background: 'var(--bg-hover)', borderBottom: '1px solid var(--border)', color: 'var(--text-secondary)' }}>
                    <span>
                        레이어 그룹 <span className="font-normal" style={{ color: 'var(--text-faint)' }}>
                            · 전역 {globalCount}{listWorkspace ? ` · ${listWorkspace} ${wsCount}` : ''}
                        </span>
                    </span>
                    <span className="flex items-center gap-1.5">
                        <span className="relative">
                            <select value={listWorkspace} onChange={e => onListWorkspaceChange(e.target.value)} aria-label="목록에 함께 보일 작업공간" style={selectStyle}>
                                <option value="">전역만</option>
                                {workspaces.map(w => <option key={w} value={w}>{w}</option>)}
                            </select>
                            <ChevronDown size={12} className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--text-faint)' }} />
                        </span>
                        <button type="button" onClick={onRefresh} disabled={loading}
                            className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded-lg cursor-pointer disabled:opacity-50"
                            style={{ border: '1px solid var(--border)', background: 'var(--bg-page)', color: 'var(--text-muted)' }}>
                            <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
                            새로고침
                        </button>
                    </span>
                </div>

                {empty ? (
                    <div className="px-4 py-10 text-center">
                        <Layers size={20} className="mx-auto" style={{ color: 'var(--text-faint)' }} />
                        <div className="mt-2 text-[13px]" style={{ color: 'var(--text-secondary)' }}>이 범위에 레이어 그룹이 없습니다.</div>
                        <button type="button" onClick={onNewGroup}
                            className="inline-flex items-center gap-1.5 mt-3 px-2.5 py-1 text-xs rounded-lg cursor-pointer"
                            style={{ border: '1px solid var(--border)', background: 'var(--bg-page)', color: 'var(--text-secondary)' }}>
                            <Plus size={12} />
                            새 그룹 만들기
                        </button>
                    </div>
                ) : (
                    <ul className="list-none m-0 p-0">
                        <SectionHeader><Globe size={12} />전역</SectionHeader>
                        <Rows groups={globalGroups} emptyText="전역 레이어 그룹이 없습니다." {...rowProps} />
                        {listWorkspace && (
                            <>
                                <SectionHeader><Folder size={12} />작업공간 {listWorkspace}</SectionHeader>
                                <Rows groups={workspaceGroups} emptyText="이 작업공간에 레이어 그룹이 없습니다." {...rowProps} />
                            </>
                        )}
                    </ul>
                )}
            </div>
        </div>
    )
}
