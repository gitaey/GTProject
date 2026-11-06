'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
    clearSession, GeoServerConnectionLostError, gsFetch, readSession, writeSession,
    type ConnectionInfo, type ConnectionStatus, type StoredConnection,
} from './connection'

export type ConnState = 'checking' | 'none' | 'connected' | 'expired'

export interface GeoServerConnectionValue {
    state: ConnState
    status: ConnectionStatus | null
    /** 탭에 남은 연결 정보(번호표 포함, 비밀번호 없음). 만료된 뒤에도 이 화면이 열려 있는 동안은 남아 다시 연결에 쓴다 */
    stored: StoredConnection | null
    /** 표시용 — 서버 상태가 있으면 그것, 없으면 탭에 남은 값 */
    info: ConnectionInfo | null
    lostMessage: string | null
    markLost: (message: string) => void
    setConnected: (token: string, status: ConnectionStatus) => void
    disconnect: () => Promise<void>
}

/**
 * 연결 상태 훅. 마운트 때 번호표가 없으면 요청 0, 있으면 GET /api/geoserver/connection 한 번.
 * (sessionStorage는 렌더 중이 아니라 effect에서 읽는다 — 하이드레이션)
 */
export function useGeoServerConnection(): GeoServerConnectionValue {
    const [state, setState] = useState<ConnState>('checking')
    const [status, setStatus] = useState<ConnectionStatus | null>(null)
    const [stored, setStored] = useState<StoredConnection | null>(null)
    const [lostMessage, setLostMessage] = useState<string | null>(null)

    useEffect(() => {
        let cancelled = false
        const session = readSession()
        if (!session) {
            setState('none')
            return
        }
        setStored(session)
        gsFetch<ConnectionStatus>('/api/geoserver/connection')
            .then(s => {
                if (cancelled) return
                setStatus(s)
                setState('connected')
            })
            .catch(e => {
                if (cancelled) return
                setLostMessage(e instanceof Error ? e.message : null)
                setState(e instanceof GeoServerConnectionLostError ? 'expired' : 'none')
            })
        return () => { cancelled = true }
    }, [])

    const markLost = useCallback((message: string) => {
        setLostMessage(message)
        setState('expired')
    }, [])

    const setConnected = useCallback((token: string, s: ConnectionStatus) => {
        writeSession(token, s)
        setStored(readSession())
        setStatus(s)
        setLostMessage(null)
        setState('connected')
    }, [])

    const disconnect = useCallback(async () => {
        try {
            await gsFetch<null>('/api/geoserver/connection', { method: 'DELETE' })
        } catch {
            // 서버 쪽은 만료로 사라진다 — 브라우저 쪽은 어쨌든 지운다
        }
        clearSession()
        setStatus(null)
        setStored(null)
        setLostMessage(null)
        setState('none')
    }, [])

    const info = useMemo<ConnectionInfo | null>(() => {
        const src = status ?? stored
        return src ? { url: src.url, username: src.username, version: src.version, insecureTls: src.insecureTls } : null
    }, [status, stored])

    return useMemo(
        () => ({ state, status, stored, info, lostMessage, markLost, setConnected, disconnect }),
        [state, status, stored, info, lostMessage, markLost, setConnected, disconnect],
    )
}
