export type Role = 'SUPER_ADMIN' | 'USER' | 'LOSTARK'
export type UserStatus = 'ACTIVE' | 'INACTIVE'

export type Permission =
    | 'USER_PERMISSION_1'
    | 'USER_PERMISSION_2'
    | 'USER_PERMISSION_3'
    | 'LOSTARK_OPERATOR'
    | 'LOSTARK_GUILD'
    | 'LOSTARK_GUEST'

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
    { value: 'USER',        label: '일반 사용자' },
    { value: 'LOSTARK',     label: '로스트아크' },
]

/* 역할별 세부 권한 목록 */
export const PERMISSION_MAP: Partial<Record<Role, PermissionOption[]>> = {
    USER: [
        { value: 'USER_PERMISSION_1', label: '권한1' },
        { value: 'USER_PERMISSION_2', label: '권한2' },
        { value: 'USER_PERMISSION_3', label: '권한3' },
    ],
    LOSTARK: [
        { value: 'LOSTARK_OPERATOR', label: '운영진' },
        { value: 'LOSTARK_GUILD',    label: '길드원' },
        { value: 'LOSTARK_GUEST',    label: '손님' },
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
