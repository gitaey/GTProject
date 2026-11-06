'use client'

import { useEffect, useState } from 'react'
import { Plug, RefreshCw } from 'lucide-react'
import AttemptResult from './AttemptResult'
import PasswordField from './PasswordField'
import {
    requestConnection, serverLabel,
    type ConnectionAttempt, type ConnectionStatus, type StoredConnection,
} from './connection'

interface ReconnectDialogProps {
    /** 다시 연결할 서버(읽기 전용) — 주소·아이디·인증서 옵션은 바꿀 수 없다 */
    stored: StoredConnection
    onConnected: (token: string, status: ConnectionStatus) => void
    onClose: () => void
}

/** 만료된 연결을 같은 서버로 다시 잇는다 — 비밀번호만 받는다(다른 서버로 바꾸는 길을 막아 작업 내용이 엉뚱한 서버에 가지 않게) */
export default function ReconnectDialog({ stored, onConnected, onClose }: ReconnectDialogProps) {
    const [password, setPassword] = useState('')
    const [busy, setBusy] = useState(false)
    const [attempt, setAttempt] = useState<ConnectionAttempt | null>(null)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busy) onClose() }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
    }, [busy, onClose])

    const submit = async () => {
        if (busy || !password) return
        setBusy(true)
        setAttempt(null)
        setError(null)
        try {
            const result = await requestConnection(true, {
                url: stored.url, username: stored.username, password, insecureTls: stored.insecureTls,
            })
            if (result.ok && result.token && result.status) {
                onConnected(result.token, result.status)
                onClose()
                return
            }
            setAttempt(result)
        } catch (e) {
            setError(e instanceof Error ? e.message : '연결하지 못했습니다.')
        } finally {
            setPassword('')
            setBusy(false)
        }
    }

    return (
        <div className="fixed inset-0 z-50 flex items-start justify-center px-3 pt-[12vh]"
            style={{ background: 'rgba(0,0,0,0.45)' }}
            onMouseDown={e => { if (e.target === e.currentTarget && !busy) onClose() }}>
            <div role="dialog" aria-modal="true" aria-label="GeoServer 다시 연결"
                className="w-[420px] max-w-full rounded-[14px] shadow-2xl"
                style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
                <div className="px-4 py-3 text-sm font-medium" style={{ color: 'var(--text-primary)', borderBottom: '1px solid var(--border)' }}>
                    GeoServer 다시 연결
                </div>
                <div className="p-4 space-y-3.5">
                    <div className="space-y-2.5 text-[13px]">
                        <div>
                            <div className="text-[11px] mb-0.5" style={{ color: 'var(--text-faint)' }}>서버 주소</div>
                            <div className="font-mono break-all" style={{ color: 'var(--text-primary)' }}>{serverLabel(stored.url)}</div>
                        </div>
                        <div>
                            <div className="text-[11px] mb-0.5" style={{ color: 'var(--text-faint)' }}>아이디</div>
                            <div style={{ color: 'var(--text-primary)' }}>{stored.username}</div>
                        </div>
                    </div>
                    <div>
                        <label className="text-xs font-medium block mb-1.5" style={{ color: 'var(--text-secondary)' }}>비밀번호</label>
                        <PasswordField value={password} onChange={setPassword} onEnter={submit} disabled={busy} autoFocus />
                    </div>
                    <p className="text-[11px] leading-relaxed m-0" style={{ color: 'var(--text-faint)' }}>
                        편집 중인 내용은 그대로 남아 있습니다. 다른 서버로 바꾸려면 접속 설정에서 연결하세요(이 화면의 내용은 사라집니다).
                    </p>
                    <AttemptResult attempt={attempt} error={error} mode="connect" />
                    <div className="flex justify-end gap-2">
                        <button onClick={onClose} disabled={busy}
                            className="px-3.5 py-2 text-[13px] rounded-lg cursor-pointer disabled:opacity-50"
                            style={{ border: '1px solid var(--border)', background: 'var(--bg-page)', color: 'var(--text-secondary)' }}>
                            취소
                        </button>
                        <button onClick={submit} disabled={busy || !password}
                            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-[13px] font-medium rounded-lg cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                            style={{ background: 'var(--accent)', color: '#fff' }}>
                            {busy ? <RefreshCw size={14} className="animate-spin" /> : <Plug size={14} />}
                            다시 연결
                        </button>
                    </div>
                </div>
            </div>
        </div>
    )
}
