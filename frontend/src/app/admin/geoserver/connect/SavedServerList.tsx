'use client'

import { useState } from 'react'
import { ArrowRight, Pencil, Plus, Save, Server, ShieldAlert, Trash2 } from 'lucide-react'
import { formatDateTime } from '../_shared/connection'
import type { SavedServer, SavedServerInput } from '../_shared/savedServers'

interface SavedServerListProps {
    servers: SavedServer[]
    pickedId: string | null
    /** 지금 연결 중인 서버의 `주소\n아이디` (목록 줄과 같은 형식) */
    connectedKey: string | null
    onPick: (server: SavedServer) => void
    onNew: () => void
    onUpdate: (id: string, patch: SavedServerInput) => void
    onRemove: (server: SavedServer) => void
}

const CHIP_WARN = { background: 'rgba(245,158,11,0.12)', color: '#d97706' }
const CHIP_OK = { background: 'rgba(16,185,129,0.12)', color: '#10b981' }
const INPUT_STYLE = { background: 'var(--bg-page)', border: '1px solid var(--border)', color: 'var(--text-primary)' }

/** 저장한 서버 목록 — 이름·주소·아이디만. 선택 / 수정(줄 안에서) / 삭제. 비밀번호 칸은 없다 */
export default function SavedServerList({
    servers, pickedId, connectedKey, onPick, onNew, onUpdate, onRemove,
}: SavedServerListProps) {
    const [editingId, setEditingId] = useState<string | null>(null)
    const [draft, setDraft] = useState<SavedServerInput>({ name: '', url: '', username: '', insecureTls: false })

    const startEdit = (s: SavedServer) => {
        setEditingId(s.id)
        setDraft({ name: s.name, url: s.url, username: s.username, insecureTls: s.insecureTls })
    }

    const saveEdit = () => {
        if (!editingId || !draft.url.trim() || !draft.username.trim()) return
        onUpdate(editingId, draft)
        setEditingId(null)
    }

    return (
        <div className="rounded-xl min-w-0" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
            <div className="flex items-center justify-between gap-2 px-4 py-2.5 rounded-t-xl"
                style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg-hover)' }}>
                <span className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
                    저장한 서버 <span style={{ color: 'var(--text-faint)' }}>({servers.length})</span>
                </span>
                <button onClick={onNew}
                    className="inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-lg cursor-pointer"
                    style={{ border: '1px solid var(--border)', background: 'var(--bg-page)', color: 'var(--text-secondary)' }}>
                    <Plus size={12} />
                    새 서버
                </button>
            </div>

            {servers.length === 0 ? (
                <div className="px-4 py-7 text-center text-[13px]" style={{ color: 'var(--text-faint)' }}>
                    <Server size={20} className="mx-auto" />
                    <div className="mt-2">저장한 서버가 없습니다.</div>
                    <div className="text-[11px] mt-1">연결할 때 &quot;목록에 저장&quot;을 켜 두면 여기에 쌓입니다.</div>
                </div>
            ) : (
                <ul>
                    {servers.map(s => {
                        if (editingId === s.id) {
                            return (
                                <li key={s.id} className="px-4 py-3 space-y-2" style={{ borderBottom: '1px solid var(--border-subtle)', background: 'var(--bg-hover)' }}>
                                    <label className="block text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
                                        이름
                                        <input value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })}
                                            className="w-full mt-1 text-sm px-3 py-1.5 rounded-lg outline-none" style={INPUT_STYLE} />
                                    </label>
                                    <label className="block text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
                                        서버 주소
                                        <input value={draft.url} onChange={e => setDraft({ ...draft, url: e.target.value })}
                                            className="w-full mt-1 text-[13px] font-mono px-3 py-1.5 rounded-lg outline-none" style={INPUT_STYLE} />
                                    </label>
                                    <label className="block text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
                                        아이디
                                        <input value={draft.username} onChange={e => setDraft({ ...draft, username: e.target.value })}
                                            autoComplete="off"
                                            className="w-full mt-1 text-sm px-3 py-1.5 rounded-lg outline-none" style={INPUT_STYLE} />
                                    </label>
                                    <label className="flex items-center gap-2 text-[13px]" style={{ color: 'var(--text-secondary)' }}>
                                        <input type="checkbox" checked={draft.insecureTls}
                                            onChange={e => setDraft({ ...draft, insecureTls: e.target.checked })} />
                                        인증서 검증 안 함
                                    </label>
                                    <div className="flex justify-end gap-2">
                                        <button onClick={() => setEditingId(null)}
                                            className="px-2.5 py-1 text-xs rounded-lg cursor-pointer"
                                            style={{ border: '1px solid var(--border)', background: 'var(--bg-page)', color: 'var(--text-secondary)' }}>
                                            취소
                                        </button>
                                        <button onClick={saveEdit} disabled={!draft.url.trim() || !draft.username.trim()}
                                            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-lg cursor-pointer disabled:opacity-40"
                                            style={{ background: 'var(--accent)', color: '#fff' }}>
                                            <Save size={12} />
                                            저장
                                        </button>
                                    </div>
                                </li>
                            )
                        }
                        const connected = connectedKey === `${s.url}\n${s.username}`
                        return (
                            <li key={s.id} className="flex items-start gap-2.5 px-4 py-3"
                                style={{
                                    borderBottom: '1px solid var(--border-subtle)',
                                    background: pickedId === s.id ? 'var(--accent-bg)' : 'transparent',
                                }}>
                                <span className="mt-0.5 shrink-0" style={{ color: 'var(--text-faint)' }}><Server size={14} /></span>
                                <div className="flex-1 min-w-0">
                                    <div className="flex flex-wrap items-center gap-1.5 text-[13px] font-medium" style={{ color: 'var(--text-primary)' }}>
                                        <span className="break-all">{s.name}</span>
                                        {connected && <span className="text-[11px] px-2 py-0.5 rounded-full" style={CHIP_OK}>연결 중</span>}
                                        {s.insecureTls && (
                                            <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full" style={CHIP_WARN}>
                                                <ShieldAlert size={12} />
                                                인증서 검증 안 함
                                            </span>
                                        )}
                                    </div>
                                    <div className="text-xs font-mono break-all" style={{ color: 'var(--text-muted)' }}>{s.url}</div>
                                    <div className="text-[11px] mt-0.5" style={{ color: 'var(--text-faint)' }}>
                                        아이디 {s.username} · 마지막 연결 {formatDateTime(s.lastConnectedAt)}
                                    </div>
                                </div>
                                <div className="flex shrink-0">
                                    <button onClick={() => onPick(s)} title="선택" aria-label="선택"
                                        className="p-1.5 rounded cursor-pointer" style={{ color: 'var(--text-muted)' }}>
                                        <ArrowRight size={14} />
                                    </button>
                                    <button onClick={() => startEdit(s)} title="수정" aria-label="수정"
                                        className="p-1.5 rounded cursor-pointer" style={{ color: 'var(--text-muted)' }}>
                                        <Pencil size={14} />
                                    </button>
                                    <button onClick={() => onRemove(s)} title="삭제" aria-label="삭제"
                                        className="p-1.5 rounded cursor-pointer" style={{ color: '#ef4444' }}>
                                        <Trash2 size={14} />
                                    </button>
                                </div>
                            </li>
                        )
                    })}
                </ul>
            )}

            <div className="px-4 py-2.5 text-[11px]" style={{ borderTop: '1px solid var(--border-subtle)', color: 'var(--text-faint)' }}>
                이 목록은 이 브라우저에만 저장됩니다(이름·주소·아이디만, 비밀번호 제외).
            </div>
        </div>
    )
}
