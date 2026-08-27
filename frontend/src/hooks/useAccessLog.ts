import { useCallback } from 'react'
import { getToken } from '@/stores/authStore'

export function useAccessLog() {
    const logAccess = useCallback(async (path: string, pageTitle: string) => {
        const token = getToken()
        if (!token) return

        try {
            await fetch('/api/access-log', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({ path, pageTitle }),
            })
        } catch {
            // 로그 전송 실패는 무시
        }
    }, [])

    return { logAccess }
}
