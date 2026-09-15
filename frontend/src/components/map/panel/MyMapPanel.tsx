'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Trash2, Upload, Loader2, AlertCircle, Share2, Locate } from 'lucide-react'
import OlMap from 'ol/Map'
import { useMyMapLayers } from '@/hooks/map/useMyMapLayers'
import { getToken } from '@/stores/authStore'
import { UserMapListItem } from '@/components/map/mymap/types'
import MyMapUploadModal from '@/components/map/mymap/MyMapUploadModal'
import MyMapShareDialog from '@/components/map/mymap/MyMapShareDialog'

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8080'

function authHeaders(): Record<string, string> {
    const token = getToken()
    return token ? { Authorization: `Bearer ${token}` } : {}
}

interface MyMapPanelProps {
    map: OlMap | null
}

export default function MyMapPanel({ map }: MyMapPanelProps) {
    const [items, setItems] = useState<UserMapListItem[]>([])
    const [loading, setLoading] = useState(true)
    const [visibleIds, setVisibleIds] = useState<Set<number>>(new Set())
    const [showUpload, setShowUpload] = useState(false)
    const [shareTarget, setShareTarget] = useState<{ id: number; name: string } | null>(null)
    const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null)
    const { addLayer, removeLayer, zoomTo } = useMyMapLayers(map)

    const fetchList = useCallback(async () => {
        try {
            const res = await fetch(`${API}/api/mymap`, { headers: authHeaders() })
            const json = await res.json()
            if (json.success) setItems(json.data ?? [])
        } finally {
            setLoading(false)
        }
    }, [])

    useEffect(() => { fetchList() }, [fetchList])

    const startPolling = useCallback(() => {
        if (pollingRef.current) return
        pollingRef.current = setInterval(async () => {
            setItems(prev => {
                const processing = prev.filter(i => i.status === 'PROCESSING')
                if (processing.length === 0) {
                    clearInterval(pollingRef.current!)
                    pollingRef.current = null
                    return prev
                }
                processing.forEach(async item => {
                    try {
                        const res = await fetch(`${API}/api/mymap/${item.id}/status`, { headers: authHeaders() })
                        const json = await res.json()
                        if (!json.success) return
                        const s = json.data
                        if (s.status !== 'PROCESSING') {
                            setItems(cur => cur.map(i => i.id === item.id ? { ...i, status: s.status, featureCount: s.featureCount } : i))
                        }
                    } catch {}
                })
                return prev
            })
        }, 3000)
    }, [])

    useEffect(() => {
        if (items.some(i => i.status === 'PROCESSING')) startPolling()
    }, [items, startPolling])

    useEffect(() => () => { if (pollingRef.current) clearInterval(pollingRef.current) }, [])

    const handleDelete = useCallback(async (id: number) => {
        await fetch(`${API}/api/mymap/${id}`, { method: 'DELETE', headers: authHeaders() })
        removeLayer(id)
        setVisibleIds(prev => { const next = new Set(prev); next.delete(id); return next })
        setItems(prev => prev.filter(i => i.id !== id))
    }, [removeLayer])

    const toggleVisibility = useCallback((item: UserMapListItem) => {
        if (item.status !== 'READY') return
        if (visibleIds.has(item.id)) {
            removeLayer(item.id)
            setVisibleIds(prev => { const next = new Set(prev); next.delete(item.id); return next })
        } else {
            addLayer(item.id)
            setVisibleIds(prev => new Set([...prev, item.id]))
        }
    }, [visibleIds, addLayer, removeLayer])

    const handleLocate = useCallback(async (item: UserMapListItem) => {
        if (item.status !== 'READY') return
        await zoomTo(item.id)
        setVisibleIds(prev => new Set([...prev, item.id])) // zoomTo가 안 켜져있으면 레이어를 켜서 불러오므로 체크 상태도 맞춰줌
    }, [zoomTo])

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#fff' }}>
            <div style={{
                padding: '10px 10px 10px 12px', borderBottom: '2px solid #F26722',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0,
            }}>
                <span style={{ fontSize: '12.5px', fontWeight: 700, color: '#F26722' }}>나만의지도</span>
                <button onClick={() => setShowUpload(true)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#F26722', display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 600 }}>
                    <Upload size={13} /> 업로드
                </button>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', paddingBottom: 8 }}>
                {loading ? (
                    <div style={{ display: 'flex', justifyContent: 'center', padding: '32px 0' }}>
                        <Loader2 size={18} style={{ animation: 'spin 0.8s linear infinite', color: '#F26722' }} />
                    </div>
                ) : items.length === 0 ? (
                    <div style={{ padding: '24px 16px', textAlign: 'center', color: '#9ca3af', fontSize: '11.5px' }}>
                        업로드된 나만의지도 없음
                    </div>
                ) : items.map(item => {
                    const active = visibleIds.has(item.id)
                    const isProcessing = item.status === 'PROCESSING'
                    const isFailed = item.status === 'FAILED'
                    return (
                        <div key={item.id} style={{
                            display: 'flex', alignItems: 'center', gap: 6,
                            padding: '7px 10px 7px 12px', borderBottom: '1px solid #f3f4f6',
                            background: active ? 'rgba(242,103,34,0.04)' : 'transparent',
                        }}>
                            <input type="checkbox" checked={active} disabled={isProcessing || isFailed}
                                onChange={() => toggleVisibility(item)}
                                style={{ width: 13, height: 13, flexShrink: 0, accentColor: '#F26722', cursor: isProcessing || isFailed ? 'default' : 'pointer' }} />

                            <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{
                                    fontSize: 11.5, color: isFailed ? '#ef4444' : active ? '#111827' : '#374151',
                                    fontWeight: active ? 500 : 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                }}>
                                    {item.name}{!item.owner && <span style={{ color: '#9ca3af', fontWeight: 400 }}> (공유됨)</span>}
                                </div>
                                <div style={{ fontSize: 10.5, color: '#9ca3af', marginTop: 1, display: 'flex', alignItems: 'center', gap: 4 }}>
                                    {item.sourceType} · {item.featureCount}개
                                    {isProcessing && (
                                        <span style={{ color: '#F26722', display: 'flex', alignItems: 'center', gap: 3 }}>
                                            <Loader2 size={9} style={{ animation: 'spin 0.8s linear infinite' }} /> 처리 중
                                        </span>
                                    )}
                                    {isFailed && (
                                        <span style={{ color: '#ef4444', display: 'flex', alignItems: 'center', gap: 3 }}>
                                            <AlertCircle size={9} /> 실패
                                        </span>
                                    )}
                                </div>
                            </div>

                            {item.status === 'READY' && (
                                <button onClick={() => handleLocate(item)} title="레이어 위치로 이동"
                                    style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 3, color: '#9ca3af', display: 'flex', flexShrink: 0 }}
                                    onMouseEnter={e => (e.currentTarget.style.color = '#F26722')}
                                    onMouseLeave={e => (e.currentTarget.style.color = '#9ca3af')}>
                                    <Locate size={12} />
                                </button>
                            )}

                            {item.owner && (
                                <button onClick={() => setShareTarget({ id: item.id, name: item.name })} title="공유 설정"
                                    style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 3, color: '#9ca3af', display: 'flex', flexShrink: 0 }}
                                    onMouseEnter={e => (e.currentTarget.style.color = '#F26722')}
                                    onMouseLeave={e => (e.currentTarget.style.color = '#9ca3af')}>
                                    <Share2 size={12} />
                                </button>
                            )}

                            {item.owner && (
                                <button onClick={() => handleDelete(item.id)} title="삭제"
                                    style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 3, color: '#d1d5db', display: 'flex', flexShrink: 0 }}
                                    onMouseEnter={e => (e.currentTarget.style.color = '#ef4444')}
                                    onMouseLeave={e => (e.currentTarget.style.color = '#d1d5db')}>
                                    <Trash2 size={13} />
                                </button>
                            )}
                        </div>
                    )
                })}
            </div>

            {showUpload && <MyMapUploadModal onClose={() => setShowUpload(false)} onUploaded={fetchList} />}
            {shareTarget && <MyMapShareDialog id={shareTarget.id} name={shareTarget.name} onClose={() => setShareTarget(null)} />}

            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
    )
}
