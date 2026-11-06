'use client'

import Link from 'next/link'
import { ChevronRight, ShieldAlert } from 'lucide-react'
import { serverLabel, type ConnectionInfo } from './connection'
import type { ConnState } from './useGeoServerConnection'

interface ConnectionBadgeProps {
    state: ConnState
    info: ConnectionInfo | null
}

/** 발행·스타일 화면 맨 위 오른쪽 — 연결됨 / 인증서 검증 안 함 / 연결 안 됨 / 만료. 누르면 접속 설정 */
export default function ConnectionBadge({ state, info }: ConnectionBadgeProps) {
    const connected = state === 'connected' && info !== null
    const insecure = connected && info.insecureTls
    const dot = connected ? '#10b981' : state === 'expired' ? '#ef4444' : 'var(--text-faint)'
    let text: React.ReactNode
    if (connected) {
        text = (
            <>
                현재 연결: <span className="font-mono">{serverLabel(info.url)}</span>
                {info.version ? ` · ${info.version}` : ''} · {info.username}
            </>
        )
    } else if (state === 'expired') {
        text = '연결 만료 — 다시 연결하세요'
    } else if (state === 'checking') {
        text = '연결 확인 중...'
    } else {
        text = '연결 안 됨 — 접속 설정'
    }
    return (
        <Link href="/admin/geoserver/connect" title="접속 설정으로 이동"
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs min-w-0 max-w-full"
            style={{
                background: 'var(--bg-surface)',
                border: `1px solid ${insecure ? 'rgba(245,158,11,0.5)' : 'var(--border)'}`,
                color: 'var(--text-secondary)',
            }}>
            <span className="w-[7px] h-[7px] rounded-full shrink-0" style={{ background: dot }} />
            {insecure && (
                <span title="인증서 검증 안 함" style={{ color: '#d97706', display: 'inline-flex' }}>
                    <ShieldAlert size={12} />
                </span>
            )}
            <span className="truncate min-w-0">{text}</span>
            <ChevronRight size={12} className="shrink-0" style={{ color: 'var(--text-faint)' }} />
        </Link>
    )
}
