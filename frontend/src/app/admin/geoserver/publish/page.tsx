'use client'

import { useEffect, useState } from 'react'
import { getToken } from '@/stores/authStore'
import { RefreshCw, Upload, ChevronDown } from 'lucide-react'
import Sidebar from '@/components/layout/Sidebar'
import Header from '@/components/layout/Header'

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8080'

interface LayerItem {
    name: string
    published: boolean
}

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
    const token = getToken()
    const headers: Record<string, string> = {
        ...(options?.headers as Record<string, string> ?? {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
    }
    if (options?.body) headers['Content-Type'] = 'application/json'
    const res = await fetch(`${API}${path}`, { ...options, headers })
    const json = await res.json()
    if (!json.success) throw new Error(json.message ?? '오류가 발생했습니다.')
    return json.data
}

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
    const [filter, setFilter]         = useState<'all' | 'published' | 'unpublished'>('all')

    useEffect(() => {
        setLoadingWs(true)
        apiFetch<{ workspaces: string[] }>('/api/geoserver/workspaces')
            .then(d => setWorkspaces(d.workspaces))
            .catch(() => {})
            .finally(() => setLoadingWs(false))
    }, [])

    useEffect(() => {
        if (!workspace) { setDatastores([]); setDatastore(''); return }
        setLoadingDs(true)
        apiFetch<{ datastores: string[] }>(`/api/geoserver/workspaces/${workspace}/datastores`)
            .then(d => { setDatastores(d.datastores); setDatastore('') })
            .catch(() => {})
            .finally(() => setLoadingDs(false))
    }, [workspace])

    const loadLayers = () => {
        if (!workspace || !datastore) return
        setLoadingLy(true)
        setSelected(new Set())
        setResults([])
        setError(null)
        apiFetch<LayerItem[]>(`/api/geoserver/workspaces/${workspace}/datastores/${datastore}/layers`)
            .then(setLayers)
            .catch(() => setError('레이어 목록을 불러오지 못했습니다.'))
            .finally(() => setLoadingLy(false))
    }

    useEffect(() => { loadLayers() }, [datastore])

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
            const data = await apiFetch<{ layer: string; success: boolean; message: string }[]>('/api/geoserver/publish', {
                method: 'POST',
                body: JSON.stringify({ workspace, datastore, layers: Array.from(selected) }),
            })
            setResults(data)
            loadLayers()
        } catch (e) {
            setError(e instanceof Error ? e.message : '발행에 실패했습니다.')
        } finally {
            setPublishing(false)
        }
    }

    return (
        <div className="flex min-h-screen" style={{ background: 'var(--bg-page)' }}>
            <Sidebar />
            <div className="flex-1 flex flex-col min-w-0">
                <Header title="레이어 발행" breadcrumb={['GeoServer', '레이어 발행']} />

                <main className="flex-1 p-6 space-y-4">
                    <div className="flex items-center justify-between">
                        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                            작업공간과 저장소를 선택하고 레이어를 일괄 발행합니다.
                        </p>
                    </div>

                    {/* 선택 영역 */}
                    <div className="rounded-xl p-5 flex flex-wrap items-end gap-4"
                        style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
                        <div className="flex flex-col gap-1.5">
                            <label className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>작업공간</label>
                            <div className="relative">
                                <select value={workspace} onChange={e => setWorkspace(e.target.value)} disabled={loadingWs} style={selectStyle}>
                                    <option value="">{loadingWs ? '불러오는 중...' : '선택'}</option>
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
                            <button onClick={publish} disabled={selected.size === 0 || publishing}
                                className="flex items-center gap-2 px-5 py-2.5 text-sm font-medium rounded-lg cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                                style={{ background: 'var(--accent)', color: '#fff' }}>
                                <Upload size={14} />
                                {publishing ? '발행 중...' : `선택한 ${selected.size}개 발행`}
                            </button>
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
                </main>
            </div>
        </div>
    )
}
