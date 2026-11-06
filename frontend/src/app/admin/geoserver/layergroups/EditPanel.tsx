'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Check, RefreshCw } from 'lucide-react'
import { GeoServerApiError, gsFetch } from '../_shared/connection'
import Alert from './Alert'
import GroupEditForm, { type GroupEditValue } from './GroupEditForm'
import LayerPicker from './LayerPicker'
import OrderList, { type OrderItem } from './OrderList'
import { UpdateSaved } from './SaveResult'
import { diffEdit, summaryParts, toRefs, type EditSnapshot } from './diff'
import {
    MAX_LAYERS, NOT_EDITABLE_PREFIX, canonicalLayerName, groupApiPath, normalizeNewlines, splitQualified,
    type LayerGroupDetail, type LayerGroupUpdateRequest, type LayerGroupUpdateResult, type NamesState,
} from './types'

interface EditPanelProps {
    /** 편집을 시작할 때 GeoServer에서 읽은 원본(revision 포함). 바뀌면 부모가 key로 다시 마운트한다 */
    detail: LayerGroupDetail
    connected: boolean
    /** 확인창에 적는 대상 서버(host/path) */
    server: string
    workspaces: string[]
    workspacesLoading: boolean
    layerNames: Record<string, NamesState>
    loadNames: (ws: string, force?: boolean) => Promise<string[] | null>
    /** 428이면 부모가 띠를 띄우고 true. 화면·입력은 그대로 둔다 */
    onLost: (e: unknown, action: string) => boolean
    /** 취소(편집 중이면 확인창은 부모가 띄움) */
    onCancel: () => void
    /** 현재 내용으로 다시 불러옴(성공하면 부모가 새 detail로 다시 마운트, 실패는 throw) */
    onReload: () => Promise<void>
    /** 이미 삭제된 그룹(404) */
    onGone: (message: string) => void
    onSaved: (res: LayerGroupUpdateResult) => void
    /** 저장 뒤 [계속 수정] — 저장된 값으로 다시 채움 */
    onContinue: (group: LayerGroupDetail) => void
    /** 결과 카드의 [목록으로] */
    onShowList: () => void
    onDirtyChange: (dirty: boolean) => void
}

interface Draft {
    items: OrderItem[]
    /** 뺀 원래 멤버(되돌리기용) */
    removed: OrderItem[]
}

interface EditError {
    kind: 'changed' | 'notEditable' | 'missing' | 'input' | 'timeout' | 'other'
    message: string
}

interface Saved {
    res: LayerGroupUpdateResult
    parts: string[]
}

const NO_IDS: ReadonlySet<string> = new Set<string>()
const NO_NAMES: string[] = []

function initialDraft(detail: LayerGroupDetail): Draft {
    return {
        items: detail.members.map((m, i) => ({
            id: `o${i}`, type: m.type === 'layerGroup' ? 'layerGroup' : 'layer', name: m.name, style: m.style,
        })),
        removed: [],
    }
}

/** 조건에 맞는 줄을 뺀다 — 원래 멤버는 되돌리기 목록으로, 새로 넣은 것은 그냥 버린다 */
function dropItems(d: Draft, drop: (i: OrderItem) => boolean): Draft {
    const items: OrderItem[] = []
    const removed = d.removed.slice()
    for (const it of d.items) {
        if (!drop(it)) items.push(it)
        else if (!it.isNew) removed.push(it)
    }
    return { items, removed }
}

/** 'ws:layer' 이름들을 맨 아래에 붙인다. 뺐던 원래 멤버면 원래 스타일 그대로 되살리고, 아니면 새로 넣는다 */
function addNames(d: Draft, fulls: string[], workspace: string | null): Draft {
    const items = d.items.slice()
    const removed = d.removed.slice()
    const same = (i: OrderItem, full: string) => i.type === 'layer' && canonicalLayerName(workspace, i.name) === full
    for (const full of fulls) {
        if (items.some(i => same(i, full))) continue
        const ri = removed.findIndex(r => same(r, full))
        if (ri >= 0) {
            items.push(removed[ri])
            removed.splice(ri, 1)
        } else {
            items.push({ id: `n:${full}`, type: 'layer', name: full, isNew: true })
        }
    }
    return { items, removed }
}

function Card({ step, title, aside, children }: { step: number; title: string; aside?: string; children: React.ReactNode }) {
    return (
        <div className="rounded-xl" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
            <div className="flex items-center justify-between gap-2 px-4 py-2.5 text-xs font-medium rounded-t-xl"
                style={{ background: 'var(--bg-hover)', borderBottom: '1px solid var(--border)', color: 'var(--text-secondary)' }}>
                <span className="flex items-center">
                    <span className="inline-flex w-[18px] h-[18px] rounded-full items-center justify-center text-[11px] mr-1.5"
                        style={{ background: 'var(--accent)', color: '#fff' }}>{step}</span>
                    {title}
                </span>
                {aside && <span className="font-normal" style={{ color: 'var(--text-faint)' }}>{aside}</span>}
            </div>
            <div className="p-3 sm:p-4">{children}</div>
        </div>
    )
}

/** 기존 레이어 그룹 수정 화면 — 이름·소속은 읽기 전용, 레이어 넣기·빼기·순서와 제목·설명·방식을 고친다 */
export default function EditPanel({
    detail, connected, server, workspaces, workspacesLoading, layerNames, loadNames, onLost, onCancel, onReload,
    onGone, onSaved, onContinue, onShowList, onDirtyChange,
}: EditPanelProps) {
    const lockedReason = detail.layersLockedReason
    const [draft, setDraft] = useState<Draft>(() => initialDraft(detail))
    const [form, setForm] = useState<GroupEditValue>({
        title: detail.title ?? '', description: detail.description ?? '', mode: detail.mode,
    })
    // 레이어를 고르는 작업공간 — 작업공간 그룹은 그 작업공간으로 고정, 전역 그룹은 바꿀 수 있다
    const [pickWs, setPickWs] = useState(() => {
        if (detail.workspace) return detail.workspace
        const first = detail.members.map(m => splitQualified(m.name)[0]).find(w => w !== '' && workspaces.includes(w))
        return first ?? (workspaces.length === 1 ? workspaces[0] : '')
    })
    const [missingIds, setMissingIds] = useState<ReadonlySet<string>>(NO_IDS)
    const [submitting, setSubmitting] = useState(false)
    const submittingRef = useRef(false)
    const [reloading, setReloading] = useState(false)
    const [error, setError] = useState<EditError | null>(null)
    const [saved, setSaved] = useState<Saved | null>(null)
    const errorRef = useRef<HTMLDivElement>(null)

    // 고르는 작업공간의 레이어 이름 — 다시 연결하면(connected) 만료로 못 받았던 것을 다시 받는다
    useEffect(() => {
        if (connected && pickWs) loadNames(pickWs)
    }, [connected, pickWs, loadNames])

    useEffect(() => {
        if (error) errorRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    }, [error])

    const original = useMemo<EditSnapshot>(() => ({
        title: (detail.title ?? '').trim(),
        description: normalizeNewlines(detail.description ?? '').trim(),
        mode: detail.mode,
        members: toRefs(detail.members),
    }), [detail])

    // 설명은 줄바꿈 표기(\r\n/\n)만 달라도 같은 값으로 본다 — 만지지 않은 칸이 "바뀜"으로 보이지 않게
    const diff = useMemo(() => diffEdit(original, {
        title: form.title.trim(),
        description: normalizeNewlines(form.description).trim(),
        mode: form.mode,
        members: draft.items.map(i => ({ type: i.type, name: i.name })),
    }), [original, form, draft.items])

    const parts = useMemo(() => summaryParts(diff), [diff])

    useEffect(() => {
        onDirtyChange(diff.hasChange && !saved)
    }, [diff.hasChange, saved, onDirtyChange])

    const activeMissing = useMemo<ReadonlySet<string>>(
        () => (missingIds.size === 0 ? NO_IDS : new Set(draft.items.filter(i => missingIds.has(i.id)).map(i => i.id))),
        [draft.items, missingIds],
    )

    const selectedNames = useMemo(() => {
        const s = new Set<string>()
        for (const m of draft.items) {
            if (m.type !== 'layer') continue
            const [ws, n] = splitQualified(canonicalLayerName(detail.workspace, m.name))
            if (ws === pickWs) s.add(n)
        }
        return s
    }, [draft.items, pickWs, detail.workspace])

    const busy = submitting || reloading
    const canSave = !busy && !saved && diff.hasChange && draft.items.length >= 1 && draft.items.length <= MAX_LAYERS &&
        activeMissing.size === 0 && error?.kind !== 'changed'

    // ── 고르기·순서 ──────────────────────────────────────────

    const dropMissingFlag = useCallback((id: string) => {
        setMissingIds(prev => {
            if (!prev.has(id)) return prev
            const next = new Set(prev)
            next.delete(id)
            return next
        })
    }, [])

    const toggleName = useCallback((name: string) => {
        const full = `${pickWs}:${name}`
        const same = (i: OrderItem) => i.type === 'layer' && canonicalLayerName(detail.workspace, i.name) === full
        setDraft(d => {
            if (d.items.some(same)) return dropItems(d, same)
            if (d.items.length >= MAX_LAYERS) return d
            return addNames(d, [full], detail.workspace)
        })
        dropMissingFlag(`n:${full}`)
    }, [pickWs, detail.workspace, dropMissingFlag])

    const setMany = useCallback((names: string[], on: boolean) => {
        const fulls = names.map(n => `${pickWs}:${n}`)
        setDraft(d => {
            if (!on) {
                const drop = new Set(fulls)
                return dropItems(d, i => i.type === 'layer' && drop.has(canonicalLayerName(detail.workspace, i.name)))
            }
            const next = addNames(d, fulls, detail.workspace)
            return next.items.length > MAX_LAYERS ? d : next
        })
    }, [pickWs, detail.workspace])

    const reorder = useCallback((next: OrderItem[]) => setDraft(d => ({ ...d, items: next })), [])

    const move = useCallback((id: string, delta: -1 | 1) => {
        setDraft(d => {
            const i = d.items.findIndex(m => m.id === id)
            const j = i + delta
            if (i < 0 || j < 0 || j >= d.items.length) return d
            const items = d.items.slice()
            ;[items[i], items[j]] = [items[j], items[i]]
            return { ...d, items }
        })
    }, [])

    const remove = useCallback((id: string) => {
        setDraft(d => dropItems(d, i => i.id === id))
        dropMissingFlag(id)
    }, [dropMissingFlag])

    const removeMissing = useCallback(() => {
        setDraft(d => dropItems(d, i => missingIds.has(i.id)))
        setMissingIds(NO_IDS)
    }, [missingIds])

    /** 뺀 레이어를 모두 맨 아래에 되돌린다(원래 스타일 그대로). 100개를 넘지 않는 만큼만 */
    const restoreRemoved = useCallback(() => {
        setDraft(d => {
            const room = Math.max(0, MAX_LAYERS - d.items.length)
            return { items: [...d.items, ...d.removed.slice(0, room)], removed: d.removed.slice(room) }
        })
    }, [])

    const changeForm = useCallback((patch: Partial<GroupEditValue>) => setForm(p => ({ ...p, ...patch })), [])

    // ── 저장·다시 불러오기 ───────────────────────────────────

    /** 422 뒤: 넣은 레이어의 작업공간 목록을 다시 받아 서버에 없는 줄을 표시 */
    const markMissing = async (current: OrderItem[]) => {
        const layers = current.filter(m => m.type === 'layer')
        const qualified = (m: OrderItem) => splitQualified(canonicalLayerName(detail.workspace, m.name))
        const wss = Array.from(new Set(layers.map(m => qualified(m)[0]).filter(w => w !== '')))
        const fresh: Record<string, string[]> = {}
        await Promise.all(wss.map(async ws => {
            const items = await loadNames(ws, true)
            if (items) fresh[ws] = items
        }))
        setMissingIds(new Set(
            layers.filter(m => {
                const [ws, n] = qualified(m)
                return fresh[ws] !== undefined && !fresh[ws].includes(n)
            }).map(m => m.id),
        ))
    }

    const save = async () => {
        if (!canSave || submittingRef.current) return
        if (diff.removed > 0 && !window.confirm(
            `'${detail.wmsName}'에서 레이어 ${diff.removed}개를 빼고 저장합니다.\n대상: ${server}`,
        )) return
        submittingRef.current = true
        setSubmitting(true)
        setError(null)
        const sent = draft.items
        const req: LayerGroupUpdateRequest = {
            revision: detail.revision,
            title: diff.titleChanged ? form.title.trim() || null : detail.title,
            description: diff.descriptionChanged ? form.description.trim() || null : detail.description,
            mode: form.mode,
            members: sent.map(i => ({ type: i.type, name: i.name })),
        }
        try {
            const res = await gsFetch<LayerGroupUpdateResult>(groupApiPath(detail.workspace, detail.name), {
                method: 'PUT',
                body: JSON.stringify(req),
            })
            setSaved({ res, parts })
            onSaved(res)
        } catch (e) {
            if (onLost(e, '레이어 그룹을 수정하')) return
            if (e instanceof GeoServerApiError && e.status === 404) {
                onGone(`'${detail.wmsName}' 레이어 그룹이 이미 삭제되었습니다. 목록을 새로 불러옵니다.`)
            } else if (e instanceof GeoServerApiError && e.status === 409) {
                setError({ kind: 'changed', message: e.message })
            } else if (e instanceof GeoServerApiError && e.status === 422) {
                setError({ kind: 'missing', message: e.message })
                await markMissing(sent)
            } else if (e instanceof GeoServerApiError && e.status === 400 && e.message.startsWith(NOT_EDITABLE_PREFIX)) {
                setError({ kind: 'notEditable', message: e.message })
            } else if (e instanceof GeoServerApiError && e.status === 400) {
                setError({ kind: 'input', message: e.message })
            } else if (e instanceof GeoServerApiError && e.status === 424 && e.message.includes('시간이 초과')) {
                setError({
                    kind: 'timeout',
                    message: 'GeoServer 응답이 늦어 저장 결과를 모릅니다. [다시 불러오기]로 현재 내용을 확인하세요.',
                })
            } else {
                setError({ kind: 'other', message: e instanceof Error ? e.message : '레이어 그룹을 수정하지 못했습니다.' })
            }
        } finally {
            submittingRef.current = false
            setSubmitting(false)
        }
    }

    const reload = async () => {
        if (busy) return
        if (!window.confirm('지금 편집한 내용은 버리고 GeoServer의 현재 내용으로 다시 채웁니다. 계속할까요?')) return
        setReloading(true)
        try {
            await onReload()
        } catch (e) {
            if (onLost(e, '레이어 그룹을 다시 불러오')) return
            if (e instanceof GeoServerApiError && e.status === 404) {
                onGone(`'${detail.wmsName}' 레이어 그룹이 이미 삭제되었습니다. 목록을 새로 불러옵니다.`)
                return
            }
            setError({ kind: 'other', message: e instanceof Error ? e.message : '레이어 그룹을 다시 불러오지 못했습니다.' })
        } finally {
            setReloading(false)
        }
    }

    /** [계속 수정] — 다시 읽은 값이면 그 값으로, 못 읽었으면 GeoServer에서 다시 불러와 채운다 */
    const continueEdit = (res: LayerGroupUpdateResult) => {
        if (res.group.verified) {
            onContinue(res.group)
            return
        }
        onReload().catch(e => {
            if (onLost(e, '레이어 그룹을 다시 불러오')) return
            setSaved(null)
            setError({ kind: 'other', message: e instanceof Error ? e.message : '레이어 그룹을 다시 불러오지 못했습니다.' })
        })
    }

    // 저장 결과
    if (saved) {
        return (
            <UpdateSaved res={saved.res} parts={saved.parts} previousCrs={detail.bounds?.crs ?? null}
                onShowList={onShowList} onContinue={() => continueEdit(saved.res)} />
        )
    }

    const reloadButton = (
        <button type="button" onClick={reload} disabled={busy}
            className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-lg cursor-pointer disabled:opacity-50"
            style={{ background: 'var(--accent)', color: '#fff' }}>
            <RefreshCw size={12} className={reloading ? 'animate-spin' : ''} />
            다시 불러오기
        </button>
    )

    const pickState = pickWs ? layerNames[pickWs] : undefined

    return (
        <div className="space-y-3 sm:space-y-4">
            <div ref={errorRef}>
                {error && (
                    <Alert tone="err" title={error.message}
                        action={error.kind === 'changed' || error.kind === 'notEditable' || error.kind === 'timeout' ? reloadButton : undefined}>
                        {error.kind === 'changed' && (
                            <>편집을 시작한 뒤 누군가(또는 GeoServer 관리 화면에서) 이 그룹을 고쳤습니다. 덮어쓰지 않았습니다. 다시 불러오면 지금 편집한 내용은 사라집니다.</>
                        )}
                        {error.kind === 'notEditable' && (
                            <>지금 상태로는 이 도구로 저장할 수 없습니다. 다시 불러와 최신 상태를 확인하거나 GeoServer 관리 화면에서 수정하세요.</>
                        )}
                        {error.kind === 'missing' && (
                            <>레이어 목록을 다시 불러왔습니다. 순서 목록에서 빨간 줄을 빼고 다시 저장하세요.</>
                        )}
                        {error.kind === 'input' && <>입력한 내용을 확인하세요.</>}
                        {error.kind === 'timeout' && (
                            <>실제로는 저장되었을 수 있습니다. 다시 불러온 뒤 필요하면 다시 수정하세요(그사이 내용이 바뀌었으면 충돌로 알려 주므로 이중으로 반영되지 않습니다).</>
                        )}
                    </Alert>
                )}
            </div>

            {/* 저장하는 중에는 편집 영역 전체를 잠근다(두 번 누르기 방지) */}
            <div className="space-y-3 sm:space-y-4" inert={busy} style={busy ? { opacity: 0.55 } : undefined}>
                <Card step={1} title="레이어 넣기·빼기·순서" aside={`최대 ${MAX_LAYERS}개`}>
                    <div className="text-xs mb-2.5" style={{ color: 'var(--text-muted)' }}>
                        {detail.workspace
                            ? <>작업공간 소속 그룹이라 {detail.workspace} 레이어만 넣을 수 있습니다.</>
                            : <>전역 그룹: 작업공간을 바꿔도 고른 레이어는 유지됩니다.</>}
                    </div>
                    <div className="grid gap-3 sm:gap-4 grid-cols-1 lg:grid-cols-2 items-start">
                        <LayerPicker workspaces={workspaces} workspace={pickWs} onWorkspaceChange={setPickWs}
                            workspaceLocked={detail.workspace !== null} workspacesLoading={workspacesLoading}
                            names={pickState?.items ?? NO_NAMES} loading={pickState?.status === 'loading'}
                            error={pickState?.status === 'error' ? pickState.message : null}
                            onRefresh={() => { if (pickWs) loadNames(pickWs, true) }}
                            selectedNames={selectedNames} totalSelected={draft.items.length}
                            onToggle={toggleName} onSetMany={setMany}
                            disabledReason={lockedReason ? `${lockedReason} 레이어 구성은 바꿀 수 없습니다(제목·설명·방식만).` : null} />
                        <OrderList items={draft.items} missingIds={activeMissing} otherWorkspaceIds={NO_IDS}
                            onReorder={reorder} onMove={move} onRemove={remove} onRemoveMissing={removeMissing}
                            removedNames={draft.removed.map(r => r.name)} onRestoreRemoved={restoreRemoved}
                            disabled={!!lockedReason} />
                    </div>
                </Card>

                <Card step={2} title="그룹 정보">
                    <GroupEditForm name={detail.name} workspace={detail.workspace} originalMode={detail.mode}
                        value={form} onChange={changeForm} />
                </Card>
            </div>

            <div className="flex flex-wrap items-center gap-2 rounded-[10px] px-3.5 py-2.5 text-xs"
                style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}>
                <b className="font-medium">바뀐 것</b>
                {parts.map(p => (
                    <span key={p} className="inline-flex items-center text-[11px] px-2 py-px rounded-full font-medium whitespace-nowrap"
                        style={diff.hasChange && p.startsWith('추가')
                            ? { background: 'var(--accent-bg)', color: 'var(--accent)', border: '1px solid var(--accent-border)' }
                            : { background: 'var(--bg-hover)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}>
                        {p}
                    </span>
                ))}
                {diff.layersChanged && (
                    <span style={{ color: 'var(--text-faint)' }}>· 구성이 바뀌어 저장할 때 영역을 다시 계산합니다</span>
                )}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2.5 pt-1">
                <span className="text-xs min-w-0 break-all" style={{ color: 'var(--text-faint)' }}>
                    대상: <span className="font-mono">{server}</span>
                </span>
                <span className="flex items-center gap-2 w-full sm:w-auto">
                    <button type="button" onClick={onCancel} disabled={busy}
                        className="flex-1 sm:flex-none px-4 py-2.5 text-sm rounded-lg cursor-pointer disabled:opacity-50"
                        style={{ border: '1px solid var(--border)', background: 'var(--bg-page)', color: 'var(--text-secondary)' }}>
                        취소
                    </button>
                    <button type="button" onClick={save} disabled={!canSave}
                        className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-5 py-2.5 text-sm font-medium rounded-lg cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                        style={{ background: 'var(--accent)', color: '#fff' }}>
                        {submitting
                            ? <><span className="w-3.5 h-3.5 border-2 rounded-full animate-spin" style={{ borderColor: '#fff', borderTopColor: 'transparent' }} />저장하는 중…</>
                            : <><Check size={14} />변경 저장</>}
                    </button>
                </span>
            </div>
        </div>
    )
}
