'use client'

import { useEffect } from 'react'
import { useAuthStore } from '@/stores/authStore'
import { useMenuStore } from '@/stores/menuStore'

export default function MenuLoader() {
    const user = useAuthStore((s) => s.user)
    const fetchMenus = useMenuStore((s) => s.fetchMenus)
    const clearMenus = useMenuStore((s) => s.clearMenus)

    useEffect(() => {
        if (user) {
            fetchMenus(user.role, user.permission)
        } else {
            clearMenus()
        }
    }, [user, fetchMenus, clearMenus])

    return null
}
