import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'

export interface AuthUser {
    userId: string
    userName: string | null
    nickname: string | null
    role: string
    roleLabel: string
}

interface AuthState {
    user: AuthUser | null
    token: string | null
    setAuth: (user: AuthUser, token: string) => void
    clearAuth: () => void
}

export const useAuthStore = create<AuthState>()(
    persist(
        (set) => ({
            user: null,
            token: null,

            setAuth: (user, token) => {
                /* Next.js 미들웨어에서 읽을 수 있도록 쿠키에도 저장 */
                document.cookie = `token=${token}; path=/; max-age=86400; SameSite=Lax`
                set({ user, token })
            },

            clearAuth: () => {
                document.cookie = 'token=; path=/; max-age=0'
                set({ user: null, token: null })
            },
        }),
        {
            name: 'gtp-auth',
            storage: createJSONStorage(() => localStorage),
        }
    )
)

/* API 호출용 토큰 getter (SSR 안전) */
export function getToken(): string | null {
    if (typeof window === 'undefined') return null
    try {
        const raw = localStorage.getItem('gtp-auth')
        if (!raw) return null
        return JSON.parse(raw)?.state?.token ?? null
    } catch {
        return null
    }
}
