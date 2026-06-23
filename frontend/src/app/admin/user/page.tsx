'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Sidebar from '@/components/layout/Sidebar'
import Header from '@/components/layout/Header'
import {
    Search,
    UserPlus,
    Pencil,
    Trash2,
    ChevronLeft,
    ChevronRight,
    X,
    ToggleLeft,
    ToggleRight,
    ShieldAlert,
    User as UserIcon,
    Map,
    Trash,
} from 'lucide-react'
import type {
    ApiResponse,
    Permission,
    Role,
    User,
    UserCreateRequest,
    UserFormState,
    UserPage,
    UserStatus,
    UserUpdateRequest,
} from '@/types/user'
import { PERMISSION_MAP, ROLE_OPTIONS } from '@/types/user'
import { getToken } from '@/store/authStore'

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8080'

async function apiFetch<T>(url: string, options?: RequestInit): Promise<T> {
    const token = getToken()
    const headers: Record<string, string> = {
        ...(options?.headers as Record<string, string> ?? {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
    }
    if (options?.body) headers['Content-Type'] = 'application/json'

    const res = await fetch(`${API}${url}`, { ...options, headers })
    if (res.status === 204) return undefined as T
    if (res.status === 401) {
        window.location.href = '/login'
        throw new Error('Unauthorized')
    }
    const json: ApiResponse<T> = await res.json()
    if (!json.success) throw new Error(json.message)
    return json.data
}

const fetchUsers = (params: Record<string, string>) =>
    apiFetch<UserPage>(`/api/users?${new URLSearchParams(params)}`)

const createUser = (data: UserCreateRequest) =>
    apiFetch<User>('/api/users', { method: 'POST', body: JSON.stringify(data) })

const updateUser = (userId: string, data: UserUpdateRequest) =>
    apiFetch<User>(`/api/users/${userId}`, { method: 'PUT', body: JSON.stringify(data) })

const toggleStatus = (userId: string) =>
    apiFetch<User>(`/api/users/${userId}/status`, { method: 'PATCH' })

const deleteUser = (userId: string) =>
    apiFetch<void>(`/api/users/${userId}`, { method: 'DELETE' })

const batchDeleteUsers = (ids: string[]) =>
    apiFetch<string>('/api/users/batch', { method: 'DELETE', body: JSON.stringify({ ids }) })

const EMPTY_FORM: UserFormState = {
    userId: '', userName: '', nickname: '', email: '', password: '',
    role: 'MAP_USER', permission: 'VIEWER',
}

function RoleIcon({ role }: { role: Role }) {
    if (role === 'SUPER_ADMIN') return <ShieldAlert size={11} />
    if (role === 'MAP_ADMIN')   return <Map size={11} />
    return <UserIcon size={11} />
}

const ROLE_STYLE: Record<Role, { bg: string; color: string }> = {
    SUPER_ADMIN: { bg: 'rgba(239,68,68,0.12)',  color: '#ef4444' },
    MAP_ADMIN:   { bg: 'rgba(59,130,246,0.12)', color: '#3b82f6' },
    MAP_USER:    { bg: 'rgba(107,114,128,0.12)', color: 'var(--text-muted)' },
}

function RoleBadge({ role, roleLabel }: { role: Role; roleLabel: string }) {
    const s = ROLE_STYLE[role]
    return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium"
            style={{ background: s.bg, color: s.color }}>
            <RoleIcon role={role} />
            {roleLabel}
        </span>
    )
}

function StatusBadge({ status }: { status: UserStatus }) {
    return status === 'ACTIVE' ? (
        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium"
            style={{ background: 'rgba(16,185,129,0.12)', color: '#10b981' }}>
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: '#10b981' }} />활성
        </span>
    ) : (
        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium"
            style={{ background: 'var(--bg-hover)', color: 'var(--text-faint)' }}>
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: 'var(--text-faint)' }} />비활성
        </span>
    )
}

function formatDate(iso: string | null) {
    if (!iso) return '-'
    return new Date(iso).toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' })
}

/* 공통 인풋 스타일 */
const inputStyle: React.CSSProperties = {
    background: 'var(--bg-page)',
    border: '1px solid var(--border)',
    color: 'var(--text-primary)',
    borderRadius: '8px',
}

export default function UserManagementPage() {
    const [page, setPage]               = useState<UserPage | null>(null)
    const [loading, setLoading]         = useState(false)
    const [error, setError]             = useState<string | null>(null)

    const [keyword, setKeyword]         = useState('')
    const [roleFilter, setRoleFilter]   = useState('')
    const [statusFilter, setStatusFilter] = useState('')
    const [currentPage, setCurrentPage] = useState(0)

    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
    const [modalType, setModalType]     = useState<'create' | 'edit' | 'delete' | 'batch-delete' | null>(null)
    const [selectedUser, setSelectedUser] = useState<User | null>(null)
    const [form, setForm]               = useState<UserFormState>(EMPTY_FORM)
    const [formError, setFormError]     = useState<string | null>(null)
    const [submitting, setSubmitting]   = useState(false)

    const abortRef = useRef<AbortController | null>(null)

    const users       = page?.content ?? []
    const totalPages  = page?.totalPages ?? 0
    const permissions = PERMISSION_MAP[form.role]

    const isAllChecked    = users.length > 0 && users.every((u) => selectedIds.has(u.userId))
    const isIndeterminate = users.some((u) => selectedIds.has(u.userId)) && !isAllChecked

    const toggleAll = () => {
        if (isAllChecked) {
            setSelectedIds((prev) => { const n = new Set(prev); users.forEach((u) => n.delete(u.userId)); return n })
        } else {
            setSelectedIds((prev) => { const n = new Set(prev); users.forEach((u) => n.add(u.userId)); return n })
        }
    }

    const toggleOne = (userId: string) => {
        setSelectedIds((prev) => { const n = new Set(prev); n.has(userId) ? n.delete(userId) : n.add(userId); return n })
    }

    const load = useCallback(async () => {
        abortRef.current?.abort()
        abortRef.current = new AbortController()
        setLoading(true); setError(null)
        try {
            const params: Record<string, string> = { page: String(currentPage), size: '10' }
            if (keyword)      params.keyword = keyword
            if (roleFilter)   params.role    = roleFilter
            if (statusFilter) params.status  = statusFilter
            setPage(await fetchUsers(params))
        } catch (e) {
            if (e instanceof Error && e.name !== 'AbortError')
                setError('사용자 목록을 불러오는데 실패했습니다.')
        } finally { setLoading(false) }
    }, [keyword, roleFilter, statusFilter, currentPage])

    useEffect(() => { load() }, [load])

    const handleRoleChange = (role: Role) => {
        const perms = PERMISSION_MAP[role]
        setForm((f) => ({ ...f, role, permission: perms ? perms[0].value : '' }))
    }

    const openCreate = () => { setForm(EMPTY_FORM); setFormError(null); setModalType('create') }
    const openEdit   = (user: User) => {
        setSelectedUser(user)
        setForm({ userId: user.userId, userName: user.userName ?? '', nickname: user.nickname ?? '',
            email: user.email ?? '', password: '', role: user.role, permission: user.permission ?? '' })
        setFormError(null); setModalType('edit')
    }
    const openDelete = (user: User) => { setSelectedUser(user); setModalType('delete') }
    const closeModal = () => { setModalType(null); setSelectedUser(null); setFormError(null) }

    const handleCreate = async () => {
        setSubmitting(true); setFormError(null)
        try {
            await createUser({
                userId: form.userId, password: form.password, role: form.role,
                ...(form.userName   && { userName:   form.userName }),
                ...(form.nickname   && { nickname:   form.nickname }),
                ...(form.email      && { email:      form.email }),
                ...(form.permission && { permission: form.permission as Permission }),
            })
            closeModal(); load()
        } catch (e) { setFormError(e instanceof Error ? e.message : '생성에 실패했습니다.') }
        finally { setSubmitting(false) }
    }

    const handleUpdate = async () => {
        if (!selectedUser) return
        setSubmitting(true); setFormError(null)
        try {
            await updateUser(selectedUser.userId, {
                role: form.role,
                ...(form.userName   && { userName:   form.userName }),
                ...(form.nickname   && { nickname:   form.nickname }),
                ...(form.email      && { email:      form.email }),
                ...(form.permission && { permission: form.permission as Permission }),
                ...(form.password   && { password:   form.password }),
            })
            closeModal(); load()
        } catch (e) { setFormError(e instanceof Error ? e.message : '수정에 실패했습니다.') }
        finally { setSubmitting(false) }
    }

    const handleDelete = async () => {
        if (!selectedUser) return
        setSubmitting(true)
        try {
            await deleteUser(selectedUser.userId)
            setSelectedIds((prev) => { const n = new Set(prev); n.delete(selectedUser.userId); return n })
            closeModal(); load()
        } catch (e) { setFormError(e instanceof Error ? e.message : '삭제에 실패했습니다.') }
        finally { setSubmitting(false) }
    }

    const handleBatchDelete = async () => {
        setSubmitting(true)
        try {
            await batchDeleteUsers(Array.from(selectedIds))
            setSelectedIds(new Set()); closeModal(); load()
        } catch (e) { setFormError(e instanceof Error ? e.message : '일괄 삭제에 실패했습니다.') }
        finally { setSubmitting(false) }
    }

    const handleToggle = async (user: User) => {
        try { await toggleStatus(user.userId); load() }
        catch (e) { setError(e instanceof Error ? e.message : '상태 변경에 실패했습니다.') }
    }

    return (
        <div className="flex min-h-screen" style={{ background: 'var(--bg-page)' }}>
            <Sidebar />
            <div className="flex-1 flex flex-col min-w-0">
                <Header title="사용자 관리" breadcrumb={['관리자', '사용자 관리']} />

                <main className="flex-1 p-6 space-y-4">
                    {/* 툴바 */}
                    <div className="flex flex-wrap items-center gap-3">
                        <div className="relative flex-1 min-w-48">
                            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2"
                                style={{ color: 'var(--text-faint)' }} />
                            <input
                                type="text"
                                placeholder="아이디, 닉네임 또는 이메일 검색..."
                                value={keyword}
                                onChange={(e) => setKeyword(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && setCurrentPage(0)}
                                className="w-full pl-9 pr-4 py-2 text-sm focus:outline-none"
                                style={{ ...inputStyle, width: '100%' }}
                            />
                        </div>

                        <select
                            value={roleFilter}
                            onChange={(e) => { setRoleFilter(e.target.value); setCurrentPage(0) }}
                            className="px-3 py-2 text-sm focus:outline-none"
                            style={inputStyle}
                        >
                            <option value="">전체 역할</option>
                            {ROLE_OPTIONS.map((r) => (
                                <option key={r.value} value={r.value}>{r.label}</option>
                            ))}
                        </select>

                        <select
                            value={statusFilter}
                            onChange={(e) => { setStatusFilter(e.target.value); setCurrentPage(0) }}
                            className="px-3 py-2 text-sm focus:outline-none"
                            style={inputStyle}
                        >
                            <option value="">전체 상태</option>
                            <option value="ACTIVE">활성</option>
                            <option value="INACTIVE">비활성</option>
                        </select>

                        <div className="flex items-center gap-2 ml-auto">
                            {selectedIds.size > 0 && (
                                <button
                                    onClick={() => { setFormError(null); setModalType('batch-delete') }}
                                    className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-colors"
                                    style={{ background: 'rgba(239,68,68,0.12)', color: '#ef4444' }}
                                >
                                    <Trash size={15} />
                                    선택 삭제 ({selectedIds.size}명)
                                </button>
                            )}
                            <button
                                onClick={openCreate}
                                className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-colors"
                                style={{ background: 'var(--accent)', color: '#fff' }}
                            >
                                <UserPlus size={15} />
                                사용자 추가
                            </button>
                        </div>
                    </div>

                    {/* 에러 배너 */}
                    {error && (
                        <div className="px-4 py-3 rounded-lg text-sm flex items-center justify-between"
                            style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', color: '#ef4444' }}>
                            {error}
                            <button onClick={() => setError(null)}><X size={14} /></button>
                        </div>
                    )}

                    {/* 테이블 */}
                    <div className="rounded-xl overflow-hidden"
                        style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
                        <div className="px-6 py-3 flex items-center justify-between"
                            style={{ borderBottom: '1px solid var(--border)' }}>
                            <span className="text-sm" style={{ color: 'var(--text-muted)' }}>
                                총 <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>
                                    {page?.totalElements ?? 0}
                                </span>명
                            </span>
                            {selectedIds.size > 0 && (
                                <span className="text-xs font-medium" style={{ color: 'var(--accent)' }}>
                                    {selectedIds.size}명 선택됨
                                </span>
                            )}
                        </div>

                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr style={{ background: 'var(--bg-hover)', borderBottom: '1px solid var(--border)' }}>
                                        <th className="px-4 py-3 w-10 align-middle">
                                            <input
                                                type="checkbox"
                                                checked={isAllChecked}
                                                ref={(el) => { if (el) el.indeterminate = isIndeterminate }}
                                                onChange={toggleAll}
                                                className="w-4 h-4 rounded cursor-pointer block"
                                            />
                                        </th>
                                        {['NO.', '아이디', '닉네임', '이메일', '역할', '세부 권한', '상태', '마지막 로그인', '가입일'].map((h) => (
                                            <th key={h} className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wide align-middle"
                                                style={{ color: 'var(--text-muted)' }}>{h}</th>
                                        ))}
                                        <th className="text-center px-4 py-3 text-xs font-semibold uppercase tracking-wide"
                                            style={{ color: 'var(--text-muted)' }}>관리</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {loading ? (
                                        <tr>
                                            <td colSpan={11} className="text-center py-16">
                                                <div className="flex flex-col items-center gap-2">
                                                    <div className="w-6 h-6 border-2 border-t-transparent rounded-full animate-spin"
                                                        style={{ borderColor: 'var(--accent)', borderTopColor: 'transparent' }} />
                                                    <span className="text-sm" style={{ color: 'var(--text-muted)' }}>불러오는 중...</span>
                                                </div>
                                            </td>
                                        </tr>
                                    ) : users.length === 0 ? (
                                        <tr>
                                            <td colSpan={11} className="text-center py-16 text-sm"
                                                style={{ color: 'var(--text-faint)' }}>
                                                등록된 사용자가 없습니다.
                                            </td>
                                        </tr>
                                    ) : (
                                        users.map((user, idx) => (
                                            <tr key={user.userId}
                                                style={{
                                                    borderBottom: '1px solid var(--border-subtle)',
                                                    background: selectedIds.has(user.userId) ? 'var(--accent-bg)' : 'transparent',
                                                }}
                                                className="transition-colors hover:bg-[var(--bg-hover)]"
                                            >
                                                <td className="px-4 py-4 align-middle">
                                                    <input
                                                        type="checkbox"
                                                        checked={selectedIds.has(user.userId)}
                                                        onChange={() => toggleOne(user.userId)}
                                                        className="w-4 h-4 rounded cursor-pointer block"
                                                    />
                                                </td>
                                                <td className="px-4 py-4 text-xs" style={{ color: 'var(--text-faint)' }}>
                                                    {currentPage * 10 + idx + 1}
                                                </td>
                                                <td className="px-4 py-4 font-medium" style={{ color: 'var(--text-primary)' }}>{user.userId}</td>
                                                <td className="px-4 py-4" style={{ color: 'var(--text-secondary)' }}>{user.nickname ?? '-'}</td>
                                                <td className="px-4 py-4" style={{ color: 'var(--text-muted)' }}>{user.email ?? '-'}</td>
                                                <td className="px-4 py-4">
                                                    <RoleBadge role={user.role} roleLabel={user.roleLabel} />
                                                </td>
                                                <td className="px-4 py-4 text-xs" style={{ color: 'var(--text-muted)' }}>
                                                    {user.permissionLabel ?? '-'}
                                                </td>
                                                <td className="px-4 py-4"><StatusBadge status={user.status} /></td>
                                                <td className="px-4 py-4 text-xs" style={{ color: 'var(--text-faint)' }}>{formatDate(user.lastLoginAt)}</td>
                                                <td className="px-4 py-4 text-xs" style={{ color: 'var(--text-faint)' }}>{formatDate(user.createdAt)}</td>
                                                <td className="px-4 py-4">
                                                    <div className="flex items-center justify-center gap-1">
                                                        <button onClick={() => handleToggle(user)}
                                                            title={user.status === 'ACTIVE' ? '비활성화' : '활성화'}
                                                            className="p-1.5 rounded-lg transition-colors"
                                                            style={{ color: 'var(--text-faint)' }}>
                                                            {user.status === 'ACTIVE'
                                                                ? <ToggleRight size={18} style={{ color: '#10b981' }} />
                                                                : <ToggleLeft size={18} style={{ color: 'var(--text-faint)' }} />
                                                            }
                                                        </button>
                                                        <button onClick={() => openEdit(user)} title="수정"
                                                            className="p-1.5 rounded-lg transition-colors"
                                                            style={{ color: 'var(--text-faint)' }}>
                                                            <Pencil size={15} />
                                                        </button>
                                                        <button onClick={() => openDelete(user)} title="삭제"
                                                            className="p-1.5 rounded-lg transition-colors"
                                                            style={{ color: 'var(--text-faint)' }}>
                                                            <Trash2 size={15} />
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>

                        {/* 페이지네이션 */}
                        {totalPages > 1 && (
                            <div className="flex items-center justify-center gap-2 px-6 py-4"
                                style={{ borderTop: '1px solid var(--border)' }}>
                                <button onClick={() => setCurrentPage((p) => Math.max(0, p - 1))}
                                    disabled={currentPage === 0}
                                    className="p-1.5 rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                                    style={{ color: 'var(--text-muted)' }}>
                                    <ChevronLeft size={16} />
                                </button>
                                {Array.from({ length: Math.min(totalPages, 10) }, (_, i) => {
                                    const pageNum = Math.max(0, Math.min(currentPage - 4, totalPages - 10)) + i
                                    return (
                                        <button key={pageNum} onClick={() => setCurrentPage(pageNum)}
                                            className="w-8 h-8 rounded-lg text-sm font-medium transition-colors"
                                            style={{
                                                background: currentPage === pageNum ? 'var(--accent)' : 'transparent',
                                                color: currentPage === pageNum ? '#fff' : 'var(--text-muted)',
                                            }}>
                                            {pageNum + 1}
                                        </button>
                                    )
                                })}
                                <button onClick={() => setCurrentPage((p) => Math.min(totalPages - 1, p + 1))}
                                    disabled={currentPage === totalPages - 1}
                                    className="p-1.5 rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                                    style={{ color: 'var(--text-muted)' }}>
                                    <ChevronRight size={16} />
                                </button>
                            </div>
                        )}
                    </div>
                </main>
            </div>

            {/* ── 생성/수정 모달 ── */}
            {(modalType === 'create' || modalType === 'edit') && (
                <div className="fixed inset-0 flex items-center justify-center z-50 p-4"
                    style={{ background: 'rgba(0,0,0,0.5)' }}>
                    <div className="rounded-2xl shadow-2xl w-full max-w-md"
                        style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
                        <div className="flex items-center justify-between px-6 py-4"
                            style={{ borderBottom: '1px solid var(--border)' }}>
                            <h3 className="font-semibold" style={{ color: 'var(--text-primary)' }}>
                                {modalType === 'create' ? '사용자 추가' : '사용자 수정'}
                            </h3>
                            <button onClick={closeModal} className="p-1 rounded-lg transition-colors"
                                style={{ color: 'var(--text-faint)' }}>
                                <X size={18} />
                            </button>
                        </div>

                        <div className="px-6 py-5 space-y-4">
                            {formError && (
                                <div className="px-4 py-3 rounded-lg text-sm"
                                    style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', color: '#ef4444' }}>
                                    {formError}
                                </div>
                            )}

                            {[
                                { label: '아이디', key: 'userId', type: 'text', placeholder: '아이디 입력 (3~50자)', required: true,
                                  disabled: modalType === 'edit', note: modalType === 'edit' ? ' (변경 불가)' : undefined },
                                { label: '성명', key: 'userName', type: 'text', placeholder: '성명 입력 (최대 50자)', required: false },
                                { label: '닉네임', key: 'nickname', type: 'text', placeholder: '닉네임 입력 (최대 30자)', required: false },
                                { label: '이메일', key: 'email', type: 'email', placeholder: '이메일 입력', required: false },
                                { label: '비밀번호', key: 'password', type: 'password',
                                  placeholder: '비밀번호 입력 (최소 8자)',
                                  required: modalType === 'create',
                                  note: modalType === 'edit' ? ' (미입력 시 변경 안 함)' : undefined },
                            ].map(({ label, key, type, placeholder, required, disabled, note }) => (
                                <div key={key}>
                                    <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                                        {label}
                                        {required && <span style={{ color: '#ef4444' }}> *</span>}
                                        {note && <span style={{ color: 'var(--text-faint)', fontWeight: 400 }}>{note}</span>}
                                        {!required && !note && <span style={{ color: 'var(--text-faint)', fontWeight: 400 }}> (선택)</span>}
                                    </label>
                                    <input
                                        type={type}
                                        value={form[key as keyof UserFormState]}
                                        onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                                        disabled={disabled}
                                        placeholder={placeholder}
                                        className="w-full px-3 py-2.5 text-sm focus:outline-none disabled:cursor-not-allowed"
                                        style={{
                                            ...inputStyle,
                                            opacity: disabled ? 0.5 : 1,
                                        }}
                                    />
                                </div>
                            ))}

                            <div>
                                <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                                    역할 <span style={{ color: '#ef4444' }}>*</span>
                                </label>
                                <select
                                    value={form.role}
                                    onChange={(e) => handleRoleChange(e.target.value as Role)}
                                    className="w-full px-3 py-2.5 text-sm focus:outline-none"
                                    style={inputStyle}
                                >
                                    {ROLE_OPTIONS.map((r) => (
                                        <option key={r.value} value={r.value}>{r.label}</option>
                                    ))}
                                </select>
                            </div>

                            {permissions && permissions.length > 0 && (
                                <div>
                                    <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                                        세부 권한 <span style={{ color: '#ef4444' }}>*</span>
                                    </label>
                                    <select
                                        value={form.permission}
                                        onChange={(e) => setForm({ ...form, permission: e.target.value as Permission })}
                                        className="w-full px-3 py-2.5 text-sm focus:outline-none"
                                        style={inputStyle}
                                    >
                                        {permissions.map((p) => (
                                            <option key={p.value} value={p.value}>{p.label}</option>
                                        ))}
                                    </select>
                                </div>
                            )}

                            {form.role === 'SUPER_ADMIN' && (
                                <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg text-xs"
                                    style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.15)', color: '#ef4444' }}>
                                    <ShieldAlert size={14} />
                                    슈퍼관리자는 모든 기능에 접근 가능하며 세부 권한이 없습니다.
                                </div>
                            )}
                        </div>

                        <div className="flex gap-3 px-6 py-4" style={{ borderTop: '1px solid var(--border)' }}>
                            <button onClick={closeModal}
                                className="flex-1 px-4 py-2.5 text-sm font-medium rounded-lg transition-colors"
                                style={{ background: 'var(--bg-hover)', color: 'var(--text-secondary)' }}>
                                취소
                            </button>
                            <button onClick={modalType === 'create' ? handleCreate : handleUpdate}
                                disabled={submitting}
                                className="flex-1 px-4 py-2.5 text-sm font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                style={{ background: 'var(--accent)', color: '#fff' }}>
                                {submitting ? '처리 중...' : modalType === 'create' ? '추가' : '저장'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── 일괄 삭제 모달 ── */}
            {modalType === 'batch-delete' && (
                <div className="fixed inset-0 flex items-center justify-center z-50 p-4"
                    style={{ background: 'rgba(0,0,0,0.5)' }}>
                    <div className="rounded-2xl shadow-2xl w-full max-w-sm"
                        style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
                        <div className="px-6 pt-6 pb-4 text-center">
                            <div className="w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4"
                                style={{ background: 'rgba(239,68,68,0.12)' }}>
                                <Trash size={22} style={{ color: '#ef4444' }} />
                            </div>
                            <h3 className="font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>선택 사용자 삭제</h3>
                            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                                선택한 <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>{selectedIds.size}명</span>의 사용자를
                                <br />정말 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.
                            </p>
                            {formError && <p className="mt-3 text-xs" style={{ color: '#ef4444' }}>{formError}</p>}
                        </div>
                        <div className="flex gap-3 px-6 py-4" style={{ borderTop: '1px solid var(--border)' }}>
                            <button onClick={closeModal}
                                className="flex-1 px-4 py-2.5 text-sm font-medium rounded-lg transition-colors"
                                style={{ background: 'var(--bg-hover)', color: 'var(--text-secondary)' }}>
                                취소
                            </button>
                            <button onClick={handleBatchDelete} disabled={submitting}
                                className="flex-1 px-4 py-2.5 text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
                                style={{ background: '#ef4444', color: '#fff' }}>
                                {submitting ? '삭제 중...' : `${selectedIds.size}명 삭제`}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── 단건 삭제 모달 ── */}
            {modalType === 'delete' && selectedUser && (
                <div className="fixed inset-0 flex items-center justify-center z-50 p-4"
                    style={{ background: 'rgba(0,0,0,0.5)' }}>
                    <div className="rounded-2xl shadow-2xl w-full max-w-sm"
                        style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
                        <div className="px-6 pt-6 pb-4 text-center">
                            <div className="w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4"
                                style={{ background: 'rgba(239,68,68,0.12)' }}>
                                <Trash2 size={22} style={{ color: '#ef4444' }} />
                            </div>
                            <h3 className="font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>사용자 삭제</h3>
                            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                                <span className="font-medium" style={{ color: 'var(--text-primary)' }}>{selectedUser.userId}</span> 사용자를
                                <br />정말 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.
                            </p>
                            {formError && <p className="mt-3 text-xs" style={{ color: '#ef4444' }}>{formError}</p>}
                        </div>
                        <div className="flex gap-3 px-6 py-4" style={{ borderTop: '1px solid var(--border)' }}>
                            <button onClick={closeModal}
                                className="flex-1 px-4 py-2.5 text-sm font-medium rounded-lg transition-colors"
                                style={{ background: 'var(--bg-hover)', color: 'var(--text-secondary)' }}>
                                취소
                            </button>
                            <button onClick={handleDelete} disabled={submitting}
                                className="flex-1 px-4 py-2.5 text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
                                style={{ background: '#ef4444', color: '#fff' }}>
                                {submitting ? '삭제 중...' : '삭제'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
