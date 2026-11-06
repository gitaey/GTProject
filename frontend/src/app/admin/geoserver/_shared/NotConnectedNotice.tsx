'use client'

import Link from 'next/link'
import { ArrowRight, Plug, Unplug } from 'lucide-react'
import { serverLabel, type ConnectionInfo } from './connection'

interface NotConnectedNoticeProps {
    kind: 'none' | 'expired'
    /** '레이어 발행'처럼 이 화면에서 하는 일 */
    what: string
    /** 만료 안내에서 같은 서버로 다시 연결할 때 보여 줄 연결 정보 */
    info?: ConnectionInfo | null
    onReconnect?: () => void
}

/** 연결이 없거나(none) 들어올 때 이미 만료(expired)일 때 본문 대신 보이는 안내 카드. 이 카드가 보이면 GeoServer API는 부르지 않는다 */
export default function NotConnectedNotice({ kind, what, info, onReconnect }: NotConnectedNoticeProps) {
    const expired = kind === 'expired'
    return (
        <div className="rounded-xl text-center px-5 py-8 sm:px-7 sm:py-9 mx-auto my-6 sm:my-10 max-w-[520px]"
            style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
            <div className="w-14 h-14 rounded-2xl mx-auto mb-3.5 flex items-center justify-center"
                style={expired
                    ? { background: 'rgba(239,68,68,0.1)', color: '#ef4444' }
                    : { background: 'var(--accent-bg)', color: 'var(--accent)' }}>
                {expired ? <Unplug size={28} /> : <Plug size={28} />}
            </div>
            <h3 className="text-base font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>
                {expired ? 'GeoServer 연결이 만료되었습니다' : 'GeoServer에 연결되어 있지 않습니다'}
            </h3>
            <p className="text-[13px] leading-7 mb-4" style={{ color: 'var(--text-muted)' }}>
                {expired ? (
                    <>
                        오래 쓰지 않았거나 서버가 다시 시작되었습니다.<br />
                        {info
                            ? <>같은 서버(<span className="font-mono">{serverLabel(info.url)}</span>, {info.username})로 비밀번호만 넣어 다시 연결할 수 있습니다.</>
                            : '접속 설정에서 다시 연결하세요.'}
                    </>
                ) : (
                    <>
                        {what}은(는) 연결한 GeoServer에 바로 적용됩니다.<br />
                        먼저 작업할 서버를 연결하세요.
                    </>
                )}
            </p>
            <div className="flex flex-wrap items-center justify-center gap-2">
                {expired && info && onReconnect && (
                    <button onClick={onReconnect}
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 text-[13px] font-medium rounded-lg cursor-pointer"
                        style={{ background: 'var(--accent)', color: '#fff' }}>
                        <Plug size={14} />
                        다시 연결
                    </button>
                )}
                <Link href="/admin/geoserver/connect"
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 text-[13px] font-medium rounded-lg"
                    style={expired
                        ? { background: 'var(--bg-page)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }
                        : { background: 'var(--accent)', color: '#fff' }}>
                    접속 설정으로
                    <ArrowRight size={14} />
                </Link>
            </div>
            {!expired && (
                <p className="text-[11px] mt-3 mb-0" style={{ color: 'var(--text-faint)' }}>
                    저장한 서버가 있으면 비밀번호만 입력하면 됩니다.
                </p>
            )}
        </div>
    )
}
