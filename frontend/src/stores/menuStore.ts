import { create } from 'zustand'
import { getToken } from './authStore'

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8080'

interface MenuStoreState {
    allowedMenus: Set<string>
    loaded: boolean
    fetchMenus: (role: string, permission: string | null) => Promise<void>
    clearMenus: () => void
    isAllowed: (menuId: string) => boolean
}

export const useMenuStore = create<MenuStoreState>((set, get) => ({
    allowedMenus: new Set(),
    loaded: false,

    fetchMenus: async (role, permission) => {
        const token = getToken()
        if (!token) return
        const params = new URLSearchParams({ role })
        if (permission) params.set('permission', permission)
        const res = await fetch(`${API}/api/menu-visibility?${params}`, {
            headers: { Authorization: `Bearer ${token}` },
        })
        const json = await res.json()
        if (json.success) {
            set({ allowedMenus: new Set(json.data.menuIds), loaded: true })
        }
    },

    clearMenus: () => set({ allowedMenus: new Set(), loaded: false }),

    isAllowed: (menuId) => get().allowedMenus.has(menuId),
}))
