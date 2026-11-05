'use client'

import { useCallback, useEffect, useState } from 'react'

export type ResourceStatus = 'loading' | 'success' | 'error'

export interface Resource<T> {
    status: ResourceStatus
    data: T | null
    error: string | null
    reload: () => void
}

interface SettledState<T> {
    /** 어느 요청(key + 다시 시도 횟수)의 결과인가 — 지금 요청과 다르면 아직 로딩 중으로 본다 */
    stamp: string
    status: 'success' | 'error'
    data: T | null
    error: string | null
}

/**
 * 한 가지 데이터를 불러와 loading / success / error 로 알려준다.
 * - key가 null이면 부르지 않는다(권한 확인 전 등).
 * - key나 loader가 바뀌거나 화면에서 사라지면 진행 중인 요청을 취소(abort)하고, 취소된 요청은 상태로 안 바꾼다.
 * - loader는 모듈 함수나 useCallback으로 넘길 것(참조가 바뀌면 다시 부른다).
 */
export function useResource<T>(key: string | null, loader: (signal: AbortSignal) => Promise<T>): Resource<T> {
    const [settled, setSettled] = useState<SettledState<T> | null>(null)
    const [attempt, setAttempt] = useState(0)

    const stamp = key === null ? null : `${key}#${attempt}`

    useEffect(() => {
        if (stamp === null) return
        const controller = new AbortController()
        loader(controller.signal).then(
            (data) => {
                if (controller.signal.aborted) return
                setSettled({ stamp, status: 'success', data, error: null })
            },
            (e: unknown) => {
                if (controller.signal.aborted) return
                const message = e instanceof Error && e.message ? e.message : '알 수 없는 오류'
                setSettled({ stamp, status: 'error', data: null, error: message })
            },
        )
        return () => controller.abort()
    }, [stamp, loader])

    const reload = useCallback(() => setAttempt((n) => n + 1), [])

    if (stamp === null || settled === null || settled.stamp !== stamp) {
        return { status: 'loading', data: null, error: null, reload }
    }
    return { status: settled.status, data: settled.data, error: settled.error, reload }
}
