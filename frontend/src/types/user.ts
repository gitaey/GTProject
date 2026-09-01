export type Role = string
export type UserStatus = 'ACTIVE' | 'INACTIVE'

export type Permission = string

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
