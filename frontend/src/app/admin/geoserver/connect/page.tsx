'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { Activity, ArrowRight, Plug, RefreshCw, ShieldAlert, Unplug } from 'lucide-react'
import Sidebar from '@/components/layout/Sidebar'
import Header from '@/components/layout/Header'
import AttemptResult, { AlertBox } from '../_shared/AttemptResult'
import PasswordField from '../_shared/PasswordField'
import {
    formatClock, formatDateTime, formatIdle, requestConnection, serverLabel,
    type ConnectionAttempt,
} from '../_shared/connection'
import {
    listServers, removeServer, touchServer, updateServer, upsertServer,
    type SavedServer,
} from '../_shared/savedServers'
import { useGeoServerConnection } from '../_shared/useGeoServerConnection'
import SavedServerList from './SavedServerList'

const INPUT_CLASS = 'w-full text-sm px-3 py-2 rounded-lg outline-none'
const INPUT_STYLE = { background: 'var(--bg-page)', border: '1px solid var(--border)', color: 'var(--text-primary)' }

export default function GeoServerConnectPage() {
    const conn = useGeoServerConnection()

    const [servers, setServers] = useState<SavedServer[]>([])
    const [pickedId, setPickedId] = useState<string | null>(null)

    // 입력 — 비밀번호는 이 state에만 두고 연결 뒤 바로 지운다
    const [url, setUrl] = useState('')
    const [username, setUsername] = useState('')
    const [password, setPassword] = useState('')
    const [insecureTls, setInsecureTls] = useState(false)
    const [saveToList, setSaveToList] = useState(true)
    const [saveName, setSaveName] = useState('')

    const [running, setRunning] = useState<'test' | 'connect' | null>(null)
    const [attempt, setAttempt] = useState<ConnectionAttempt | null>(null)
    const [attemptMode, setAttemptMode] = useState<'test' | 'connect'>('test')
    const [error, setError] = useState<string | null>(null)
    const pwRef = useRef<HTMLInputElement>(null)

    // localStorage는 렌더 중이 아니라 effect에서 읽는다(하이드레이션)
    useEffect(() => { setServers(listServers()) }, [])

    const picked = servers.find(s => s.id === pickedId) ?? null
    const isHttp = url.trim().toLowerCase().startsWith('http://')
    const effectiveInsecure = insecureTls && !isHttp
    const connected = conn.state === 'connected' && conn.status !== null
    const connectedKey = connected && conn.status ? `${conn.status.url}\n${conn.status.username}` : null

    const resetResult = () => {
        setAttempt(null)
        setError(null)
    }

    const pick = (s: SavedServer) => {
        setPickedId(s.id)
        setUrl(s.url)
        setUsername(s.username)
        setInsecureTls(s.insecureTls)
        setPassword('')
        setSaveToList(false)
        resetResult()
        pwRef.current?.focus()
    }

    const newServer = () => {
        setPickedId(null)
        setUrl('')
        setUsername('')
        setPassword('')
        setInsecureTls(false)
        setSaveToList(true)
        setSaveName('')
        resetResult()
    }

    const run = async (mode: 'test' | 'connect') => {
        if (running) return
        if (!url.trim() || !username.trim() || !password) {
            setAttempt(null)
            setError('서버 주소, 아이디, 비밀번호를 모두 입력하세요.')
            return
        }
        setRunning(mode)
        setAttemptMode(mode)
        resetResult()
        let keepPassword = false
        try {
            const result = await requestConnection(mode === 'connect', {
                url: url.trim(), username: username.trim(), password, insecureTls: effectiveInsecure,
            })
            setAttempt(result)
            if (!result.ok) return
            if (mode === 'test') {
                keepPassword = true // 시험이 통과하면 바로 [연결]을 누를 수 있게 둔다(이 입력 칸에만 있다)
                return
            }
            if (result.token && result.status) {
                conn.setConnected(result.token, result.status)
                const savedUrl = result.normalizedUrl ?? result.status.url
                if (picked) {
                    setServers(touchServer(picked.url, picked.username))
                } else if (saveToList) {
                    setServers(upsertServer({ name: saveName, url: savedUrl, username: username.trim(), insecureTls: effectiveInsecure }))
                    setSaveName('')
                }
            }
        } catch (e) {
            setError(e instanceof Error ? e.message : '요청하지 못했습니다.')
        } finally {
            if (!keepPassword) setPassword('')
            setRunning(null)
        }
    }

    const remove = (s: SavedServer) => {
        if (!confirm(`'${s.name}' 서버를 목록에서 삭제하시겠습니까?`)) return
        setServers(removeServer(s.id))
        if (pickedId === s.id) setPickedId(null)
    }

    return (
        <div className="flex min-h-screen" style={{ background: 'var(--bg-page)' }}>
            <Sidebar />
            <div className="flex-1 flex flex-col min-w-0">
                <Header title="접속 설정" breadcrumb={['GeoServer', '접속 설정']} />

                <main className="flex-1 p-4 sm:p-6 space-y-4 min-w-0">
                    <p className="text-sm m-0" style={{ color: 'var(--text-muted)' }}>
                        작업할 GeoServer를 연결합니다. 연결 정보는 서버에 잠시 보관되고 이 탭에는 번호표만 남습니다.
                    </p>

                    {/* 현재 연결 카드 */}
                    <div className="rounded-xl" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
                        {connected && conn.status ? (
                            <div className="flex gap-4 p-4 flex-wrap">
                                <div className="w-10 h-10 rounded-[10px] flex items-center justify-center shrink-0"
                                    style={{ background: 'rgba(16,185,129,0.1)', color: '#10b981' }}>
                                    <Plug size={20} />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <span className="font-medium text-sm" style={{ color: 'var(--text-primary)' }}>연결됨</span>
                                        {conn.status.insecureTls && (
                                            <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full font-medium"
                                                style={{ background: 'rgba(245,158,11,0.12)', color: '#d97706' }}>
                                                <ShieldAlert size={12} />
                                                인증서 검증 안 함
                                            </span>
                                        )}
                                    </div>
                                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-x-6 gap-y-2.5 mt-2.5 text-[13px]">
                                        <Kv label="서버 주소" mono>{conn.status.url}</Kv>
                                        <Kv label="아이디">{conn.status.username}</Kv>
                                        <Kv label="GeoServer 버전">{conn.status.version ?? '확인 못 함'}</Kv>
                                        <Kv label="연결 시각">{formatDateTime(conn.status.connectedAt)}</Kv>
                                        <Kv label="마지막 사용">{formatDateTime(conn.status.lastUsedAt)}</Kv>
                                        <Kv label="만료 예정">
                                            {formatClock(conn.status.expiresAt)} ({formatIdle(conn.status.idleMinutes)} 쓰지 않으면)
                                        </Kv>
                                    </div>
                                    <div className="flex flex-wrap items-center gap-2 mt-3.5">
                                        <Link href="/admin/geoserver/publish"
                                            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs rounded-lg"
                                            style={{ border: '1px solid var(--border)', background: 'var(--bg-page)', color: 'var(--text-secondary)' }}>
                                            레이어 발행 <ArrowRight size={12} />
                                        </Link>
                                        <Link href="/admin/geoserver/styles"
                                            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs rounded-lg"
                                            style={{ border: '1px solid var(--border)', background: 'var(--bg-page)', color: 'var(--text-secondary)' }}>
                                            스타일 관리 <ArrowRight size={12} />
                                        </Link>
                                        <span className="flex-1" />
                                        <button onClick={() => { void conn.disconnect() }}
                                            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs rounded-lg cursor-pointer"
                                            style={{ border: '1px solid rgba(239,68,68,0.3)', color: '#ef4444', background: 'transparent' }}>
                                            <Unplug size={12} />
                                            연결 해제
                                        </button>
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <div className="flex gap-4 p-4 items-start">
                                <div className="w-10 h-10 rounded-[10px] flex items-center justify-center shrink-0"
                                    style={{ background: 'var(--bg-hover)', border: '1px solid var(--border)', color: 'var(--text-faint)' }}>
                                    {conn.state === 'checking' ? <RefreshCw size={20} className="animate-spin" /> : <Unplug size={20} />}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="font-medium text-sm" style={{ color: 'var(--text-primary)' }}>
                                        {conn.state === 'checking' ? '연결 상태 확인 중...' : conn.state === 'expired' ? '연결 만료' : '연결 안 됨'}
                                    </div>
                                    {conn.state === 'expired' ? (
                                        <div className="text-xs mt-1" style={{ color: '#ef4444' }}>
                                            {conn.lostMessage ?? 'GeoServer 연결이 만료되었습니다. 다시 연결하세요.'}
                                        </div>
                                    ) : (
                                        <div className="text-xs mt-1 leading-relaxed" style={{ color: 'var(--text-muted)' }}>
                                            레이어 발행·스타일 관리는 GeoServer를 연결한 뒤에 쓸 수 있습니다. 연결은 <b>이 탭에서만</b> 유효하고, 비밀번호는 브라우저에 저장되지 않습니다.
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-[360px_minmax(0,1fr)] gap-4 items-start">
                        {/* 모바일은 폼이 먼저 */}
                        <div className="order-2 lg:order-1 min-w-0">
                            <SavedServerList
                                servers={servers}
                                pickedId={pickedId}
                                connectedKey={connectedKey}
                                onPick={pick}
                                onNew={newServer}
                                onUpdate={(id, patch) => setServers(updateServer(id, patch))}
                                onRemove={remove}
                            />
                        </div>

                        <div className="order-1 lg:order-2 rounded-xl min-w-0" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
                            <div className="flex items-center justify-between gap-2 px-4 py-2.5 rounded-t-xl text-xs font-medium"
                                style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg-hover)', color: 'var(--text-secondary)' }}>
                                <span className="min-w-0 truncate">
                                    서버 연결{picked && <> — <span style={{ color: 'var(--accent)' }}>{picked.name}</span></>}
                                </span>
                                {picked && (
                                    <button onClick={newServer} className="text-xs cursor-pointer shrink-0" style={{ color: 'var(--text-muted)' }}>
                                        새 서버로 입력
                                    </button>
                                )}
                            </div>
                            <form className="p-4 space-y-3.5" onSubmit={e => { e.preventDefault(); void run('connect') }}>
                                <div>
                                    <label className="text-xs font-medium block mb-1.5" style={{ color: 'var(--text-secondary)' }}>서버 주소</label>
                                    <input value={url}
                                        onChange={e => { setUrl(e.target.value); setPickedId(null) }}
                                        placeholder="https://geo.example.go.kr/geoserver"
                                        autoComplete="off" autoCapitalize="off" spellCheck={false}
                                        className={`${INPUT_CLASS} font-mono`} style={INPUT_STYLE} />
                                    <div className="text-[11px] leading-relaxed mt-1.5" style={{ color: 'var(--text-faint)' }}>
                                        GeoServer 주소(보통 끝이 <span className="font-mono">/geoserver</span>). 끝에 <span className="font-mono">/web</span>·<span className="font-mono">/rest</span>가 붙어 있어도 자동으로 고칩니다.
                                        접속은 브라우저가 아니라 <b>이 프로그램의 서버(백엔드)</b>가 하므로, <span className="font-mono">localhost</span>는 백엔드가 도는 컴퓨터를 뜻합니다.
                                    </div>
                                    {isHttp && (
                                        <div className="text-[11px] leading-relaxed mt-1" style={{ color: '#d97706' }}>
                                            http 주소는 비밀번호가 암호화되지 않은 채 GeoServer로 전달됩니다(내부망 전용 서버라면 괜찮을 수 있습니다).
                                        </div>
                                    )}
                                </div>

                                <div>
                                    <label className="text-xs font-medium block mb-1.5" style={{ color: 'var(--text-secondary)' }}>아이디</label>
                                    <input value={username}
                                        onChange={e => { setUsername(e.target.value); setPickedId(null) }}
                                        placeholder="admin" autoComplete="off" autoCapitalize="off" spellCheck={false}
                                        className={INPUT_CLASS} style={INPUT_STYLE} />
                                </div>

                                <div>
                                    <label className="text-xs font-medium block mb-1.5" style={{ color: 'var(--text-secondary)' }}>비밀번호</label>
                                    <PasswordField value={password} onChange={setPassword} inputRef={pwRef} disabled={running !== null} />
                                    {picked && (
                                        <div className="text-[11px] mt-1.5" style={{ color: 'var(--text-faint)' }}>
                                            저장한 서버를 골랐습니다. 비밀번호만 입력하세요.
                                        </div>
                                    )}
                                </div>

                                <label className="flex items-start gap-2 text-[13px] cursor-pointer"
                                    style={{ color: 'var(--text-secondary)', opacity: isHttp ? 0.5 : 1 }}>
                                    <input type="checkbox" className="mt-0.5" checked={effectiveInsecure} disabled={isHttp}
                                        onChange={e => setInsecureTls(e.target.checked)} />
                                    <span>
                                        인증서 검증 안 함 <span className="text-xs" style={{ color: 'var(--text-faint)' }}>(자체 서명 HTTPS 인증서를 쓰는 내부 서버용)</span>
                                    </span>
                                </label>
                                {effectiveInsecure && (
                                    <AlertBox tone="warn" icon={<ShieldAlert size={20} />} title="인증서를 확인하지 않습니다">
                                        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                                            서버가 진짜인지 확인하지 않으므로, 중간에서 누군가 가로채면 비밀번호가 새어 나갈 수 있습니다.
                                            자체 서명 인증서를 쓰는 <b>내부망 서버</b>일 때만 켜세요. 이 연결이 살아 있는 동안 모든 GeoServer 화면에 방패 표시가 남습니다.
                                        </span>
                                    </AlertBox>
                                )}

                                {!picked && (
                                    <>
                                        <label className="flex items-start gap-2 text-[13px] cursor-pointer" style={{ color: 'var(--text-secondary)' }}>
                                            <input type="checkbox" className="mt-0.5" checked={saveToList}
                                                onChange={e => setSaveToList(e.target.checked)} />
                                            <span>
                                                연결에 성공하면 이 서버를 목록에 저장 <span className="text-xs" style={{ color: 'var(--text-faint)' }}>(비밀번호는 저장하지 않음)</span>
                                            </span>
                                        </label>
                                        {saveToList && (
                                            <input value={saveName} onChange={e => setSaveName(e.target.value)}
                                                placeholder="목록에 보일 이름(비우면 서버 주소)"
                                                autoComplete="off"
                                                className={`${INPUT_CLASS} ml-6 w-[calc(100%-1.5rem)]`} style={INPUT_STYLE} />
                                        )}
                                    </>
                                )}

                                <div className="flex flex-wrap justify-end gap-2">
                                    <button type="button" onClick={() => { void run('test') }} disabled={running !== null}
                                        className="inline-flex items-center gap-1.5 px-3.5 py-2 text-[13px] font-medium rounded-lg cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                                        style={{ border: '1px solid var(--border)', background: 'var(--bg-page)', color: 'var(--text-secondary)' }}>
                                        {running === 'test' ? <RefreshCw size={14} className="animate-spin" /> : <Activity size={14} />}
                                        연결 시험
                                    </button>
                                    <button type="submit" disabled={running !== null}
                                        className="inline-flex items-center gap-1.5 px-3.5 py-2 text-[13px] font-medium rounded-lg cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                                        style={{ background: 'var(--accent)', color: '#fff' }}>
                                        {running === 'connect' ? <RefreshCw size={14} className="animate-spin" /> : <Plug size={14} />}
                                        연결
                                    </button>
                                </div>
                                {connected && conn.status && (
                                    <div className="text-[11px] text-right" style={{ color: 'var(--text-faint)' }}>
                                        연결하면 지금 연결(<span className="font-mono">{serverLabel(conn.status.url)}</span>)은 해제됩니다.
                                    </div>
                                )}

                                <AttemptResult attempt={attempt} error={error} mode={attemptMode} />
                            </form>
                        </div>
                    </div>
                </main>
            </div>
        </div>
    )
}

interface KvProps {
    label: string
    mono?: boolean
    children: React.ReactNode
}

function Kv({ label, mono, children }: KvProps) {
    return (
        <div className="min-w-0 break-words">
            <div className="text-[11px] mb-0.5" style={{ color: 'var(--text-faint)' }}>{label}</div>
            <div className={mono ? 'font-mono' : ''} style={{ color: 'var(--text-primary)' }}>{children}</div>
        </div>
    )
}
