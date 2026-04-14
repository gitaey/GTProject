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
    Gamepad2,
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

/* ────────── API 함수 ────────── */
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
    apiFetch<User>('/api/users', {
        method: 'POST',
        body: JSON.stringify(data),
    })

const updateUser = (userId: string, data: UserUpdateRequest) =>
    apiFetch<User>(`/api/users/${userId}`, {
        method: 'PUT',
        body: JSON.stringify(data),
    })

const toggleStatus = (userId: string) =>
    apiFetch<User>(`/api/users/${userId}/status`, { method: 'PATCH' })

const deleteUser = (userId: string) =>
    apiFetch<void>(`/api/users/${userId}`, { method: 'DELETE' })

const batchDeleteUsers = (ids: string[]) =>
    apiFetch<string>('/api/users/batch', {
        method: 'DELETE',
        body: JSON.stringify({ ids }),
    })

/* ────────── 초기 폼 상태 ────────── */
const EMPTY_FORM: UserFormState = {
    userId:     '',
    userName:   '',
    nickname:   '',
    email:      '',
    password:   '',
    role:       'USER',
    permission: 'USER_PERMISSION_1',
}

/* ────────── 역할 아이콘 ────────── */
function RoleIcon({ role }: { role: Role }) {
    if (role === 'SUPER_ADMIN') return <ShieldAlert size={11} />
    if (role === 'LOSTARK') return <Gamepad2 size={11} />
    return <UserIcon size={11} />
}

const ROLE_COLOR: Record<Role, string> = {
    SUPER_ADMIN: 'bg-red-100 text-red-700',
    USER:        'bg-gray-100 text-gray-600',
    LOSTARK:     'bg-indigo-100 text-indigo-700',
}

function RoleBadge({ role, roleLabel }: { role: Role; roleLabel: string }) {
    return (
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${ROLE_COLOR[role]}`}>
            <RoleIcon role={role} />
            {roleLabel}
        </span>
    )
}

function StatusBadge({ status }: { status: UserStatus }) {
    return status === 'ACTIVE' ? (
        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-700">
            <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full" />활성
        </span>
    ) : (
        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-400">
            <span className="w-1.5 h-1.5 bg-gray-300 rounded-full" />비활성
        </span>
    )
}

function formatDate(iso: string | null) {
    if (!iso) return '-'
    return new Date(iso).toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' })
}

/* ────────── 메인 페이지 ────────── */
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

    /* 체크박스 */
    const isAllChecked = users.length > 0 && users.every((u) => selectedIds.has(u.userId))
    const isIndeterminate = users.some((u) => selectedIds.has(u.userId)) && !isAllChecked

    const toggleAll = () => {
        if (isAllChecked) {
            setSelectedIds((prev) => {
                const next = new Set(prev)
                users.forEach((u) => next.delete(u.userId))
                return next
            })
        } else {
            setSelectedIds((prev) => {
                const next = new Set(prev)
                users.forEach((u) => next.add(u.userId))
                return next
            })
        }
    }

    const toggleOne = (userId: string) => {
        setSelectedIds((prev) => {
            const next = new Set(prev)
            next.has(userId) ? next.delete(userId) : next.add(userId)
            return next
        })
    }

    /* 목록 불러오기 */
    const load = useCallback(async () => {
        abortRef.current?.abort()
        abortRef.current = new AbortController()

        setLoading(true)
        setError(null)
        try {
            const params: Record<string, string> = { page: String(currentPage), size: '10' }
            if (keyword)      params.keyword = keyword
            if (roleFilter)   params.role    = roleFilter
            if (statusFilter) params.status  = statusFilter
            setPage(await fetchUsers(params))
        } catch (e) {
            if (e instanceof Error && e.name !== 'AbortError') {
                setError('사용자 목록을 불러오는데 실패했습니다.')
            }
        } finally {
            setLoading(false)
        }
    }, [keyword, roleFilter, statusFilter, currentPage])

    useEffect(() => { load() }, [load])

    /* 역할 변경 시 세부 권한 초기화 */
    const handleRoleChange = (role: Role) => {
        const permissions = PERMISSION_MAP[role]
        setForm((f) => ({
            ...f,
            role,
            permission: permissions ? permissions[0].value : '',
        }))
    }

    /* 모달 */
    const openCreate = () => {
        setForm(EMPTY_FORM)
        setFormError(null)
        setModalType('create')
    }
    const openEdit = (user: User) => {
        setSelectedUser(user)
        setForm({
            userId:     user.userId,
            userName:   user.userName ?? '',
            nickname:   user.nickname ?? '',
            email:      user.email ?? '',
            password:   '',
            role:       user.role,
            permission: user.permission ?? '',
        })
        setFormError(null)
        setModalType('edit')
    }
    const openDelete = (user: User) => { setSelectedUser(user); setModalType('delete') }
    const closeModal = () => { setModalType(null); setSelectedUser(null); setFormError(null) }

    /* 생성 */
    const handleCreate = async () => {
        setSubmitting(true)
        setFormError(null)
        try {
            const req: UserCreateRequest = {
                userId:   form.userId,
                password: form.password,
                role:     form.role,
                ...(form.userName   && { userName:   form.userName }),
                ...(form.nickname   && { nickname:   form.nickname }),
                ...(form.email      && { email:      form.email }),
                ...(form.permission && { permission: form.permission as Permission }),
            }
            await createUser(req)
            closeModal()
            load()
        } catch (e) {
            setFormError(e instanceof Error ? e.message : '생성에 실패했습니다.')
        } finally {
            setSubmitting(false)
        }
    }

    /* 수정 */
    const handleUpdate = async () => {
        if (!selectedUser) return
        setSubmitting(true)
        setFormError(null)
        try {
            const req: UserUpdateRequest = {
                role:     form.role,
                ...(form.userName   && { userName:   form.userName }),
                ...(form.nickname   && { nickname:   form.nickname }),
                ...(form.email      && { email:      form.email }),
                ...(form.permission && { permission: form.permission as Permission }),
                ...(form.password   && { password:   form.password }),
            }
            await updateUser(selectedUser.userId, req)
            closeModal()
            load()
        } catch (e) {
            setFormError(e instanceof Error ? e.message : '수정에 실패했습니다.')
        } finally {
            setSubmitting(false)
        }
    }

    /* 단건 삭제 */
    const handleDelete = async () => {
        if (!selectedUser) return
        setSubmitting(true)
        try {
            await deleteUser(selectedUser.userId)
            setSelectedIds((prev) => { const next = new Set(prev); next.delete(selectedUser.userId); return next })
            closeModal()
            load()
        } catch (e) {
            setFormError(e instanceof Error ? e.message : '삭제에 실패했습니다.')
        } finally {
            setSubmitting(false)
        }
    }

    /* 일괄 삭제 */
    const handleBatchDelete = async () => {
        setSubmitting(true)
        try {
            await batchDeleteUsers(Array.from(selectedIds))
            setSelectedIds(new Set())
            closeModal()
            load()
        } catch (e) {
            setFormError(e instanceof Error ? e.message : '일괄 삭제에 실패했습니다.')
        } finally {
            setSubmitting(false)
        }
    }

    /* 상태 토글 */
    const handleToggle = async (user: User) => {
        try {
            await toggleStatus(user.userId)
            load()
        } catch (e) {
            setError(e instanceof Error ? e.message : '상태 변경에 실패했습니다.')
        }
    }

    return (
        <div className="flex min-h-screen bg-gray-50">
            <Sidebar />
            <div className="flex-1 flex flex-col min-w-0">
                <Header title="사용자 관리" breadcrumb={['관리자', '사용자 관리']} />

                <main className="flex-1 p-6 space-y-4">
                    {/* 툴바 */}
                    <div className="flex flex-wrap items-center gap-3">
                        <div className="relative flex-1 min-w-48">
                            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                            <input
                                type="text"
                                placeholder="아이디, 닉네임 또는 이메일 검색..."
                                value={keyword}
                                onChange={(e) => setKeyword(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && setCurrentPage(0)}
                                className="w-full pl-9 pr-4 py-2 text-sm bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400"
                            />
                        </div>

                        <select
                            value={roleFilter}
                            onChange={(e) => { setRoleFilter(e.target.value); setCurrentPage(0) }}
                            className="px-3 py-2 text-sm bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/30 text-gray-600"
                        >
                            <option value="">전체 역할</option>
                            {ROLE_OPTIONS.map((r) => (
                                <option key={r.value} value={r.value}>{r.label}</option>
                            ))}
                        </select>

                        <select
                            value={statusFilter}
                            onChange={(e) => { setStatusFilter(e.target.value); setCurrentPage(0) }}
                            className="px-3 py-2 text-sm bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/30 text-gray-600"
                        >
                            <option value="">전체 상태</option>
                            <option value="ACTIVE">활성</option>
                            <option value="INACTIVE">비활성</option>
                        </select>

                        <div className="flex items-center gap-2 ml-auto">
                            {/* 일괄 삭제 버튼 - 선택된 항목이 있을 때만 표시 */}
                            {selectedIds.size > 0 && (
                                <button
                                    onClick={() => { setFormError(null); setModalType('batch-delete') }}
                                    className="flex items-center gap-2 px-4 py-2 bg-red-500 text-white text-sm font-medium rounded-lg hover:bg-red-600 transition-colors"
                                >
                                    <Trash size={15} />
                                    선택 삭제 ({selectedIds.size}명)
                                </button>
                            )}
                            <button
                                onClick={openCreate}
                                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
                            >
                                <UserPlus size={15} />
                                사용자 추가
                            </button>
                        </div>
                    </div>

                    {/* 에러 배너 */}
                    {error && (
                        <div className="px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600 flex items-center justify-between">
                            {error}
                            <button onClick={() => setError(null)}><X size={14} /></button>
                        </div>
                    )}

                    {/* 테이블 */}
                    <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
                        <div className="px-6 py-3 border-b border-gray-100 flex items-center justify-between">
                            <span className="text-sm text-gray-500">
                                총 <span className="font-semibold text-gray-800">{page?.totalElements ?? 0}</span>명
                            </span>
                            {selectedIds.size > 0 && (
                                <span className="text-xs text-blue-600 font-medium">
                                    {selectedIds.size}명 선택됨
                                </span>
                            )}
                        </div>

                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="bg-gray-50 border-b border-gray-100">
                                        <th className="px-4 py-3 w-10">
                                            <input
                                                type="checkbox"
                                                checked={isAllChecked}
                                                ref={(el) => { if (el) el.indeterminate = isIndeterminate }}
                                                onChange={toggleAll}
                                                className="w-4 h-4 rounded border-gray-300 text-blue-600 cursor-pointer"
                                            />
                                        </th>
                                        <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide w-12">No.</th>
                                        <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">아이디</th>
                                        <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">닉네임</th>
                                        <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">이메일</th>
                                        <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">역할</th>
                                        <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">세부 권한</th>
                                        <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">상태</th>
                                        <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">마지막 로그인</th>
                                        <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">가입일</th>
                                        <th className="text-center px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">관리</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-50">
                                    {loading ? (
                                        <tr>
                                            <td colSpan={11} className="text-center py-16 text-gray-400">
                                                <div className="flex flex-col items-center gap-2">
                                                    <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                                                    <span className="text-sm">불러오는 중...</span>
                                                </div>
                                            </td>
                                        </tr>
                                    ) : users.length === 0 ? (
                                        <tr>
                                            <td colSpan={11} className="text-center py-16 text-gray-400 text-sm">
                                                등록된 사용자가 없습니다.
                                            </td>
                                        </tr>
                                    ) : (
                                        users.map((user, idx) => (
                                            <tr
                                                key={user.userId}
                                                className={`hover:bg-gray-50/60 transition-colors ${selectedIds.has(user.userId) ? 'bg-blue-50/50' : ''}`}
                                            >
                                                <td className="px-4 py-4">
                                                    <input
                                                        type="checkbox"
                                                        checked={selectedIds.has(user.userId)}
                                                        onChange={() => toggleOne(user.userId)}
                                                        className="w-4 h-4 rounded border-gray-300 text-blue-600 cursor-pointer"
                                                    />
                                                </td>
                                                <td className="px-4 py-4 text-gray-400 text-xs">{currentPage * 10 + idx + 1}</td>
                                                <td className="px-6 py-4 font-medium text-gray-800">{user.userId}</td>
                                                <td className="px-6 py-4 text-gray-600">{user.nickname ?? '-'}</td>
                                                <td className="px-6 py-4 text-gray-500">{user.email ?? '-'}</td>
                                                <td className="px-6 py-4">
                                                    <RoleBadge role={user.role} roleLabel={user.roleLabel} />
                                                </td>
                                                <td className="px-6 py-4 text-gray-500 text-xs">
                                                    {user.permissionLabel ?? '-'}
                                                </td>
                                                <td className="px-6 py-4"><StatusBadge status={user.status} /></td>
                                                <td className="px-6 py-4 text-gray-400 text-xs">{formatDate(user.lastLoginAt)}</td>
                                                <td className="px-6 py-4 text-gray-400 text-xs">{formatDate(user.createdAt)}</td>
                                                <td className="px-6 py-4">
                                                    <div className="flex items-center justify-center gap-1">
                                                        <button
                                                            onClick={() => handleToggle(user)}
                                                            title={user.status === 'ACTIVE' ? '비활성화' : '활성화'}
                                                            className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors"
                                                        >
                                                            {user.status === 'ACTIVE'
                                                                ? <ToggleRight size={18} className="text-emerald-500" />
                                                                : <ToggleLeft size={18} className="text-gray-300" />
                                                            }
                                                        </button>
                                                        <button
                                                            onClick={() => openEdit(user)}
                                                            title="수정"
                                                            className="p-1.5 rounded-lg hover:bg-blue-50 text-gray-400 hover:text-blue-600 transition-colors"
                                                        >
                                                            <Pencil size={15} />
                                                        </button>
                                                        <button
                                                            onClick={() => openDelete(user)}
                                                            title="삭제"
                                                            className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors"
                                                        >
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
                            <div className="flex items-center justify-center gap-2 px-6 py-4 border-t border-gray-100">
                                <button
                                    onClick={() => setCurrentPage((p) => Math.max(0, p - 1))}
                                    disabled={currentPage === 0}
                                    className="p-1.5 rounded-lg hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                                >
                                    <ChevronLeft size={16} />
                                </button>
                                {Array.from({ length: Math.min(totalPages, 10) }, (_, i) => {
                                    const pageNum = Math.max(0, Math.min(currentPage - 4, totalPages - 10)) + i
                                    return (
                                        <button
                                            key={pageNum}
                                            onClick={() => setCurrentPage(pageNum)}
                                            className={`w-8 h-8 rounded-lg text-sm font-medium transition-colors
                                                ${currentPage === pageNum ? 'bg-blue-600 text-white' : 'hover:bg-gray-100 text-gray-600'}`}
                                        >
                                            {pageNum + 1}
                                        </button>
                                    )
                                })}
                                <button
                                    onClick={() => setCurrentPage((p) => Math.min(totalPages - 1, p + 1))}
                                    disabled={currentPage === totalPages - 1}
                                    className="p-1.5 rounded-lg hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                                >
                                    <ChevronRight size={16} />
                                </button>
                            </div>
                        )}
                    </div>
                </main>
            </div>

            {/* ────────── 생성/수정 모달 ────────── */}
            {(modalType === 'create' || modalType === 'edit') && (
                <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
                        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
                            <h3 className="font-semibold text-gray-800">
                                {modalType === 'create' ? '사용자 추가' : '사용자 수정'}
                            </h3>
                            <button onClick={closeModal} className="p-1 rounded-lg hover:bg-gray-100 text-gray-400 transition-colors">
                                <X size={18} />
                            </button>
                        </div>

                        <div className="px-6 py-5 space-y-4">
                            {formError && (
                                <div className="px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">
                                    {formError}
                                </div>
                            )}

                            {/* 아이디 */}
                            <div>
                                <label className="block text-xs font-medium text-gray-600 mb-1.5">
                                    아이디 <span className="text-red-400">*</span>
                                    {modalType === 'edit' && <span className="text-gray-400 font-normal"> (변경 불가)</span>}
                                </label>
                                <input
                                    type="text"
                                    value={form.userId}
                                    onChange={(e) => setForm({ ...form, userId: e.target.value })}
                                    disabled={modalType === 'edit'}
                                    placeholder="아이디 입력 (3~50자)"
                                    className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 disabled:bg-gray-50 disabled:text-gray-400 disabled:cursor-not-allowed"
                                />
                            </div>

                            {/* 성명 (선택) */}
                            <div>
                                <label className="block text-xs font-medium text-gray-600 mb-1.5">
                                    성명 <span className="text-gray-400 font-normal">(선택)</span>
                                </label>
                                <input
                                    type="text"
                                    value={form.userName}
                                    onChange={(e) => setForm({ ...form, userName: e.target.value })}
                                    placeholder="성명 입력 (최대 50자)"
                                    maxLength={50}
                                    className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400"
                                />
                            </div>

                            {/* 닉네임 (선택) */}
                            <div>
                                <label className="block text-xs font-medium text-gray-600 mb-1.5">
                                    닉네임 <span className="text-gray-400 font-normal">(선택)</span>
                                </label>
                                <input
                                    type="text"
                                    value={form.nickname}
                                    onChange={(e) => setForm({ ...form, nickname: e.target.value })}
                                    placeholder="닉네임 입력 (최대 30자)"
                                    maxLength={30}
                                    className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400"
                                />
                            </div>

                            {/* 이메일 (선택) */}
                            <div>
                                <label className="block text-xs font-medium text-gray-600 mb-1.5">
                                    이메일 <span className="text-gray-400 font-normal">(선택)</span>
                                </label>
                                <input
                                    type="email"
                                    value={form.email}
                                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                                    placeholder="이메일 입력"
                                    className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400"
                                />
                            </div>

                            {/* 비밀번호 */}
                            <div>
                                <label className="block text-xs font-medium text-gray-600 mb-1.5">
                                    비밀번호
                                    {modalType === 'create' && <span className="text-red-400"> *</span>}
                                    {modalType === 'edit' && <span className="text-gray-400 font-normal"> (미입력 시 변경 안 함)</span>}
                                </label>
                                <input
                                    type="password"
                                    value={form.password}
                                    onChange={(e) => setForm({ ...form, password: e.target.value })}
                                    placeholder="비밀번호 입력 (최소 8자)"
                                    className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400"
                                />
                            </div>

                            {/* 역할 */}
                            <div>
                                <label className="block text-xs font-medium text-gray-600 mb-1.5">
                                    역할 <span className="text-red-400">*</span>
                                </label>
                                <select
                                    value={form.role}
                                    onChange={(e) => handleRoleChange(e.target.value as Role)}
                                    className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 bg-white"
                                >
                                    {ROLE_OPTIONS.map((r) => (
                                        <option key={r.value} value={r.value}>{r.label}</option>
                                    ))}
                                </select>
                            </div>

                            {/* 세부 권한 (SUPER_ADMIN 제외) */}
                            {permissions && permissions.length > 0 && (
                                <div>
                                    <label className="block text-xs font-medium text-gray-600 mb-1.5">
                                        세부 권한 <span className="text-red-400">*</span>
                                    </label>
                                    <select
                                        value={form.permission}
                                        onChange={(e) => setForm({ ...form, permission: e.target.value as Permission })}
                                        className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 bg-white"
                                    >
                                        {permissions.map((p) => (
                                            <option key={p.value} value={p.value}>{p.label}</option>
                                        ))}
                                    </select>
                                </div>
                            )}

                            {/* SUPER_ADMIN 안내 */}
                            {form.role === 'SUPER_ADMIN' && (
                                <div className="flex items-center gap-2 px-3 py-2.5 bg-red-50 border border-red-100 rounded-lg text-xs text-red-600">
                                    <ShieldAlert size={14} />
                                    슈퍼관리자는 모든 기능에 접근 가능하며 세부 권한이 없습니다.
                                </div>
                            )}
                        </div>

                        <div className="flex gap-3 px-6 py-4 border-t border-gray-100">
                            <button
                                onClick={closeModal}
                                className="flex-1 px-4 py-2.5 text-sm font-medium text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
                            >
                                취소
                            </button>
                            <button
                                onClick={modalType === 'create' ? handleCreate : handleUpdate}
                                disabled={submitting}
                                className="flex-1 px-4 py-2.5 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                            >
                                {submitting ? '처리 중...' : modalType === 'create' ? '추가' : '저장'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ────────── 일괄 삭제 확인 모달 ────────── */}
            {modalType === 'batch-delete' && (
                <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm">
                        <div className="px-6 pt-6 pb-4 text-center">
                            <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                                <Trash size={22} className="text-red-500" />
                            </div>
                            <h3 className="font-semibold text-gray-800 mb-2">선택 사용자 삭제</h3>
                            <p className="text-sm text-gray-500">
                                선택한 <span className="font-semibold text-gray-700">{selectedIds.size}명</span>의 사용자를
                                <br />정말 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.
                            </p>
                            {formError && (
                                <p className="mt-3 text-xs text-red-500">{formError}</p>
                            )}
                        </div>
                        <div className="flex gap-3 px-6 py-4 border-t border-gray-100">
                            <button
                                onClick={closeModal}
                                className="flex-1 px-4 py-2.5 text-sm font-medium text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
                            >
                                취소
                            </button>
                            <button
                                onClick={handleBatchDelete}
                                disabled={submitting}
                                className="flex-1 px-4 py-2.5 text-sm font-medium text-white bg-red-500 rounded-lg hover:bg-red-600 disabled:opacity-50 transition-colors"
                            >
                                {submitting ? '삭제 중...' : `${selectedIds.size}명 삭제`}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ────────── 삭제 확인 모달 ────────── */}
            {modalType === 'delete' && selectedUser && (
                <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm">
                        <div className="px-6 pt-6 pb-4 text-center">
                            <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                                <Trash2 size={22} className="text-red-500" />
                            </div>
                            <h3 className="font-semibold text-gray-800 mb-2">사용자 삭제</h3>
                            <p className="text-sm text-gray-500">
                                <span className="font-medium text-gray-700">{selectedUser.userId}</span> 사용자를
                                <br />정말 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.
                            </p>
                            {formError && (
                                <p className="mt-3 text-xs text-red-500">{formError}</p>
                            )}
                        </div>
                        <div className="flex gap-3 px-6 py-4 border-t border-gray-100">
                            <button
                                onClick={closeModal}
                                className="flex-1 px-4 py-2.5 text-sm font-medium text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
                            >
                                취소
                            </button>
                            <button
                                onClick={handleDelete}
                                disabled={submitting}
                                className="flex-1 px-4 py-2.5 text-sm font-medium text-white bg-red-500 rounded-lg hover:bg-red-600 disabled:opacity-50 transition-colors"
                            >
                                {submitting ? '삭제 중...' : '삭제'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
