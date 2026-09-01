'use client'

import { useCallback, useEffect, useState } from 'react'
import Sidebar from '@/components/layout/Sidebar'
import Header from '@/components/layout/Header'
import {
    Plus,
    Trash2,
    ShieldCheck,
    ShieldAlert,
    X,
    Pencil,
    Check,
    GripVertical,
} from 'lucide-react'
import { getToken } from '@/stores/authStore'

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8080'

/* ── 타입 ── */
interface RolePermissionItem {
    code: string
    roleCode: string
    label: string
    sortOrder: number
}

interface RoleItem {
    code: string
    label: string
    hasSubPermission: boolean
    isSuper: boolean
    sortOrder: number
    permissions: RolePermissionItem[]
}

interface RoleCreateRequest {
    code: string
    label: string
    hasSubPermission: boolean
    isSuper: boolean
    sortOrder: number
}

interface RoleUpdateRequest {
    label: string
    hasSubPermission: boolean
    isSuper: boolean
    sortOrder: number
}

interface PermissionCreateRequest {
    code: string
    label: string
    sortOrder: number
}

interface PermissionUpdateRequest {
    label: string
    sortOrder: number
}

/* ── API 헬퍼 ── */
async function apiFetch<T>(url: string, options?: RequestInit): Promise<T> {
    const token = getToken()
    const headers: Record<string, string> = {
        ...(options?.headers as Record<string, string> ?? {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
    }
    if (options?.body) headers['Content-Type'] = 'application/json'
    const res = await fetch(`${API}${url}`, { ...options, headers })
    if (res.status === 204) return undefined as T
    if (res.status === 401) { window.location.href = '/login'; throw new Error('Unauthorized') }
    const json = await res.json()
    if (!json.success) throw new Error(json.message ?? '요청 실패')
    return json.data as T
}

const fetchRoles = () => apiFetch<RoleItem[]>('/api/roles')
const createRole = (data: RoleCreateRequest) => apiFetch<RoleItem>('/api/roles', { method: 'POST', body: JSON.stringify(data) })
const updateRole = (code: string, data: RoleUpdateRequest) => apiFetch<RoleItem>(`/api/roles/${code}`, { method: 'PUT', body: JSON.stringify(data) })
const deleteRole = (code: string) => apiFetch<void>(`/api/roles/${code}`, { method: 'DELETE' })
const createPermission = (roleCode: string, data: PermissionCreateRequest) =>
    apiFetch<RolePermissionItem>(`/api/roles/${roleCode}/permissions`, { method: 'POST', body: JSON.stringify(data) })
const updatePermission = (code: string, data: PermissionUpdateRequest) =>
    apiFetch<RolePermissionItem>(`/api/roles/permissions/${code}`, { method: 'PUT', body: JSON.stringify(data) })
const deletePermission = (code: string) => apiFetch<void>(`/api/roles/permissions/${code}`, { method: 'DELETE' })

/* ── 공통 스타일 ── */
const inputStyle: React.CSSProperties = {
    background: 'var(--bg-page)',
    border: '1px solid var(--border)',
    color: 'var(--text-primary)',
    borderRadius: '8px',
    padding: '6px 10px',
    fontSize: '13px',
    outline: 'none',
    width: '100%',
}

/* ── 빈 폼 ── */
const EMPTY_ROLE_FORM: RoleCreateRequest = { code: '', label: '', hasSubPermission: false, isSuper: false, sortOrder: 10 }
const EMPTY_PERM_FORM: PermissionCreateRequest = { code: '', label: '', sortOrder: 10 }

export default function PermissionManagementPage() {
    const [roles, setRoles]                 = useState<RoleItem[]>([])
    const [selectedRoleCode, setSelectedRoleCode] = useState<string | null>(null)
    const [loading, setLoading]             = useState(false)
    const [error, setError]                 = useState<string | null>(null)

    /* 역할 모달 */
    const [roleModalType, setRoleModalType] = useState<'create' | 'edit' | 'delete' | null>(null)
    const [roleForm, setRoleForm]           = useState<RoleCreateRequest>(EMPTY_ROLE_FORM)
    const [roleFormError, setRoleFormError] = useState<string | null>(null)
    const [roleSubmitting, setRoleSubmitting] = useState(false)

    /* 권한 모달 */
    const [permModalType, setPermModalType] = useState<'create' | 'edit' | 'delete' | null>(null)
    const [permForm, setPermForm]           = useState<PermissionCreateRequest>(EMPTY_PERM_FORM)
    const [permFormError, setPermFormError] = useState<string | null>(null)
    const [permSubmitting, setPermSubmitting] = useState(false)
    const [selectedPermCode, setSelectedPermCode] = useState<string | null>(null)

    /* 드래그 정렬 */
    const [draggedRoleCode, setDraggedRoleCode] = useState<string | null>(null)
    const [dragOverRoleCode, setDragOverRoleCode] = useState<string | null>(null)
    const [draggedPermCode, setDraggedPermCode] = useState<string | null>(null)
    const [dragOverPermCode, setDragOverPermCode] = useState<string | null>(null)
    const [reordering, setReordering] = useState(false)

    const selectedRole = roles.find(r => r.code === selectedRoleCode) ?? null

    const load = useCallback(async () => {
        setLoading(true); setError(null)
        try {
            const data = await fetchRoles()
            const sorted = [...data].sort((a, b) => a.sortOrder - b.sortOrder)
            setRoles(sorted)
            if (sorted.length > 0 && !selectedRoleCode) {
                setSelectedRoleCode(sorted[0].code)
            }
        } catch (e) {
            setError(e instanceof Error ? e.message : '역할 목록 조회 실패')
        } finally { setLoading(false) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    useEffect(() => { load() }, [load])

    /* ── 역할 CRUD ── */
    const openCreateRole = () => {
        const nextOrder = roles.length > 0 ? Math.max(...roles.map(r => r.sortOrder)) + 10 : 10
        setRoleForm({ ...EMPTY_ROLE_FORM, sortOrder: nextOrder }); setRoleFormError(null); setRoleModalType('create')
    }
    const openEditRole = (role: RoleItem) => {
        setRoleForm({ code: role.code, label: role.label, hasSubPermission: role.hasSubPermission, isSuper: role.isSuper, sortOrder: role.sortOrder })
        setRoleFormError(null); setRoleModalType('edit')
    }
    const openDeleteRole = (role: RoleItem) => {
        setRoleForm({ code: role.code, label: role.label, hasSubPermission: role.hasSubPermission, isSuper: role.isSuper, sortOrder: role.sortOrder })
        setRoleFormError(null); setRoleModalType('delete')
    }
    const closeRoleModal = () => { setRoleModalType(null); setRoleFormError(null) }

    const handleCreateRole = async () => {
        setRoleSubmitting(true); setRoleFormError(null)
        try {
            await createRole(roleForm)
            closeRoleModal(); load()
        } catch (e) { setRoleFormError(e instanceof Error ? e.message : '역할 생성 실패') }
        finally { setRoleSubmitting(false) }
    }

    const handleUpdateRole = async () => {
        setRoleSubmitting(true); setRoleFormError(null)
        try {
            await updateRole(roleForm.code, { label: roleForm.label, hasSubPermission: roleForm.hasSubPermission, isSuper: roleForm.isSuper, sortOrder: roleForm.sortOrder })
            closeRoleModal(); load()
        } catch (e) { setRoleFormError(e instanceof Error ? e.message : '역할 수정 실패') }
        finally { setRoleSubmitting(false) }
    }

    const handleDeleteRole = async () => {
        setRoleSubmitting(true)
        try {
            await deleteRole(roleForm.code)
            if (selectedRoleCode === roleForm.code) setSelectedRoleCode(null)
            closeRoleModal(); load()
        } catch (e) { setRoleFormError(e instanceof Error ? e.message : '역할 삭제 실패') }
        finally { setRoleSubmitting(false) }
    }

    const handleRoleDrop = async (targetCode: string) => {
        const fromCode = draggedRoleCode
        setDraggedRoleCode(null); setDragOverRoleCode(null)
        if (!fromCode || fromCode === targetCode) return

        const list = [...roles]
        const fromIdx = list.findIndex(r => r.code === fromCode)
        const toIdx = list.findIndex(r => r.code === targetCode)
        if (fromIdx === -1 || toIdx === -1) return
        const [moved] = list.splice(fromIdx, 1)
        list.splice(toIdx, 0, moved)
        setRoles(list)

        setReordering(true)
        try {
            await Promise.all(list.map((r, i) =>
                updateRole(r.code, { label: r.label, hasSubPermission: r.hasSubPermission, isSuper: r.isSuper, sortOrder: (i + 1) * 10 })
            ))
            load()
        } catch (e) {
            setError(e instanceof Error ? e.message : '순서 변경 실패')
            load()
        } finally { setReordering(false) }
    }

    const handlePermDrop = async (targetCode: string) => {
        const fromCode = draggedPermCode
        setDraggedPermCode(null); setDragOverPermCode(null)
        if (!fromCode || fromCode === targetCode) return

        const list = [...sortedPerms]
        const fromIdx = list.findIndex(p => p.code === fromCode)
        const toIdx = list.findIndex(p => p.code === targetCode)
        if (fromIdx === -1 || toIdx === -1) return
        const [moved] = list.splice(fromIdx, 1)
        list.splice(toIdx, 0, moved)

        setReordering(true)
        try {
            await Promise.all(list.map((p, i) =>
                updatePermission(p.code, { label: p.label, sortOrder: (i + 1) * 10 })
            ))
            load()
        } catch (e) {
            setError(e instanceof Error ? e.message : '순서 변경 실패')
            load()
        } finally { setReordering(false) }
    }

    /* ── 세부 권한 CRUD ── */
    const openCreatePerm = () => {
        const perms = selectedRole?.permissions ?? []
        const nextOrder = perms.length > 0 ? Math.max(...perms.map(p => p.sortOrder)) + 10 : 10
        setPermForm({ ...EMPTY_PERM_FORM, sortOrder: nextOrder }); setPermFormError(null); setPermModalType('create')
    }
    const openEditPerm = (perm: RolePermissionItem) => {
        setSelectedPermCode(perm.code)
        setPermForm({ code: perm.code, label: perm.label, sortOrder: perm.sortOrder })
        setPermFormError(null); setPermModalType('edit')
    }
    const openDeletePerm = (perm: RolePermissionItem) => {
        setSelectedPermCode(perm.code)
        setPermForm({ code: perm.code, label: perm.label, sortOrder: perm.sortOrder })
        setPermFormError(null); setPermModalType('delete')
    }
    const closePermModal = () => { setPermModalType(null); setPermFormError(null); setSelectedPermCode(null) }

    const handleCreatePerm = async () => {
        if (!selectedRoleCode) return
        setPermSubmitting(true); setPermFormError(null)
        try {
            await createPermission(selectedRoleCode, permForm)
            closePermModal(); load()
        } catch (e) { setPermFormError(e instanceof Error ? e.message : '권한 생성 실패') }
        finally { setPermSubmitting(false) }
    }

    const handleUpdatePerm = async () => {
        if (!selectedPermCode) return
        setPermSubmitting(true); setPermFormError(null)
        try {
            await updatePermission(selectedPermCode, { label: permForm.label, sortOrder: permForm.sortOrder })
            closePermModal(); load()
        } catch (e) { setPermFormError(e instanceof Error ? e.message : '권한 수정 실패') }
        finally { setPermSubmitting(false) }
    }

    const handleDeletePerm = async () => {
        if (!selectedPermCode) return
        setPermSubmitting(true)
        try {
            await deletePermission(selectedPermCode)
            closePermModal(); load()
        } catch (e) { setPermFormError(e instanceof Error ? e.message : '권한 삭제 실패') }
        finally { setPermSubmitting(false) }
    }

    const sortedPerms = (selectedRole?.permissions ?? []).slice().sort((a, b) => a.sortOrder - b.sortOrder)

    return (
        <div className="flex min-h-screen" style={{ background: 'var(--bg-page)' }}>
            <Sidebar />
            <div className="flex-1 flex flex-col min-w-0">
                <Header title="권한 관리" breadcrumb={['관리자', '권한 관리']} />

                <main className="flex-1 p-6">
                    {error && (
                        <div className="mb-4 px-4 py-3 rounded-lg text-sm flex items-center justify-between"
                            style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', color: '#ef4444' }}>
                            {error}
                            <button onClick={() => setError(null)}><X size={14} /></button>
                        </div>
                    )}

                    {loading ? (
                        <div className="flex items-center justify-center py-20">
                            <div className="w-6 h-6 border-2 border-t-transparent rounded-full animate-spin"
                                style={{ borderColor: 'var(--accent)', borderTopColor: 'transparent' }} />
                        </div>
                    ) : (
                        <div className="flex gap-6" style={{ alignItems: 'flex-start' }}>
                            {/* ── 좌측: 역할 목록 ── */}
                            <div className="w-80 shrink-0 rounded-xl overflow-hidden"
                                style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
                                <div className="px-4 py-3 flex items-center justify-between"
                                    style={{ borderBottom: '1px solid var(--border)' }}>
                                    <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>역할 목록</span>
                                    <button
                                        onClick={openCreateRole}
                                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors"
                                        style={{ background: 'var(--accent)', color: '#fff' }}
                                    >
                                        <Plus size={13} /> 역할 추가
                                    </button>
                                </div>

                                {roles.length === 0 ? (
                                    <div className="py-12 text-center text-sm" style={{ color: 'var(--text-faint)' }}>
                                        역할이 없습니다.
                                    </div>
                                ) : (
                                    <ul>
                                        {roles.map((role) => {
                                            const isSelected = role.code === selectedRoleCode
                                            const isDragOver = role.code === dragOverRoleCode && draggedRoleCode !== role.code
                                            return (
                                                <li
                                                    key={role.code}
                                                    draggable
                                                    onDragStart={(e) => { setDraggedRoleCode(role.code); e.dataTransfer.effectAllowed = 'move' }}
                                                    onDragOver={(e) => { e.preventDefault(); if (dragOverRoleCode !== role.code) setDragOverRoleCode(role.code) }}
                                                    onDragLeave={() => setDragOverRoleCode(prev => prev === role.code ? null : prev)}
                                                    onDrop={(e) => { e.preventDefault(); handleRoleDrop(role.code) }}
                                                    onDragEnd={() => { setDraggedRoleCode(null); setDragOverRoleCode(null) }}
                                                    onClick={() => setSelectedRoleCode(role.code)}
                                                    className="cursor-pointer transition-colors"
                                                    style={{
                                                        background: isSelected ? 'var(--accent-bg)' : 'transparent',
                                                        borderLeft: isSelected ? '3px solid var(--accent)' : '3px solid transparent',
                                                        borderTop: isDragOver ? '2px solid var(--accent)' : '2px solid transparent',
                                                        borderBottom: '1px solid var(--border-subtle)',
                                                        opacity: draggedRoleCode === role.code ? 0.4 : 1,
                                                    }}
                                                >
                                                    <div className="px-4 py-3 flex items-center justify-between">
                                                        <div className="flex items-center gap-2 min-w-0">
                                                            <GripVertical size={14} className="cursor-grab active:cursor-grabbing" style={{ color: 'var(--text-faint)', flexShrink: 0 }} />
                                                            {role.isSuper
                                                                ? <ShieldAlert size={15} style={{ color: '#ef4444', flexShrink: 0 }} />
                                                                : <ShieldCheck size={15} style={{ color: isSelected ? 'var(--accent)' : 'var(--text-faint)', flexShrink: 0 }} />
                                                            }
                                                            <div className="min-w-0">
                                                                <div className="flex items-center gap-1.5 flex-wrap">
                                                                    <span className="text-sm font-medium" style={{ color: isSelected ? 'var(--accent)' : 'var(--text-primary)' }}>
                                                                        {role.label}
                                                                    </span>
                                                                    {role.isSuper && (
                                                                        <span className="text-xs px-1.5 py-0.5 rounded-full font-medium"
                                                                            style={{ background: 'rgba(239,68,68,0.12)', color: '#ef4444' }}>
                                                                            SUPER
                                                                        </span>
                                                                    )}
                                                                    {role.hasSubPermission && (
                                                                        <span className="text-xs px-1.5 py-0.5 rounded-full font-medium"
                                                                            style={{ background: 'rgba(59,130,246,0.12)', color: '#3b82f6' }}>
                                                                            권한필요
                                                                        </span>
                                                                    )}
                                                                </div>
                                                                <p className="text-xs font-mono mt-0.5" style={{ color: 'var(--text-faint)' }}>
                                                                    {role.code}
                                                                </p>
                                                            </div>
                                                        </div>
                                                        <div className="flex items-center gap-1 ml-2 shrink-0">
                                                            <button
                                                                onClick={(e) => { e.stopPropagation(); openEditRole(role) }}
                                                                className="p-1.5 rounded-lg transition-colors"
                                                                style={{ color: 'var(--text-faint)' }}
                                                                title="역할 수정"
                                                            >
                                                                <Pencil size={13} />
                                                            </button>
                                                            <button
                                                                onClick={(e) => { e.stopPropagation(); openDeleteRole(role) }}
                                                                className="p-1.5 rounded-lg transition-colors"
                                                                style={{ color: 'var(--text-faint)' }}
                                                                title="역할 삭제"
                                                            >
                                                                <Trash2 size={13} />
                                                            </button>
                                                        </div>
                                                    </div>
                                                </li>
                                            )
                                        })}
                                    </ul>
                                )}
                            </div>

                            {/* ── 우측: 세부 권한 ── */}
                            <div className="flex-1 rounded-xl overflow-hidden"
                                style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
                                <div className="px-4 py-3 flex items-center justify-between"
                                    style={{ borderBottom: '1px solid var(--border)' }}>
                                    <div>
                                        <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                                            세부 권한
                                        </span>
                                        {selectedRole && (
                                            <span className="ml-2 text-sm" style={{ color: 'var(--text-muted)' }}>
                                                — {selectedRole.label}
                                            </span>
                                        )}
                                    </div>
                                    {selectedRole?.hasSubPermission && (
                                        <button
                                            onClick={openCreatePerm}
                                            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors"
                                            style={{ background: 'var(--accent)', color: '#fff' }}
                                        >
                                            <Plus size={13} /> 세부 권한 추가
                                        </button>
                                    )}
                                </div>

                                {!selectedRole ? (
                                    <div className="py-20 text-center text-sm" style={{ color: 'var(--text-faint)' }}>
                                        좌측에서 역할을 선택하세요.
                                    </div>
                                ) : selectedRole.isSuper ? (
                                    <div className="py-16 flex flex-col items-center gap-3">
                                        <ShieldAlert size={32} style={{ color: '#ef4444', opacity: 0.5 }} />
                                        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                                            슈퍼관리자는 모든 기능에 접근 가능하며 세부 권한을 갖지 않습니다.
                                        </p>
                                    </div>
                                ) : !selectedRole.hasSubPermission ? (
                                    <div className="py-16 flex flex-col items-center gap-3">
                                        <ShieldCheck size={32} style={{ color: 'var(--text-faint)', opacity: 0.5 }} />
                                        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                                            이 역할은 세부 권한을 사용하지 않습니다.
                                        </p>
                                        <p className="text-xs" style={{ color: 'var(--text-faint)' }}>
                                            역할 수정에서 &quot;세부 권한 사용&quot;을 활성화하면 권한을 추가할 수 있습니다.
                                        </p>
                                    </div>
                                ) : sortedPerms.length === 0 ? (
                                    <div className="py-12 text-center text-sm" style={{ color: 'var(--text-faint)' }}>
                                        세부 권한이 없습니다. 추가 버튼을 눌러 권한을 추가하세요.
                                    </div>
                                ) : (
                                    <table className="w-full text-sm">
                                        <thead>
                                            <tr style={{ background: 'var(--bg-hover)', borderBottom: '1px solid var(--border)' }}>
                                                {['', '코드', '라벨', '관리'].map((h, i) => (
                                                    <th key={i} className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wide"
                                                        style={{ color: 'var(--text-muted)', width: i === 0 ? '32px' : undefined }}>{h}</th>
                                                ))}
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {sortedPerms.map((perm) => {
                                                const isDragOver = perm.code === dragOverPermCode && draggedPermCode !== perm.code
                                                return (
                                                <tr
                                                    key={perm.code}
                                                    draggable
                                                    onDragStart={(e) => { setDraggedPermCode(perm.code); e.dataTransfer.effectAllowed = 'move' }}
                                                    onDragOver={(e) => { e.preventDefault(); if (dragOverPermCode !== perm.code) setDragOverPermCode(perm.code) }}
                                                    onDragLeave={() => setDragOverPermCode(prev => prev === perm.code ? null : prev)}
                                                    onDrop={(e) => { e.preventDefault(); handlePermDrop(perm.code) }}
                                                    onDragEnd={() => { setDraggedPermCode(null); setDragOverPermCode(null) }}
                                                    style={{
                                                        borderBottom: '1px solid var(--border-subtle)',
                                                        borderTop: isDragOver ? '2px solid var(--accent)' : '2px solid transparent',
                                                        opacity: draggedPermCode === perm.code ? 0.4 : 1,
                                                    }}
                                                    className="transition-colors hover:bg-[var(--bg-hover)]">
                                                    <td className="px-4 py-3">
                                                        <GripVertical size={14} className="cursor-grab active:cursor-grabbing" style={{ color: 'var(--text-faint)' }} />
                                                    </td>
                                                    <td className="px-4 py-3 font-mono text-xs" style={{ color: 'var(--text-muted)' }}>
                                                        {perm.code}
                                                    </td>
                                                    <td className="px-4 py-3 font-medium" style={{ color: 'var(--text-primary)' }}>
                                                        {perm.label}
                                                    </td>
                                                    <td className="px-4 py-3">
                                                        <div className="flex items-center gap-1">
                                                            <button onClick={() => openEditPerm(perm)} title="수정"
                                                                className="p-1.5 rounded-lg transition-colors"
                                                                style={{ color: 'var(--text-faint)' }}>
                                                                <Pencil size={14} />
                                                            </button>
                                                            <button onClick={() => openDeletePerm(perm)} title="삭제"
                                                                className="p-1.5 rounded-lg transition-colors"
                                                                style={{ color: 'var(--text-faint)' }}>
                                                                <Trash2 size={14} />
                                                            </button>
                                                        </div>
                                                    </td>
                                                </tr>
                                                )
                                            })}
                                        </tbody>
                                    </table>
                                )}
                            </div>
                        </div>
                    )}
                </main>
            </div>

            {/* ── 역할 생성/수정 모달 ── */}
            {(roleModalType === 'create' || roleModalType === 'edit') && (
                <div className="fixed inset-0 flex items-center justify-center z-50 p-4"
                    style={{ background: 'rgba(0,0,0,0.5)' }}>
                    <div className="rounded-2xl shadow-2xl w-full max-w-md"
                        style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
                        <div className="flex items-center justify-between px-6 py-4"
                            style={{ borderBottom: '1px solid var(--border)' }}>
                            <h3 className="font-semibold" style={{ color: 'var(--text-primary)' }}>
                                {roleModalType === 'create' ? '역할 추가' : '역할 수정'}
                            </h3>
                            <button onClick={closeRoleModal} className="p-1 rounded-lg" style={{ color: 'var(--text-faint)' }}>
                                <X size={18} />
                            </button>
                        </div>

                        <div className="px-6 py-5 space-y-4">
                            {roleFormError && (
                                <div className="px-4 py-3 rounded-lg text-sm"
                                    style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', color: '#ef4444' }}>
                                    {roleFormError}
                                </div>
                            )}

                            <div>
                                <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                                    역할 코드 <span style={{ color: '#ef4444' }}>*</span>
                                    {roleModalType === 'edit' && <span style={{ color: 'var(--text-faint)', fontWeight: 400 }}> (변경 불가)</span>}
                                </label>
                                <input
                                    type="text"
                                    value={roleForm.code}
                                    onChange={(e) => setRoleForm({ ...roleForm, code: e.target.value.toUpperCase() })}
                                    disabled={roleModalType === 'edit'}
                                    placeholder="예: MAP_USER"
                                    className="focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed"
                                    style={inputStyle}
                                />
                            </div>

                            <div>
                                <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                                    라벨 <span style={{ color: '#ef4444' }}>*</span>
                                </label>
                                <input
                                    type="text"
                                    value={roleForm.label}
                                    onChange={(e) => setRoleForm({ ...roleForm, label: e.target.value })}
                                    placeholder="예: 지도사용자"
                                    className="focus:outline-none"
                                    style={inputStyle}
                                />
                            </div>

                            <div className="flex flex-col gap-3">
                                <label className="flex items-center gap-3 cursor-pointer">
                                    <button
                                        type="button"
                                        onClick={() => setRoleForm({ ...roleForm, hasSubPermission: !roleForm.hasSubPermission })}
                                        className="w-9 h-5 rounded-full transition-colors relative flex items-center"
                                        style={{
                                            background: roleForm.hasSubPermission ? 'var(--accent)' : 'var(--border)',
                                        }}
                                    >
                                        <span className="absolute w-4 h-4 rounded-full bg-white transition-transform shadow-sm"
                                            style={{ transform: roleForm.hasSubPermission ? 'translateX(20px)' : 'translateX(2px)' }} />
                                    </button>
                                    <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>세부 권한 사용</span>
                                    {roleForm.hasSubPermission && <Check size={14} style={{ color: 'var(--accent)' }} />}
                                </label>

                                <label className="flex items-center gap-3 cursor-pointer">
                                    <button
                                        type="button"
                                        onClick={() => setRoleForm({ ...roleForm, isSuper: !roleForm.isSuper })}
                                        className="w-9 h-5 rounded-full transition-colors relative flex items-center"
                                        style={{
                                            background: roleForm.isSuper ? '#ef4444' : 'var(--border)',
                                        }}
                                    >
                                        <span className="absolute w-4 h-4 rounded-full bg-white transition-transform shadow-sm"
                                            style={{ transform: roleForm.isSuper ? 'translateX(20px)' : 'translateX(2px)' }} />
                                    </button>
                                    <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>슈퍼 역할</span>
                                    {roleForm.isSuper && <ShieldAlert size={14} style={{ color: '#ef4444' }} />}
                                </label>
                            </div>
                        </div>

                        <div className="flex gap-3 px-6 py-4" style={{ borderTop: '1px solid var(--border)' }}>
                            <button onClick={closeRoleModal}
                                className="flex-1 px-4 py-2.5 text-sm font-medium rounded-lg"
                                style={{ background: 'var(--bg-hover)', color: 'var(--text-secondary)' }}>
                                취소
                            </button>
                            <button
                                onClick={roleModalType === 'create' ? handleCreateRole : handleUpdateRole}
                                disabled={roleSubmitting}
                                className="flex-1 px-4 py-2.5 text-sm font-medium rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
                                style={{ background: 'var(--accent)', color: '#fff' }}>
                                {roleSubmitting ? '처리 중...' : roleModalType === 'create' ? '추가' : '저장'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── 역할 삭제 모달 ── */}
            {roleModalType === 'delete' && (
                <div className="fixed inset-0 flex items-center justify-center z-50 p-4"
                    style={{ background: 'rgba(0,0,0,0.5)' }}>
                    <div className="rounded-2xl shadow-2xl w-full max-w-sm"
                        style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
                        <div className="px-6 pt-6 pb-4 text-center">
                            <div className="w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4"
                                style={{ background: 'rgba(239,68,68,0.12)' }}>
                                <Trash2 size={22} style={{ color: '#ef4444' }} />
                            </div>
                            <h3 className="font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>역할 삭제</h3>
                            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                                <span className="font-medium" style={{ color: 'var(--text-primary)' }}>{roleForm.label}</span> 역할을
                                <br />정말 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.
                            </p>
                            {roleFormError && <p className="mt-3 text-xs" style={{ color: '#ef4444' }}>{roleFormError}</p>}
                        </div>
                        <div className="flex gap-3 px-6 py-4" style={{ borderTop: '1px solid var(--border)' }}>
                            <button onClick={closeRoleModal}
                                className="flex-1 px-4 py-2.5 text-sm font-medium rounded-lg"
                                style={{ background: 'var(--bg-hover)', color: 'var(--text-secondary)' }}>
                                취소
                            </button>
                            <button onClick={handleDeleteRole} disabled={roleSubmitting}
                                className="flex-1 px-4 py-2.5 text-sm font-medium rounded-lg disabled:opacity-50"
                                style={{ background: '#ef4444', color: '#fff' }}>
                                {roleSubmitting ? '삭제 중...' : '삭제'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── 세부 권한 생성/수정 모달 ── */}
            {(permModalType === 'create' || permModalType === 'edit') && (
                <div className="fixed inset-0 flex items-center justify-center z-50 p-4"
                    style={{ background: 'rgba(0,0,0,0.5)' }}>
                    <div className="rounded-2xl shadow-2xl w-full max-w-md"
                        style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
                        <div className="flex items-center justify-between px-6 py-4"
                            style={{ borderBottom: '1px solid var(--border)' }}>
                            <h3 className="font-semibold" style={{ color: 'var(--text-primary)' }}>
                                {permModalType === 'create' ? '세부 권한 추가' : '세부 권한 수정'}
                            </h3>
                            <button onClick={closePermModal} className="p-1 rounded-lg" style={{ color: 'var(--text-faint)' }}>
                                <X size={18} />
                            </button>
                        </div>

                        <div className="px-6 py-5 space-y-4">
                            {permFormError && (
                                <div className="px-4 py-3 rounded-lg text-sm"
                                    style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', color: '#ef4444' }}>
                                    {permFormError}
                                </div>
                            )}

                            <div>
                                <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                                    권한 코드 <span style={{ color: '#ef4444' }}>*</span>
                                    {permModalType === 'edit' && <span style={{ color: 'var(--text-faint)', fontWeight: 400 }}> (변경 불가)</span>}
                                </label>
                                <input
                                    type="text"
                                    value={permForm.code}
                                    onChange={(e) => setPermForm({ ...permForm, code: e.target.value.toUpperCase() })}
                                    disabled={permModalType === 'edit'}
                                    placeholder="예: VIEWER"
                                    className="focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed"
                                    style={inputStyle}
                                />
                            </div>

                            <div>
                                <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                                    라벨 <span style={{ color: '#ef4444' }}>*</span>
                                </label>
                                <input
                                    type="text"
                                    value={permForm.label}
                                    onChange={(e) => setPermForm({ ...permForm, label: e.target.value })}
                                    placeholder="예: 뷰어"
                                    className="focus:outline-none"
                                    style={inputStyle}
                                />
                            </div>

                        </div>

                        <div className="flex gap-3 px-6 py-4" style={{ borderTop: '1px solid var(--border)' }}>
                            <button onClick={closePermModal}
                                className="flex-1 px-4 py-2.5 text-sm font-medium rounded-lg"
                                style={{ background: 'var(--bg-hover)', color: 'var(--text-secondary)' }}>
                                취소
                            </button>
                            <button
                                onClick={permModalType === 'create' ? handleCreatePerm : handleUpdatePerm}
                                disabled={permSubmitting}
                                className="flex-1 px-4 py-2.5 text-sm font-medium rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
                                style={{ background: 'var(--accent)', color: '#fff' }}>
                                {permSubmitting ? '처리 중...' : permModalType === 'create' ? '추가' : '저장'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── 세부 권한 삭제 모달 ── */}
            {permModalType === 'delete' && (
                <div className="fixed inset-0 flex items-center justify-center z-50 p-4"
                    style={{ background: 'rgba(0,0,0,0.5)' }}>
                    <div className="rounded-2xl shadow-2xl w-full max-w-sm"
                        style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
                        <div className="px-6 pt-6 pb-4 text-center">
                            <div className="w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4"
                                style={{ background: 'rgba(239,68,68,0.12)' }}>
                                <Trash2 size={22} style={{ color: '#ef4444' }} />
                            </div>
                            <h3 className="font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>세부 권한 삭제</h3>
                            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                                <span className="font-medium" style={{ color: 'var(--text-primary)' }}>{permForm.label}</span> 권한을
                                <br />정말 삭제하시겠습니까?
                            </p>
                            {permFormError && <p className="mt-3 text-xs" style={{ color: '#ef4444' }}>{permFormError}</p>}
                        </div>
                        <div className="flex gap-3 px-6 py-4" style={{ borderTop: '1px solid var(--border)' }}>
                            <button onClick={closePermModal}
                                className="flex-1 px-4 py-2.5 text-sm font-medium rounded-lg"
                                style={{ background: 'var(--bg-hover)', color: 'var(--text-secondary)' }}>
                                취소
                            </button>
                            <button onClick={handleDeletePerm} disabled={permSubmitting}
                                className="flex-1 px-4 py-2.5 text-sm font-medium rounded-lg disabled:opacity-50"
                                style={{ background: '#ef4444', color: '#fff' }}>
                                {permSubmitting ? '삭제 중...' : '삭제'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
