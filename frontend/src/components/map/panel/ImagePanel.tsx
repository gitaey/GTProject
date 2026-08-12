'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { Trash2, Upload, Loader2, AlertCircle, RefreshCw } from 'lucide-react'
import OlMap from 'ol/Map'
import { useGeoTiffLayer, GeoTiffItem } from '@/hooks/map/useGeoTiffLayer'
import { getToken, useAuthStore } from '@/stores/authStore'

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8080'

function formatFileSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

function authHeaders(): Record<string, string> {
  const token = getToken()
  return token ? { Authorization: `Bearer ${token}` } : {}
}

interface ImagePanelProps {
  map: OlMap | null
}

export default function ImagePanel({ map }: ImagePanelProps) {
  const [items, setItems] = useState<GeoTiffItem[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [visibleIds, setVisibleIds] = useState<Set<number>>(new Set())
  const fileInputRef = useRef<HTMLInputElement>(null)
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const { addLayer, removeLayer } = useGeoTiffLayer(map)
  const user = useAuthStore(s => s.user)

  const fetchList = useCallback(async () => {
    try {
      const res = await fetch(`${API}/api/geotiff`, { headers: authHeaders() })
      const json = await res.json()
      if (json.success) setItems(json.data ?? [])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchList() }, [fetchList])

  // PROCESSING 상태 항목이 있으면 3초마다 상태 폴링
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
        // 비동기 상태 체크 (setState 내부라서 side effect로 처리)
        processing.forEach(async item => {
          try {
            const res = await fetch(`${API}/api/geotiff/${item.id}/status`, { headers: authHeaders() })
            const json = await res.json()
            if (!json.success) return
            const s = json.data
            if (s.status !== 'PROCESSING') {
              setItems(cur => cur.map(i => i.id === item.id ? {
                ...i,
                status: s.status,
                tileUrl: s.tileUrl ?? i.tileUrl,
                minLon: s.minLon, minLat: s.minLat,
                maxLon: s.maxLon, maxLat: s.maxLat,
              } : i))
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

  const handleUpload = useCallback(async (file: File) => {
    if (!file.name.match(/\.tiff?$/i)) return
    setUploading(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      if (user?.userId) formData.append('uploadedBy', user.userId)
      const res = await fetch(`${API}/api/geotiff/upload`, {
        method: 'POST',
        headers: authHeaders(),
        body: formData,
      })
      const json = await res.json()
      if (json.success) {
        const newItem: GeoTiffItem = {
          ...json.data,
          tileUrl: json.data.tileUrl ?? `/api/geotiff/tiles/${json.data.id}/{z}/{x}/{y}.png`,
        }
        setItems(prev => [newItem, ...prev])
        startPolling()
      }
    } finally {
      setUploading(false)
    }
  }, [startPolling])

  const handleReprocessBounds = useCallback(async (id: number) => {
    setItems(prev => prev.map(i => i.id === id ? { ...i, status: 'PROCESSING' } : i))
    await fetch(`${API}/api/geotiff/${id}/reprocess-bounds`, { method: 'POST', headers: authHeaders() })
    startPolling()
  }, [startPolling])

  const handleDelete = useCallback(async (id: number) => {
    await fetch(`${API}/api/geotiff/${id}`, { method: 'DELETE', headers: authHeaders() })
    removeLayer(id)
    setVisibleIds(prev => { const next = new Set(prev); next.delete(id); return next })
    setItems(prev => prev.filter(i => i.id !== id))
  }, [removeLayer])

  const toggleVisibility = useCallback((item: GeoTiffItem) => {
    if (item.status !== 'READY') return
    if (visibleIds.has(item.id)) {
      removeLayer(item.id)
      setVisibleIds(prev => { const next = new Set(prev); next.delete(item.id); return next })
    } else {
      addLayer(item)
      setVisibleIds(prev => new Set([...prev, item.id]))
    }
  }, [visibleIds, addLayer, removeLayer])

  const onDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) handleUpload(file)
  }, [handleUpload])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#fff' }}>
      {/* 헤더 */}
      <div style={{
        padding: '10px 10px 10px 12px',
        borderBottom: '1px solid #e5e7eb',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0,
      }}>
        <span style={{ fontSize: '12.5px', fontWeight: 700, color: '#374151' }}>항공영상</span>
      </div>

      {/* 업로드 영역 */}
      <div style={{ padding: '10px 10px 6px', flexShrink: 0 }}>
        <div
          onDragOver={e => { e.preventDefault(); setDragging(true) }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          onClick={() => !uploading && fileInputRef.current?.click()}
          style={{
            border: `1.5px dashed ${dragging ? '#F26722' : '#d1d5db'}`,
            borderRadius: '7px',
            padding: '14px 10px',
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px',
            cursor: uploading ? 'default' : 'pointer',
            background: dragging ? 'rgba(242,103,34,0.05)' : '#f9fafb',
            transition: 'border-color 0.15s, background 0.15s',
          }}
        >
          {uploading ? (
            <Loader2 size={18} color="#F26722" style={{ animation: 'spin 0.8s linear infinite' }} />
          ) : (
            <Upload size={16} color="#9ca3af" />
          )}
          <span style={{ fontSize: '11px', color: '#9ca3af', textAlign: 'center', lineHeight: 1.4 }}>
            {uploading ? '업로드 중...' : '.tif / .tiff 파일을 드래그하거나 클릭'}
          </span>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept=".tif,.tiff"
          style={{ display: 'none' }}
          onChange={e => { const f = e.target.files?.[0]; if (f) handleUpload(f); e.target.value = '' }}
        />
      </div>

      {/* 목록 */}
      <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', paddingBottom: '8px' }}>
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '32px 0' }}>
            <div style={{
              width: '18px', height: '18px', borderRadius: '50%',
              border: '2px solid #F26722', borderTopColor: 'transparent',
              animation: 'spin 0.8s linear infinite',
            }} />
          </div>
        ) : items.length === 0 ? (
          <div style={{ padding: '24px 16px', textAlign: 'center', color: '#9ca3af', fontSize: '11.5px' }}>
            업로드된 파일 없음
          </div>
        ) : items.map(item => {
          const active = visibleIds.has(item.id)
          const isProcessing = item.status === 'PROCESSING'
          const isFailed = item.status === 'FAILED'
          return (
            <div key={item.id} style={{
              display: 'flex', alignItems: 'center', gap: '6px',
              padding: '7px 10px 7px 12px',
              borderBottom: '1px solid #f3f4f6',
              background: active ? 'rgba(242,103,34,0.04)' : 'transparent',
            }}>
              {/* 체크박스 (가시성 토글) */}
              <input
                type="checkbox"
                checked={active}
                disabled={isProcessing || isFailed}
                onChange={() => toggleVisibility(item)}
                style={{
                  width: '13px', height: '13px', flexShrink: 0,
                  accentColor: '#F26722', cursor: isProcessing || isFailed ? 'default' : 'pointer',
                }}
              />

              {/* 파일명 + 크기 + 상태 */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontSize: '11.5px',
                  color: isFailed ? '#ef4444' : active ? '#111827' : '#374151',
                  fontWeight: active ? 500 : 400,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {item.originalName}
                </div>
                <div style={{ fontSize: '10.5px', color: '#9ca3af', marginTop: '1px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  {formatFileSize(item.fileSize)}
                  {isProcessing && (
                    <span style={{ color: '#F26722', display: 'flex', alignItems: 'center', gap: '3px' }}>
                      <Loader2 size={9} style={{ animation: 'spin 0.8s linear infinite' }} />
                      변환 중
                    </span>
                  )}
                  {isFailed && (
                    <span style={{ color: '#ef4444', display: 'flex', alignItems: 'center', gap: '3px' }}>
                      <AlertCircle size={9} />
                      실패
                    </span>
                  )}
                </div>
              </div>

              {/* bounds 없는 READY 항목: 재처리 버튼 */}
              {item.status === 'READY' && item.minLon == null && (
                <button
                  onClick={() => handleReprocessBounds(item.id)}
                  title="좌표 재추출"
                  style={{
                    background: 'none', border: 'none', cursor: 'pointer', padding: '3px',
                    color: '#9ca3af', display: 'flex', flexShrink: 0,
                  }}
                  onMouseEnter={e => (e.currentTarget.style.color = '#F26722')}
                  onMouseLeave={e => (e.currentTarget.style.color = '#9ca3af')}
                >
                  <RefreshCw size={12} />
                </button>
              )}

              {/* 삭제 */}
              <button
                onClick={() => handleDelete(item.id)}
                title="삭제"
                style={{
                  background: 'none', border: 'none', cursor: 'pointer', padding: '3px',
                  color: '#d1d5db', display: 'flex', flexShrink: 0,
                }}
                onMouseEnter={e => (e.currentTarget.style.color = '#ef4444')}
                onMouseLeave={e => (e.currentTarget.style.color = '#d1d5db')}
              >
                <Trash2 size={13} />
              </button>
            </div>
          )
        })}
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
