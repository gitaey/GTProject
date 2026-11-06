'use client'

import { useEffect, useState } from 'react'
import { RefreshCw, Upload, ChevronDown, Unplug, Plug } from 'lucide-react'
import Sidebar from '@/components/layout/Sidebar'
import Header from '@/components/layout/Header'
import ConnectionBadge from '../_shared/ConnectionBadge'
import NotConnectedNotice from '../_shared/NotConnectedNotice'
import ReconnectDialog from '../_shared/ReconnectDialog'
import { GeoServerConnectionLostError, gsFetch, serverLabel } from '../_shared/connection'
import { useGeoServerConnection } from '../_shared/useGeoServerConnection'

interface LayerItem {
    name: string
    published: boolean
}

const enc = encodeURIComponent

const selectStyle: React.CSSProperties = {
    background: 'var(--bg-page)',
    border: '1px solid var(--border)',
    color: 'var(--text-primary)',
    borderRadius: '8px',
    padding: '6px 12px',
    fontSize: '14px',
    minWidth: '180px',
    cursor: 'pointer',
    appearance: 'none',
}

export default function GeoServerPublishPage() {
    const [workspaces, setWorkspaces] = useState<string[]>([])
    const [datastores, setDatastores] = useState<string[]>([])
    const [layers, setLayers]         = useState<LayerItem[]>([])
    const [workspace, setWorkspace]   = useState('')
    const [datastore, setDatastore]   = useState('')
    const [selected, setSelected]     = useState<Set<string>>(new Set())
    const [loadingWs, setLoadingWs]   = useState(false)
    const [loadingDs, setLoadingDs]   = useState(false)
    const [loadingLy, setLoadingLy]   = useState(false)
    const [publishing, setPublishing] = useState(false)
    const [results, setResults]       = useState<{ layer: string; success: boolean; message: string }[]>([])
    const [error, setError]           = useState<string | null>(null)
    const [wsError, setWsError]       = useState<string | null>(null)
    const [filter, setFilter]         = useState<'all' | 'published' | 'unpublished'>('all')

    // 연결 — 번호표가 없으면 이 화면은 GeoServer API를 부르지 않는다
    const conn = useGeoServerConnection()
    const connected = conn.state === 'connected'
    const [lostAction, setLostAction]       = useState<string | null>(null)
    const [showReconnect, setShowReconnect] = useState(false)

    /** 428이면 화면은 그대로 두고 띠만 띄운다. 처리했으면 true */
    const handleLost = (e: unknown, action: string): boolean => {
        if (!(e instanceof GeoServerConnectionLostError)) return false
        setLostAction(action)
        conn.markLost(e.message)
        return true
    }

    const loadWorkspaces = () => {
        setLoadingWs(true)
        setWsError(null)
        gsFetch<{ workspaces: string[] }>('/api/geoserver/workspaces')
            .then(d => setWorkspaces(d.workspaces))
            .catch(e => {
                if (handleLost(e, '작업공간을 불러오')) return
                setWsError(e instanceof Error ? e.message : 'GeoServer 작업공간을 불러오지 못했습니다.')
            })
            .finally(() => setLoadingWs(false))
    }

    const loadDatastores = () => {
        if (!workspace) { setDatastores([]); setDatastore(''); return }
        setLoadingDs(true)
        gsFetch<{ datastores: string[] }>(`/api/geoserver/workspaces/${enc(workspace)}/datastores`)
            .then(d => { setDatastores(d.datastores); setDatastore('') })
            .catch(e => {
                if (handleLost(e, '저장소를 불러오')) return
                setError(e instanceof Error ? e.message : '저장소를 불러오지 못했습니다.')
            })
            .finally(() => setLoadingDs(false))
    }

    // 상태 확인이 끝나 연결됨이 된 뒤에만 불러온다. 다시 연결에 성공하면 연결이 끊겨 실패했던 불러오기만 다시 한다
    useEffect(() => {
        if (conn.state !== 'connected') return
        const failed = lostAction
        setLostAction(null)
        if (workspaces.length === 0) loadWorkspaces()
        else if (failed === '저장소를 불러오') loadDatastores()
        else if (failed === '레이어 목록을 불러오') loadLayers()
    }, [conn.state])

    useEffect(() => {
        loadDatastores()
    }, [workspace])

    const loadLayers = () => {
        if (!workspace || !datastore) return
        setLoadingLy(true)
        setSelected(new Set())
        setResults([])
        setError(null)
        gsFetch<LayerItem[]>(`/api/geoserver/workspaces/${enc(workspace)}/datastores/${enc(datastore)}/layers`)
            .then(setLayers)
            .catch(e => {
                if (handleLost(e, '레이어 목록을 불러오')) return
                setError('레이어 목록을 불러오지 못했습니다.')
            })
            .finally(() => setLoadingLy(false))
    }

    useEffect(() => {
        loadLayers()
    }, [datastore])

    const toggle = (name: string) => {
        setSelected(prev => {
            const next = new Set(prev)
            next.has(name) ? next.delete(name) : next.add(name)
            return next
        })
    }

    const unpublished = layers.filter(l => !l.published)
    const allSelected = unpublished.length > 0 && selected.size === unpublished.length
    const filteredLayers = filter === 'published' ? layers.filter(l => l.published)
        : filter === 'unpublished' ? layers.filter(l => !l.published)
        : layers

    const toggleAll = () => {
        setSelected(allSelected ? new Set() : new Set(unpublished.map(l => l.name)))
    }

    const publish = async () => {
        if (selected.size === 0) return
        setPublishing(true)
        setResults([])
        setError(null)
        try {
            const data = await gsFetch<{ layer: string; success: boolean; message: string }[]>('/api/geoserver/publish', {
                method: 'POST',
                body: JSON.stringify({ workspace, datastore, layers: Array.from(selected) }),
            })
            setResults(data)
            loadLayers()
        } catch (e) {
            if (!handleLost(e, '레이어를 발행하')) setError(e instanceof Error ? e.message : '발행에 실패했습니다.')
        } finally {
            setPublishing(false)
        }
    }

    return (
        <div className="flex min-h-screen" style={{ background: 'var(--bg-page)' }}>
            <Sidebar />
            <div className="flex-1 flex flex-col min-w-0">
                <Header title="레이어 발행" breadcrumb={['GeoServer', '레이어 발행']} />

                <main className="flex-1 p-4 sm:p-6 space-y-4 min-w-0">
                    <div className="flex flex-wrap items-center justify-between gap-2.5 min-w-0">
                        <p className="text-sm m-0" style={{ color: 'var(--text-muted)' }}>
                            작업공간과 저장소를 선택하고 레이어를 일괄 발행합니다.
                        </p>
                        <ConnectionBadge state={conn.state} info={conn.info} />
                    </div>

                    {conn.state === 'checking' && (
                        <div className="flex items-center justify-center py-16">
                            <div className="w-6 h-6 border-2 border-t-transparent rounded-full animate-spin"
                                style={{ borderColor: 'var(--accent)', borderTopColor: 'transparent' }} />
                        </div>
                    )}

                    {conn.state === 'none' && <NotConnectedNotice kind="none" what="레이어 발행" />}

                    {conn.state === 'expired' && !lostAction && (
                        <NotConnectedNotice kind="expired" what="레이어 발행" info={conn.info}
                            onReconnect={() => setShowReconnect(true)} />
                    )}

                    {(connected || (conn.state === 'expired' && lostAction)) && (
                    <>
                    {/* 작업 중 만료 — 화면은 그대로 두고 띠만 */}
                    {conn.state === 'expired' && lostAction && (
                        <div className="flex flex-wrap items-center justify-between gap-2.5 px-4 py-3 rounded-lg text-sm"
                            style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', color: 'var(--text-primary)' }}>
                            <span className="flex items-center gap-2 min-w-0 flex-1" style={{ minWidth: '200px' }}>
                                <Unplug size={18} className="shrink-0" style={{ color: '#ef4444' }} />
                                <span>
                                    <b className="block">GeoServer 연결이 만료되어 {lostAction}지 못했습니다</b>
                                    <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                                        선택한 내용은 그대로 있습니다. 다시 연결하기 전까지 아래 조작(선택·새로고침·발행)은 잠깁니다.
                                    </span>
                                </span>
                            </span>
                            {conn.stored && (
                                <button onClick={() => setShowReconnect(true)}
                                    className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-lg cursor-pointer"
                                    style={{ background: 'var(--accent)', color: '#fff' }}>
                                    <Plug size={12} />
                                    다시 연결
                                </button>
                            )}
                        </div>
                    )}

                    {/* 만료 띠가 떠 있는 동안 GeoServer를 부르는 조작을 잠근다(inert: 클릭·포커스 모두 막힘). 다시 연결하면 풀린다 */}
                    <div className="space-y-4" inert={conn.state === 'expired'}
                        style={conn.state === 'expired' ? { opacity: 0.55 } : undefined}>
                    {/* workspace 에러 */}
                    {wsError && (
                        <div className="px-4 py-3 rounded-lg text-sm flex items-center justify-between"
                            style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', color: '#ef4444' }}>
                            <span>GeoServer 연결 실패: {wsError}</span>
                            <button onClick={loadWorkspaces} className="ml-4 text-xs underline cursor-pointer" style={{ color: '#ef4444' }}>
                                재시도
                            </button>
                        </div>
                    )}

                    {/* 선택 영역 */}
                    <div className="rounded-xl p-5 flex flex-wrap items-end gap-4"
                        style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
                        <div className="flex flex-col gap-1.5">
                            <label className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>작업공간</label>
                            <div className="relative">
                                <select value={workspace} onChange={e => setWorkspace(e.target.value)} disabled={loadingWs} style={selectStyle}>
                                    <option value="">{loadingWs ? '불러오는 중...' : wsError ? '불러오기 실패' : '선택'}</option>
                                    {workspaces.map(w => <option key={w} value={w}>{w}</option>)}
                                </select>
                                <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--text-faint)' }} />
                            </div>
                        </div>

                        <div className="flex flex-col gap-1.5">
                            <label className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>저장소</label>
                            <div className="relative">
                                <select value={datastore} onChange={e => setDatastore(e.target.value)} disabled={!workspace || loadingDs} style={selectStyle}>
                                    <option value="">{loadingDs ? '불러오는 중...' : '선택'}</option>
                                    {datastores.map(d => <option key={d} value={d}>{d}</option>)}
                                </select>
                                <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--text-faint)' }} />
                            </div>
                        </div>

                        {datastore && (
                            <button onClick={loadLayers} disabled={loadingLy}
                                className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg cursor-pointer disabled:opacity-50"
                                style={{ border: '1px solid var(--border)', color: 'var(--text-muted)', background: 'var(--bg-page)' }}>
                                <RefreshCw size={13} className={loadingLy ? 'animate-spin' : ''} />
                                새로고침
                            </button>
                        )}
                    </div>

                    {error && (
                        <div className="px-4 py-3 rounded-lg text-sm"
                            style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', color: '#ef4444' }}>
                            {error}
                        </div>
                    )}

                    {/* 레이어 목록 */}
                    {layers.length > 0 && (
                        <div className="rounded-xl overflow-hidden"
                            style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
                            {/* 테이블 헤더 */}
                            <div className="flex items-center gap-3 px-5 py-3"
                                style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg-hover)' }}>
                                <input type="checkbox" checked={allSelected} onChange={toggleAll}
                                    disabled={unpublished.length === 0}
                                    className="w-4 h-4 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed" />
                                <span className="text-xs font-medium flex-1" style={{ color: 'var(--text-secondary)' }}>
                                    레이어 이름
                                    <span className="ml-2 font-normal" style={{ color: 'var(--text-faint)' }}>
                                        ({unpublished.length}개 미발행 / 총 {layers.length}개)
                                    </span>
                                </span>
                                <div className="flex items-center gap-1">
                                    {(['all', 'published', 'unpublished'] as const).map(f => (
                                        <button key={f} onClick={() => setFilter(f)}
                                            className="text-xs px-2.5 py-1 rounded-full cursor-pointer transition-colors"
                                            style={{
                                                background: filter === f ? 'var(--accent)' : 'transparent',
                                                color: filter === f ? '#fff' : 'var(--text-faint)',
                                                border: `1px solid ${filter === f ? 'var(--accent)' : 'var(--border)'}`,
                                            }}>
                                            {f === 'all' ? '전체' : f === 'published' ? '발행됨' : '미발행'}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <ul>
                                {filteredLayers.map((layer, idx) => (
                                    <li key={layer.name}
                                        onClick={() => !layer.published && toggle(layer.name)}
                                        className={`flex items-center gap-3 px-5 py-3.5 transition-colors ${!layer.published ? 'cursor-pointer hover:bg-[var(--bg-hover)]' : ''}`}
                                        style={{ borderBottom: idx < filteredLayers.length - 1 ? '1px solid var(--border-subtle)' : 'none' }}>
                                        <input type="checkbox"
                                            checked={layer.published || selected.has(layer.name)}
                                            disabled={layer.published}
                                            onChange={() => toggle(layer.name)}
                                            onClick={e => e.stopPropagation()}
                                            className="w-4 h-4 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed" />
                                        <span className="text-sm font-mono flex-1" style={{ color: 'var(--text-primary)' }}>
                                            {layer.name}
                                        </span>
                                        {layer.published ? (
                                            <span className="text-xs px-2.5 py-1 rounded-full font-medium"
                                                style={{ background: 'rgba(16,185,129,0.12)', color: '#10b981' }}>
                                                발행됨
                                            </span>
                                        ) : (
                                            <span className="text-xs px-2.5 py-1 rounded-full font-medium"
                                                style={{ background: 'var(--bg-hover)', color: 'var(--text-faint)' }}>
                                                미발행
                                            </span>
                                        )}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}

                    {loadingLy && (
                        <div className="flex items-center justify-center py-16">
                            <div className="w-6 h-6 border-2 border-t-transparent rounded-full animate-spin"
                                style={{ borderColor: 'var(--accent)', borderTopColor: 'transparent' }} />
                        </div>
                    )}

                    {/* 발행 버튼 */}
                    {layers.length > 0 && (
                        <div className="flex items-center gap-3">
                            <button onClick={publish} disabled={selected.size === 0 || publishing || !connected}
                                className="flex items-center gap-2 px-5 py-2.5 text-sm font-medium rounded-lg cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                                style={{ background: 'var(--accent)', color: '#fff' }}>
                                <Upload size={14} />
                                {publishing ? '발행 중...' : `선택한 ${selected.size}개 발행`}
                            </button>
                            {conn.info && (
                                <span className="text-xs min-w-0 break-all" style={{ color: 'var(--text-faint)' }}>
                                    대상: <span className="font-mono">{serverLabel(conn.info.url)}</span>
                                </span>
                            )}
                        </div>
                    )}

                    {/* 발행 결과 */}
                    {results.length > 0 && (
                        <div className="rounded-xl overflow-hidden"
                            style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
                            <div className="px-5 py-3 text-xs font-medium"
                                style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg-hover)', color: 'var(--text-secondary)' }}>
                                발행 결과
                            </div>
                            <ul>
                                {results.map((r, idx) => (
                                    <li key={r.layer} className="flex items-center gap-3 px-5 py-3"
                                        style={{ borderBottom: idx < results.length - 1 ? '1px solid var(--border-subtle)' : 'none' }}>
                                        <span className={`w-2 h-2 rounded-full shrink-0 ${r.success ? 'bg-emerald-500' : 'bg-red-500'}`} />
                                        <span className="text-sm font-mono flex-1" style={{ color: 'var(--text-primary)' }}>{r.layer}</span>
                                        <span className="text-xs" style={{ color: r.success ? '#10b981' : '#ef4444' }}>{r.message}</span>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}
                    </div>
                    </>
                    )}
                </main>
            </div>
            {showReconnect && conn.stored && (
                <ReconnectDialog stored={conn.stored} onConnected={conn.setConnected} onClose={() => setShowReconnect(false)} />
            )}
        </div>
    )
}
