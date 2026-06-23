export type Role = 'SUPER_ADMIN' | 'MAP_ADMIN' | 'MAP_USER'
export type UserStatus = 'ACTIVE' | 'INACTIVE'

export type Permission =
    | 'VIEWER'
    | 'DEPT_A'
    | 'DEPT_B'

export interface RoleOption {
    value: Role
    label: string
}

export interface PermissionOption {
    value: Permission
    label: string
}

/* 역할 목록 */
export const ROLE_OPTIONS: RoleOption[] = [
    { value: 'SUPER_ADMIN', label: '슈퍼관리자' },
    { value: 'MAP_ADMIN',   label: '지도관리자' },
    { value: 'MAP_USER',    label: '지도사용자' },
]

/* 역할별 세부 권한 목록 (MAP_USER 전용) */
export const PERMISSION_MAP: Partial<Record<Role, PermissionOption[]>> = {
    MAP_USER: [
        { value: 'VIEWER', label: '뷰어' },
        { value: 'DEPT_A', label: '부서A' },
        { value: 'DEPT_B', label: '부서B' },
    ],
}

export interface User {
    userId: string
    userName: string | null
    nickname: string | null
    email: string | null
    role: Role
    roleLabel: string
    permission: Permission | null
    permissionLabel: string | null
    status: UserStatus
    lastLoginAt: string | null
    createdAt: string
    updatedAt: string
}

export interface ApiResponse<T> {
    success: boolean
    message: string
    data: T
}

export interface UserPage {
    content: User[]
    totalElements: number
    totalPages: number
    number: number
    size: number
}

export interface UserFormState {
    userId: string
    userName: string
    nickname: string
    email: string
    password: string
    role: Role
    permission: Permission | ''
}

export interface UserCreateRequest {
    userId: string
    userName?: string
    nickname?: string
    email?: string
    password: string
    role: Role
    permission?: Permission
}

export interface UserUpdateRequest {
    userName?: string
    nickname?: string
    email?: string
    role: Role
    permission?: Permission
    password?: string
}
