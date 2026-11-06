'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Layers, Pencil, Plus, Plug, Unplug, X } from 'lucide-react'
import Sidebar from '@/components/layout/Sidebar'
import Header from '@/components/layout/Header'
import ConnectionBadge from '../_shared/ConnectionBadge'
import NotConnectedNotice from '../_shared/NotConnectedNotice'
import ReconnectDialog from '../_shared/ReconnectDialog'
import { GeoServerApiError, GeoServerConnectionLostError, gsFetch, serverLabel } from '../_shared/connection'
import { useGeoServerConnection } from '../_shared/useGeoServerConnection'
import Alert from './Alert'
import EditPanel from './EditPanel'
import GroupForm, { type GroupFormValue } from './GroupForm'
import GroupList, { type DetailState, type ScopeGroups } from './GroupList'
import LayerPicker from './LayerPicker'
import OrderList, { type OrderItem } from './OrderList'
import SaveResult from './SaveResult'
import {
    MAX_LAYERS, NAME_PATTERN, NAME_RULE_MESSAGE, frontBlockedReason, groupApiPath, groupKey, scopeKey, splitQualified, wmsName,
    type LayerGroupCreateRequest, type LayerGroupDetail, type LayerGroupSummary, type LayerGroupUpdateResult, type NamesState,
} from './types'

type View = 'create' | 'list' | 'edit'

/** 수정 중인 그룹 — detail은 편집을 시작할 때 읽은 원본(revision 포함), nonce가 바뀌면 편집기가 새로 채워진다 */
interface EditSession {
    detail: LayerGroupDetail
    nonce: number
}

interface FormError {
    kind: 'exists' | 'missing' | 'input' | 'other'
    message: string
}

const enc = encodeURIComponent
const NO_NAMES: string[] = []
const NO_IDS: ReadonlySet<string> = new Set<string>()

const INITIAL_FORM: GroupFormValue = { name: '', title: '', description: '', scope: 'workspace', mode: 'SINGLE' }

/** 레이어 그룹 만들기·목록·수정·삭제 */
export default function GeoServerLayerGroupsPage() {
    // 연결 — 번호표가 없으면 이 화면은 GeoServer API를 부르지 않는다
    const conn = useGeoServerConnection()
    const connected = conn.state === 'connected'
    const [lostAction, setLostAction] = useState<string | null>(null)
    const [showReconnect, setShowReconnect] = useState(false)

    const [view, setView] = useState<View>('create')
    const [workspaces, setWorkspaces] = useState<string[]>([])
    const [workspacesLoading, setWorkspacesLoading] = useState(false)
    const [wsError, setWsError] = useState<string | null>(null)
    /** 레이어를 고르는 작업공간(소속이 '작업공간'이면 그룹의 작업공간도 이것) */
    const [workspace, setWorkspace] = useState('')
    /** 그룹 목록 탭에서 전역과 함께 보여 줄 작업공간 */
    const [listWorkspace, setListWorkspace] = useState('')
    const listTouched = useRef(false)

    const [layerNames, setLayerNames] = useState<Record<string, NamesState>>({})
    const [groups, setGroups] = useState<Record<string, ScopeGroups>>({})
    const [details, setDetails] = useState<Record<string, DetailState>>({})
    const [expandedKey, setExpandedKey] = useState<string | null>(null)
    const [deletingKey, setDeletingKey] = useState<string | null>(null)
    const [listNotice, setListNotice] = useState<{ tone: 'err' | 'info' | 'warn'; message: string } | null>(null)
    // 수정 모드 — 편집 내용은 EditPanel이 들고 있고, 탭을 옮겨 다녀도 마운트된 채 숨겨 둔다
    const [editing, setEditing] = useState<EditSession | null>(null)
    const [editLoadingKey, setEditLoadingKey] = useState<string | null>(null)
    const editDirty = useRef(false)

    // 이미 요청했거나 요청 중인 목록 — 같은 요청을 두 번 보내지 않는다. 실패(만료 포함)하면 지워 다시 연결 뒤 다시 받는다
    const requested = useRef(new Set<string>())

    // 만들기 입력(보기를 바꿔도 그대로)
    const [form, setForm] = useState<GroupFormValue>(INITIAL_FORM)
    /** 순서 목록 = API 순서(0 = 맨 위 줄 = 먼저 그림). 뒤집지 않는다 */
    const [members, setMembers] = useState<OrderItem[]>([])
    const [missingIds, setMissingIds] = useState<ReadonlySet<string>>(NO_IDS)
    const [submitting, setSubmitting] = useState(false)
    const submittingRef = useRef(false)
    const [result, setResult] = useState<LayerGroupDetail | null>(null)
    const [formError, setFormError] = useState<FormError | null>(null)

    /** 428이면 화면은 그대로 두고 띠만 띄운다. 처리했으면 true */
    const handleLost = useCallback((e: unknown, action: string): boolean => {
        if (!(e instanceof GeoServerConnectionLostError)) return false
        setLostAction(action)
        conn.markLost(e.message)
        return true
    }, [conn.markLost])

    // ── 불러오기 ─────────────────────────────────────────────

    const loadWorkspaces = useCallback(() => {
        setWorkspacesLoading(true)
        setWsError(null)
        gsFetch<{ workspaces: string[] }>('/api/geoserver/workspaces')
            .then(d => {
                setWorkspaces(d.workspaces)
                if (d.workspaces.length === 1) {
                    setWorkspace(prev => prev || d.workspaces[0])
                    setListWorkspace(prev => prev || d.workspaces[0])
                }
            })
            .catch(e => {
                if (handleLost(e, '작업공간을 불러오')) return
                setWsError(e instanceof Error ? e.message : 'GeoServer 작업공간을 불러오지 못했습니다.')
            })
            .finally(() => setWorkspacesLoading(false))
    }, [handleLost])

    /** 작업공간의 발행된 레이어 이름(G1, 요청 1번). force면 캐시를 버리고 다시 */
    const loadNames = useCallback((ws: string, force = false): Promise<string[] | null> => {
        const k = `n:${ws}`
        if (!force && requested.current.has(k)) return Promise.resolve(null)
        requested.current.add(k)
        setLayerNames(p => ({ ...p, [ws]: { status: 'loading', items: p[ws]?.items ?? NO_NAMES, message: null } }))
        return gsFetch<string[]>(`/api/geoserver/workspaces/${enc(ws)}/layer-names`)
            .then(items => {
                setLayerNames(p => ({ ...p, [ws]: { status: 'ok', items, message: null } }))
                return items
            })
            .catch(e => {
                requested.current.delete(k)
                if (handleLost(e, '레이어 목록을 불러오')) return null
                setLayerNames(p => ({
                    ...p,
                    [ws]: { status: 'error', items: NO_NAMES, message: e instanceof Error ? e.message : '레이어 목록을 불러오지 못했습니다.' },
                }))
                return null
            })
    }, [handleLost])

    /** 한 범위의 그룹 이름 목록(G2 전역 / G3 작업공간) */
    const loadGroups = useCallback((ws: string | null, force = false) => {
        const k = `g:${scopeKey(ws)}`
        if (!force && requested.current.has(k)) return
        requested.current.add(k)
        setGroups(p => ({ ...p, [scopeKey(ws)]: { status: 'loading', items: p[scopeKey(ws)]?.items ?? [], message: null } }))
        const path = ws ? `/api/geoserver/workspaces/${enc(ws)}/layergroups` : '/api/geoserver/layergroups'
        gsFetch<LayerGroupSummary[]>(path)
            .then(items => setGroups(p => ({ ...p, [scopeKey(ws)]: { status: 'ok', items, message: null } })))
            .catch(e => {
                requested.current.delete(k)
                if (handleLost(e, '레이어 그룹 목록을 불러오')) return
                setGroups(p => ({
                    ...p,
                    [scopeKey(ws)]: {
                        status: 'error', items: [],
                        message: e instanceof Error ? e.message : '레이어 그룹 목록을 불러오지 못했습니다.',
                    },
                }))
            })
    }, [handleLost])

    // 연결 확인이 끝나 연결됨이 된 뒤에만 불러온다(번호표 없으면 GeoServer 요청 0)
    useEffect(() => {
        if (conn.state !== 'connected') return
        setLostAction(null)
        if (workspaces.length === 0) loadWorkspaces()
    }, [conn.state])

    // 작업공간을 고르거나 목록 탭을 열면 필요한 것만 받는다. 다시 연결하면 만료로 못 받았던 것만 다시 받는다
    useEffect(() => {
        if (!connected) return
        if (workspace) {
            loadNames(workspace)
            loadGroups(workspace)
        }
        if (workspace || view === 'list') loadGroups(null)
        if (view === 'list' && listWorkspace) loadGroups(listWorkspace)
    }, [connected, workspace, listWorkspace, view, loadNames, loadGroups])

    // ── 만들기 입력 ──────────────────────────────────────────

    const groupWorkspace = form.scope === 'workspace' ? workspace : null

    const selectedNames = useMemo(() => {
        const s = new Set<string>()
        for (const m of members) {
            const [ws, n] = splitQualified(m.name)
            if (ws === workspace) s.add(n)
        }
        return s
    }, [members, workspace])

    /** 소속이 '작업공간'인데 다른 작업공간의 레이어인 줄 */
    const otherWorkspaceIds = useMemo<ReadonlySet<string>>(() => {
        if (form.scope !== 'workspace') return NO_IDS
        return new Set(members.filter(m => splitQualified(m.name)[0] !== workspace).map(m => m.id))
    }, [members, form.scope, workspace])

    const activeMissing = useMemo<ReadonlySet<string>>(
        () => (missingIds.size === 0 ? NO_IDS : new Set(members.filter(m => missingIds.has(m.id)).map(m => m.id))),
        [members, missingIds],
    )

    const nameProblem = useMemo(() => {
        if (!form.name) return null
        if (!NAME_PATTERN.test(form.name)) return NAME_RULE_MESSAGE
        const list = groups[scopeKey(groupWorkspace)]
        if (list?.status === 'ok' && list.items.some(g => g.name === form.name)) {
            return `이미 있는 이름입니다(${wmsName(groupWorkspace, form.name)}).`
        }
        return null
    }, [form.name, groups, groupWorkspace])

    const nameWarning = useMemo(() => {
        if (!form.name || nameProblem || !groupWorkspace) return null
        if (layerNames[groupWorkspace]?.items.includes(form.name)) {
            return '같은 이름의 레이어가 있어 WMS에서 헷갈릴 수 있습니다.'
        }
        return null
    }, [form.name, nameProblem, groupWorkspace, layerNames])

    const canSubmit = connected && !submitting && form.name !== '' && !nameProblem &&
        members.length >= 1 && members.length <= MAX_LAYERS &&
        activeMissing.size === 0 && otherWorkspaceIds.size === 0 &&
        (form.scope === 'global' || workspace !== '')

    const changeWorkspace = (ws: string) => {
        if (ws === workspace) return
        if (form.scope === 'workspace' && members.length > 0) {
            const ok = window.confirm(
                `작업공간을 바꾸면 그룹 소속이 달라져 지금 고른 레이어 ${members.length}개가 모두 사라집니다. 계속할까요?`,
            )
            if (!ok) return
            setMembers([])
            setMissingIds(NO_IDS)
        }
        setWorkspace(ws)
        if (!listTouched.current) setListWorkspace(ws)
    }

    const changeListWorkspace = (ws: string) => {
        listTouched.current = true
        setListWorkspace(ws)
    }

    const handleFormChange = useCallback((patch: Partial<GroupFormValue>) => {
        setForm(p => ({ ...p, ...patch }))
        // 이름을 고치면 서버의 이름 중복 표시는 지운다
        if ('name' in patch) setFormError(p => (p?.kind === 'exists' ? null : p))
    }, [])

    const toggleName = useCallback((name: string) => {
        const id = `${workspace}:${name}`
        setMembers(prev => {
            if (prev.some(m => m.id === id)) return prev.filter(m => m.id !== id)
            if (prev.length >= MAX_LAYERS) return prev
            // 새로 고른 레이어는 맨 아래(= 가장 나중에 그림 = 지도에서 맨 위)에 붙는다
            return [...prev, { id, type: 'layer', name: id }]
        })
        setMissingIds(prev => {
            if (!prev.has(id)) return prev
            const next = new Set(prev)
            next.delete(id)
            return next
        })
    }, [workspace])

    const setMany = useCallback((names: string[], on: boolean) => {
        const ids = names.map(n => `${workspace}:${n}`)
        setMembers(prev => {
            if (!on) {
                const drop = new Set(ids)
                return prev.filter(m => !drop.has(m.id))
            }
            const have = new Set(prev.map(m => m.id))
            const add = ids.filter(id => !have.has(id))
            if (prev.length + add.length > MAX_LAYERS) return prev
            return [...prev, ...add.map(id => ({ id, type: 'layer' as const, name: id }))]
        })
    }, [workspace])

    const reorder = useCallback((next: OrderItem[]) => setMembers(next), [])

    const move = useCallback((id: string, delta: -1 | 1) => {
        setMembers(prev => {
            const i = prev.findIndex(m => m.id === id)
            const j = i + delta
            if (i < 0 || j < 0 || j >= prev.length) return prev
            const next = prev.slice()
            ;[next[i], next[j]] = [next[j], next[i]]
            return next
        })
    }, [])

    const remove = useCallback((id: string) => {
        setMembers(prev => prev.filter(m => m.id !== id))
        setMissingIds(prev => {
            if (!prev.has(id)) return prev
            const next = new Set(prev)
            next.delete(id)
            return next
        })
    }, [])

    const removeMissing = useCallback(() => {
        setMembers(prev => prev.filter(m => !missingIds.has(m.id)))
        setMissingIds(NO_IDS)
    }, [missingIds])

    const removeOtherWorkspace = () => {
        setMembers(prev => prev.filter(m => splitQualified(m.name)[0] === workspace))
    }

    const clearAll = () => {
        setForm(INITIAL_FORM)
        setMembers([])
        setMissingIds(NO_IDS)
        setResult(null)
        setFormError(null)
    }

    /** 422 뒤: 고른 레이어의 작업공간 목록을 다시 받아 서버에 없는 줄을 표시 */
    const markMissing = async (current: OrderItem[]) => {
        const wss = Array.from(new Set(current.map(m => splitQualified(m.name)[0]).filter(w => w !== '')))
        const fresh: Record<string, string[]> = {}
        await Promise.all(wss.map(async ws => {
            const items = await loadNames(ws, true)
            if (items) fresh[ws] = items
        }))
        setMissingIds(new Set(
            current.filter(m => {
                const [ws, n] = splitQualified(m.name)
                return fresh[ws] !== undefined && !fresh[ws].includes(n)
            }).map(m => m.id),
        ))
    }

    const submit = async () => {
        if (!canSubmit || submittingRef.current) return
        submittingRef.current = true
        setSubmitting(true)
        setFormError(null)
        setResult(null)
        const sent = members
        const req: LayerGroupCreateRequest = {
            workspace: groupWorkspace,
            name: form.name,
            title: form.title.trim() || null,
            description: form.description.trim() || null,
            mode: form.mode,
            layers: sent.map(m => m.name),
        }
        try {
            const detail = await gsFetch<LayerGroupDetail>('/api/geoserver/layergroups', {
                method: 'POST',
                body: JSON.stringify(req),
            })
            setResult(detail)
            // 성공 — 이름 칸만 비운다(고른 레이어·순서는 남겨 같은 구성으로 하나 더 만들 수 있게)
            setForm(p => ({ ...p, name: '' }))
            loadGroups(groupWorkspace, true)
        } catch (e) {
            if (handleLost(e, '레이어 그룹을 만들')) return
            if (e instanceof GeoServerApiError && e.status === 409) {
                setFormError({ kind: 'exists', message: e.message })
                loadGroups(groupWorkspace, true)
            } else if (e instanceof GeoServerApiError && e.status === 422) {
                setFormError({ kind: 'missing', message: e.message })
                await markMissing(sent)
            } else if (e instanceof GeoServerApiError && e.status === 400) {
                setFormError({ kind: 'input', message: e.message })
            } else if (e instanceof GeoServerApiError && e.status === 424 && e.message.includes('시간이 초과')) {
                // 시간 초과 — 실제로는 만들어졌을 수 있다
                setFormError({
                    kind: 'other',
                    message: 'GeoServer 응답이 늦어 결과를 모릅니다. 그룹 목록에서 만들어졌는지 확인하세요.',
                })
                loadGroups(groupWorkspace, true)
            } else {
                setFormError({ kind: 'other', message: e instanceof Error ? e.message : '레이어 그룹을 만들지 못했습니다.' })
            }
        } finally {
            submittingRef.current = false
            setSubmitting(false)
        }
    }

    // ── 그룹 목록 ────────────────────────────────────────────

    const detailRequested = useRef(new Set<string>())

    const toggleExpand = useCallback((g: LayerGroupSummary) => {
        const k = groupKey(g.workspace, g.name)
        if (expandedKey === k) {
            setExpandedKey(null)
            return
        }
        setExpandedKey(k)
        if (detailRequested.current.has(k)) return
        detailRequested.current.add(k)
        setDetails(p => ({ ...p, [k]: { status: 'loading' } }))
        const path = g.workspace
            ? `/api/geoserver/workspaces/${enc(g.workspace)}/layergroups/${enc(g.name)}`
            : `/api/geoserver/layergroups/${enc(g.name)}`
        gsFetch<LayerGroupDetail>(path)
            .then(detail => setDetails(p => ({ ...p, [k]: { status: 'ok', detail } })))
            .catch(e => {
                detailRequested.current.delete(k)
                if (handleLost(e, '레이어 그룹 상세를 불러오')) {
                    setDetails(p => ({ ...p, [k]: { status: 'error', message: '연결이 만료되어 상세를 불러오지 못했습니다. 접었다가 다시 여세요.' } }))
                    return
                }
                if (e instanceof GeoServerApiError && e.status === 404) {
                    setDetails(p => ({ ...p, [k]: { status: 'error', message: '이미 삭제되었습니다. 목록을 새로 불러옵니다.' } }))
                    loadGroups(g.workspace, true)
                    return
                }
                setDetails(p => ({ ...p, [k]: { status: 'error', message: e instanceof Error ? e.message : '상세를 불러오지 못했습니다.' } }))
            })
    }, [expandedKey, handleLost, loadGroups])

    const refreshList = useCallback(() => {
        detailRequested.current.clear()
        setDetails({})
        setExpandedKey(null)
        setListNotice(null)
        loadGroups(null, true)
        if (listWorkspace) loadGroups(listWorkspace, true)
    }, [listWorkspace, loadGroups])

    const deleteGroup = useCallback(async (g: LayerGroupSummary) => {
        if (deletingKey) return
        const label = wmsName(g.workspace, g.name)
        const server = conn.info ? serverLabel(conn.info.url) : 'GeoServer'
        if (!window.confirm(`'${label}' 레이어 그룹을 ${server} 서버에서 삭제하시겠습니까?\n그룹 안의 레이어는 지워지지 않습니다.`)) return
        const k = groupKey(g.workspace, g.name)
        setDeletingKey(k)
        setListNotice(null)
        const path = g.workspace
            ? `/api/geoserver/workspaces/${enc(g.workspace)}/layergroups/${enc(g.name)}`
            : `/api/geoserver/layergroups/${enc(g.name)}`
        const done = (message: string) => {
            detailRequested.current.delete(k)
            setDetails(p => {
                const next = { ...p }
                delete next[k]
                return next
            })
            setExpandedKey(p => (p === k ? null : p))
            // 지운 그룹을 수정 중이었다면 편집기를 닫는다
            setEditing(p => (p && groupKey(p.detail.workspace, p.detail.name) === k ? null : p))
            setListNotice({ tone: 'info', message })
            loadGroups(g.workspace, true)
        }
        try {
            await gsFetch<null>(path, { method: 'DELETE' })
            done(`'${label}' 레이어 그룹을 삭제했습니다.`)
        } catch (e) {
            if (handleLost(e, '레이어 그룹을 삭제하')) return
            // 이미 없으면 목적을 이룬 것 — 성공처럼 처리
            if (e instanceof GeoServerApiError && e.status === 404) done(`'${label}' 레이어 그룹은 이미 삭제되어 있었습니다.`)
            else setListNotice({ tone: 'err', message: e instanceof Error ? e.message : '레이어 그룹을 삭제하지 못했습니다.' })
        } finally {
            setDeletingKey(null)
        }
    }, [conn.info, deletingKey, handleLost, loadGroups])

    // ── 수정 ────────────────────────────────────────────────

    /** 상세 캐시에서 한 그룹을 지운다(다음에 펼치면 다시 읽음) */
    const invalidateDetail = useCallback((k: string) => {
        detailRequested.current.delete(k)
        setDetails(p => {
            const next = { ...p }
            delete next[k]
            return next
        })
        setExpandedKey(p => (p === k ? null : p))
    }, [])

    const closeEdit = useCallback(() => {
        editDirty.current = false
        setEditing(null)
        setView('list')
    }, [])

    const cancelEdit = useCallback(() => {
        if (editDirty.current && !window.confirm('편집한 내용을 버리고 목록으로 돌아갈까요?')) return
        closeEdit()
    }, [closeEdit])

    const handleDirty = useCallback((dirty: boolean) => { editDirty.current = dirty }, [])

    /** 이미 삭제된 그룹(404) — 목록을 새로 받고 목록 탭으로 */
    const handleGone = useCallback((message: string) => {
        if (editing) {
            invalidateDetail(groupKey(editing.detail.workspace, editing.detail.name))
            loadGroups(editing.detail.workspace, true)
        }
        closeEdit()
        setListNotice({ tone: 'err', message })
    }, [editing, invalidateDetail, loadGroups, closeEdit])

    /** [수정] — 상세를 새로 한 번 읽어(최신 revision) 수정 화면으로. 수정 불가 그룹이면 이유만 알린다 */
    const startEdit = useCallback(async (g: LayerGroupSummary) => {
        if (editLoadingKey) return
        const k = groupKey(g.workspace, g.name)
        const label = wmsName(g.workspace, g.name)
        if (editing && groupKey(editing.detail.workspace, editing.detail.name) === k) {
            setView('edit')
            return
        }
        if (editing && editDirty.current && !window.confirm(
            `'${editing.detail.wmsName}'을(를) 편집한 내용이 있습니다. 버리고 '${label}'을(를) 수정할까요?`,
        )) return
        setEditLoadingKey(k)
        setListNotice(null)
        try {
            const detail = await gsFetch<LayerGroupDetail>(groupApiPath(g.workspace, g.name))
            detailRequested.current.add(k)
            setDetails(p => ({ ...p, [k]: { status: 'ok', detail } }))
            const blockedReason = detail.editBlockedReason ?? frontBlockedReason(detail)
            if (blockedReason) {
                setExpandedKey(k)
                setListNotice({ tone: 'warn', message: `'${label}': ${blockedReason}` })
                return
            }
            editDirty.current = false
            setEditing(prev => ({ detail, nonce: (prev?.nonce ?? 0) + 1 }))
            setView('edit')
        } catch (e) {
            if (handleLost(e, '레이어 그룹을 불러오')) return
            if (e instanceof GeoServerApiError && e.status === 404) {
                invalidateDetail(k)
                loadGroups(g.workspace, true)
                setListNotice({ tone: 'err', message: `'${label}' 레이어 그룹이 이미 삭제되었습니다. 목록을 새로 불러옵니다.` })
            } else {
                setListNotice({ tone: 'err', message: e instanceof Error ? e.message : '레이어 그룹을 불러오지 못했습니다.' })
            }
        } finally {
            setEditLoadingKey(null)
        }
    }, [editing, editLoadingKey, handleLost, invalidateDetail, loadGroups])

    /** [다시 불러오기] — 현재 GeoServer 내용으로 편집기를 새로 채운다(실패는 EditPanel이 처리하도록 던진다) */
    const reloadEdit = useCallback(async () => {
        if (!editing) return
        const { workspace: ws, name, wmsName: label } = editing.detail
        const detail = await gsFetch<LayerGroupDetail>(groupApiPath(ws, name))
        const k = groupKey(ws, name)
        detailRequested.current.add(k)
        setDetails(p => ({ ...p, [k]: { status: 'ok', detail } }))
        const blockedReason = detail.editBlockedReason ?? frontBlockedReason(detail)
        if (blockedReason) {
            closeEdit()
            setListNotice({ tone: 'warn', message: `'${label}': ${blockedReason}` })
            return
        }
        editDirty.current = false
        setEditing(prev => ({ detail, nonce: (prev?.nonce ?? 0) + 1 }))
    }, [editing, closeEdit])

    /** 저장 성공 — 목록의 상세 캐시를 최신으로(못 읽었으면 지워 다음에 다시 읽게) */
    const handleSaved = useCallback((res: LayerGroupUpdateResult) => {
        const k = groupKey(res.group.workspace, res.group.name)
        if (res.group.verified) {
            detailRequested.current.add(k)
            setDetails(p => ({ ...p, [k]: { status: 'ok', detail: res.group } }))
        } else {
            invalidateDetail(k)
        }
    }, [invalidateDetail])

    const continueEdit = useCallback((group: LayerGroupDetail) => {
        editDirty.current = false
        setEditing(prev => ({ detail: group, nonce: (prev?.nonce ?? 0) + 1 }))
    }, [])

    // ── 화면 ────────────────────────────────────────────────

    const nameState = workspace ? layerNames[workspace] : undefined
    const globalGroups = groups[scopeKey(null)]
    const workspaceGroups = listWorkspace ? groups[scopeKey(listWorkspace)] : undefined
    const listCount =
        globalGroups?.status === 'ok' && (!listWorkspace || workspaceGroups?.status === 'ok')
            ? globalGroups.items.length + (workspaceGroups?.items.length ?? 0)
            : null

    const tabClass = (on: boolean) =>
        `inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap px-3.5 py-2 text-[13px] cursor-pointer -mb-px ${on ? 'font-medium' : ''}`
    const tabStyle = (on: boolean): React.CSSProperties => ({
        color: on ? 'var(--accent)' : 'var(--text-muted)',
        borderBottom: `2px solid ${on ? 'var(--accent)' : 'transparent'}`,
        background: 'transparent',
    })

    return (
        <div className="flex min-h-screen" style={{ background: 'var(--bg-page)' }}>
            <Sidebar />
            <div className="flex-1 flex flex-col min-w-0">
                <Header title="레이어 그룹" breadcrumb={['GeoServer', '레이어 그룹']} />

                <main className="flex-1 p-3.5 sm:p-6 space-y-3 sm:space-y-4 min-w-0">
                    <div className="flex flex-wrap items-center justify-between gap-2.5 min-w-0">
                        <p className="text-sm m-0 max-w-[640px]" style={{ color: 'var(--text-muted)' }}>
                            발행된 레이어 여러 개를 골라 GeoServer 레이어 그룹(WMS에서 이름 하나로 한 장처럼 부르는 묶음)을 만듭니다.{' '}
                            <span style={{ color: 'var(--text-faint)' }}>지도 &gt; 레이어 관리의 그룹과는 별개입니다.</span>
                        </p>
                        <ConnectionBadge state={conn.state} info={conn.info} />
                    </div>

                    {conn.state === 'checking' && (
                        <div className="flex items-center justify-center py-16">
                            <div className="w-6 h-6 border-2 border-t-transparent rounded-full animate-spin"
                                style={{ borderColor: 'var(--accent)', borderTopColor: 'transparent' }} />
                        </div>
                    )}

                    {conn.state === 'none' && <NotConnectedNotice kind="none" what="레이어 그룹 만들기" />}

                    {conn.state === 'expired' && !lostAction && (
                        <NotConnectedNotice kind="expired" what="레이어 그룹 만들기" info={conn.info}
                            onReconnect={() => setShowReconnect(true)} />
                    )}

                    {(connected || (conn.state === 'expired' && lostAction)) && (
                        <>
                            {/* 작업 중 만료 — 화면은 그대로 두고 띠만 */}
                            {conn.state === 'expired' && lostAction && (
                                <div className="flex flex-wrap items-center justify-between gap-2.5 px-4 py-3 rounded-lg text-sm"
                                    style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', color: 'var(--text-primary)' }}>
                                    <span className="flex items-center gap-2 min-w-0 flex-1" style={{ minWidth: '200px' }}>
                                        <Unplug size={18} className="shrink-0" style={{ color: '#ef4444' }} />
                                        <span>
                                            <b className="block">GeoServer 연결이 만료되어 {lostAction}지 못했습니다</b>
                                            <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                                                고른 레이어·순서·입력은 그대로 있습니다. 다시 연결하기 전까지 아래 조작은 잠깁니다.
                                                다시 연결한 뒤 같은 단추를 한 번 더 누르세요.
                                            </span>
                                        </span>
                                    </span>
                                    {conn.stored && (
                                        <button onClick={() => setShowReconnect(true)}
                                            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-lg cursor-pointer"
                                            style={{ background: 'var(--accent)', color: '#fff' }}>
                                            <Plug size={12} />
                                            다시 연결
                                        </button>
                                    )}
                                </div>
                            )}

                            {/* 만료 띠가 떠 있는 동안 GeoServer를 부르는 조작을 잠근다(inert: 클릭·포커스 모두 막힘). 다시 연결하면 풀린다 */}
                            <div className="space-y-3 sm:space-y-4" inert={conn.state === 'expired'}
                                style={conn.state === 'expired' ? { opacity: 0.55 } : undefined}>
                                <div role="tablist" className="flex gap-1 overflow-x-auto" style={{ borderBottom: '1px solid var(--border)' }}>
                                    <button role="tab" aria-selected={view === 'create'} onClick={() => setView('create')}
                                        className={tabClass(view === 'create')} style={tabStyle(view === 'create')}>
                                        <Plus size={14} />
                                        새 그룹 만들기
                                    </button>
                                    <button role="tab" aria-selected={view === 'list'} onClick={() => setView('list')}
                                        className={tabClass(view === 'list')} style={tabStyle(view === 'list')}>
                                        <Layers size={14} />
                                        그룹 목록
                                        {listCount !== null && (
                                            <span className="text-[11px] px-1.5 rounded-full"
                                                style={{ background: 'var(--bg-hover)', border: '1px solid var(--border)', color: 'var(--text-faint)' }}>
                                                {listCount}
                                            </span>
                                        )}
                                    </button>
                                    {editing && (
                                        <span className="inline-flex items-center">
                                            <button role="tab" aria-selected={view === 'edit'} onClick={() => setView('edit')}
                                                className={tabClass(view === 'edit')} style={tabStyle(view === 'edit')}>
                                                <Pencil size={14} />
                                                수정: <span className="font-mono">{editing.detail.wmsName}</span>
                                            </button>
                                            <button type="button" onClick={cancelEdit} aria-label="수정 취소" title="수정 취소"
                                                className="flex items-center justify-center w-6 h-6 -ml-2 -mb-px rounded-md cursor-pointer"
                                                style={{ color: 'var(--text-faint)', background: 'transparent' }}>
                                                <X size={12} />
                                            </button>
                                        </span>
                                    )}
                                </div>

                                {wsError && (
                                    <Alert tone="err" title="GeoServer 작업공간을 불러오지 못했습니다"
                                        action={
                                            <button onClick={loadWorkspaces} className="text-xs underline cursor-pointer" style={{ color: '#ef4444' }}>
                                                재시도
                                            </button>
                                        }>
                                        {wsError}
                                    </Alert>
                                )}

                                {view === 'list' && (
                                    <GroupList workspaces={workspaces} listWorkspace={listWorkspace}
                                        onListWorkspaceChange={changeListWorkspace}
                                        globalGroups={globalGroups} workspaceGroups={workspaceGroups}
                                        details={details} expandedKey={expandedKey}
                                        onToggle={toggleExpand} onDelete={deleteGroup} onEdit={startEdit} onRefresh={refreshList}
                                        onNewGroup={() => setView('create')}
                                        deletingKey={deletingKey} editingKey={editLoadingKey} notice={listNotice} />
                                )}

                                {/* 수정 화면 — 다른 탭을 다녀와도 편집 내용이 남도록 숨기기만 한다 */}
                                {editing && (
                                    <div hidden={view !== 'edit'}>
                                        <EditPanel key={editing.nonce} detail={editing.detail} connected={connected}
                                            server={conn.info ? serverLabel(conn.info.url) : 'GeoServer'}
                                            workspaces={workspaces} workspacesLoading={workspacesLoading}
                                            layerNames={layerNames} loadNames={loadNames} onLost={handleLost}
                                            onCancel={cancelEdit} onReload={reloadEdit} onGone={handleGone}
                                            onSaved={handleSaved} onContinue={continueEdit} onShowList={closeEdit}
                                            onDirtyChange={handleDirty} />
                                    </div>
                                )}

                                {view === 'create' && (
                                    <>
                                        {result && (
                                            <SaveResult detail={result} onClearAll={clearAll} onShowList={() => setView('list')} />
                                        )}

                                        {/* 만드는 중에는 고르기·정보 영역 전체를 잠근다(두 번 누르기 방지) */}
                                        <div className="space-y-3 sm:space-y-4" inert={submitting}
                                            style={submitting ? { opacity: 0.55 } : undefined}>
                                            <div className="rounded-xl" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
                                                <div className="flex items-center justify-between gap-2 px-4 py-2.5 text-xs font-medium rounded-t-xl"
                                                    style={{ background: 'var(--bg-hover)', borderBottom: '1px solid var(--border)', color: 'var(--text-secondary)' }}>
                                                    <span className="flex items-center">
                                                        <span className="inline-flex w-[18px] h-[18px] rounded-full items-center justify-center text-[11px] mr-1.5"
                                                            style={{ background: 'var(--accent)', color: '#fff' }}>1</span>
                                                        레이어 고르기
                                                    </span>
                                                    <span className="font-normal" style={{ color: 'var(--text-faint)' }}>최대 {MAX_LAYERS}개</span>
                                                </div>
                                                <div className="p-3 sm:p-4">
                                                    {form.scope === 'global' && (
                                                        <div className="text-xs mb-2.5" style={{ color: 'var(--text-muted)' }}>
                                                            전역 그룹: 작업공간을 바꿔도 고른 레이어는 유지됩니다.
                                                        </div>
                                                    )}
                                                    {otherWorkspaceIds.size > 0 && (
                                                        <div className="mb-3">
                                                            <Alert tone="warn"
                                                                title={`다른 작업공간 레이어 ${otherWorkspaceIds.size}개는 이 소속에 넣을 수 없습니다`}
                                                                action={
                                                                    <button type="button" onClick={removeOtherWorkspace}
                                                                        className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded-lg cursor-pointer"
                                                                        style={{ border: '1px solid var(--border)', background: 'var(--bg-page)', color: 'var(--text-secondary)' }}>
                                                                        <X size={12} />
                                                                        {otherWorkspaceIds.size}개 빼기
                                                                    </button>
                                                                }>
                                                                작업공간{workspace ? `(${workspace})` : ''} 소속 그룹에는 그 작업공간 레이어만 들어갑니다.
                                                                빼거나 소속을 전역으로 되돌리세요.
                                                            </Alert>
                                                        </div>
                                                    )}
                                                    <div className="grid gap-3 sm:gap-4 grid-cols-1 lg:grid-cols-2 items-start">
                                                        <LayerPicker workspaces={workspaces} workspace={workspace}
                                                            onWorkspaceChange={changeWorkspace} workspacesLoading={workspacesLoading}
                                                            names={nameState?.items ?? NO_NAMES} loading={nameState?.status === 'loading'}
                                                            error={nameState?.status === 'error' ? nameState.message : null}
                                                            onRefresh={() => { if (workspace) loadNames(workspace, true) }}
                                                            selectedNames={selectedNames} totalSelected={members.length}
                                                            onToggle={toggleName} onSetMany={setMany} />
                                                        <OrderList items={members} missingIds={activeMissing}
                                                            otherWorkspaceIds={otherWorkspaceIds}
                                                            onReorder={reorder} onMove={move} onRemove={remove}
                                                            onRemoveMissing={removeMissing} />
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="rounded-xl" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
                                                <div className="flex items-center px-4 py-2.5 text-xs font-medium rounded-t-xl"
                                                    style={{ background: 'var(--bg-hover)', borderBottom: '1px solid var(--border)', color: 'var(--text-secondary)' }}>
                                                    <span className="inline-flex w-[18px] h-[18px] rounded-full items-center justify-center text-[11px] mr-1.5"
                                                        style={{ background: 'var(--accent)', color: '#fff' }}>2</span>
                                                    그룹 정보
                                                </div>
                                                <div className="p-3 sm:p-4">
                                                    {formError && (
                                                        <div className="mb-3.5">
                                                            <Alert tone="err" title={formError.message}>
                                                                {formError.kind === 'exists' && (
                                                                    <>다른 이름을 쓰거나 [그룹 목록]에서 기존 그룹을 확인하세요. 고른 레이어와 순서는 그대로 있습니다.</>
                                                                )}
                                                                {formError.kind === 'missing' && (
                                                                    <>레이어 목록을 다시 불러왔습니다. 순서 목록에서 빨간 줄을 빼고 다시 만드세요.</>
                                                                )}
                                                                {formError.kind === 'input' && <>입력한 내용을 확인하세요.</>}
                                                            </Alert>
                                                        </div>
                                                    )}
                                                    <GroupForm value={form} onChange={handleFormChange} workspace={workspace}
                                                        nameProblem={nameProblem}
                                                        nameServerError={formError?.kind === 'exists' ? formError.message : null}
                                                        nameWarning={nameWarning} />
                                                </div>
                                            </div>
                                        </div>

                                        <div className="flex flex-wrap items-center justify-between gap-2.5 pt-1">
                                            <span className="text-xs min-w-0 break-all" style={{ color: 'var(--text-faint)' }}>
                                                {conn.info && <>대상: <span className="font-mono">{serverLabel(conn.info.url)}</span></>}
                                                {form.scope === 'workspace' && !workspace && (
                                                    <span className="block" style={{ color: '#b45309' }}>
                                                        소속이 &apos;작업공간&apos;이라 위에서 작업공간을 먼저 고르세요.
                                                    </span>
                                                )}
                                            </span>
                                            <button type="button" onClick={submit} disabled={!canSubmit}
                                                className="flex items-center justify-center gap-2 px-5 py-2.5 text-sm font-medium rounded-lg cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed w-full sm:w-auto"
                                                style={{ background: 'var(--accent)', color: '#fff' }}>
                                                {submitting
                                                    ? <><span className="w-3.5 h-3.5 border-2 rounded-full animate-spin" style={{ borderColor: '#fff', borderTopColor: 'transparent' }} />만드는 중…</>
                                                    : <><Layers size={14} />레이어 그룹 만들기 ({members.length}개)</>}
                                            </button>
                                        </div>
                                    </>
                                )}
                            </div>
                        </>
                    )}
                </main>
            </div>
            {showReconnect && conn.stored && (
                <ReconnectDialog stored={conn.stored} onConnected={conn.setConnected} onClose={() => setShowReconnect(false)} />
            )}
        </div>
    )
}
