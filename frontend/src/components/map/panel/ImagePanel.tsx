'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { Eye, EyeOff, Trash2, Upload, Loader2 } from 'lucide-react'
import OlMap from 'ol/Map'
import { useGeoTiffLayer, GeoTiffItem } from '@/hooks/map/useGeoTiffLayer'
import { getToken } from '@/stores/authStore'

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8080'

function formatFileSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
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
  const { addLayer, removeLayer, isVisible } = useGeoTiffLayer(map)

  const fetchList = useCallback(async () => {
    try {
      const token = getToken()
      const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {}
      const res = await fetch(`${API}/api/geotiff`, { headers })
      const json = await res.json()
      if (json.success) setItems(json.data ?? [])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchList() }, [fetchList])

  const handleUpload = useCallback(async (file: File) => {
    if (!file.name.match(/\.tiff?$/i)) return
    setUploading(true)
    try {
      const token = getToken()
      const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {}
      const formData = new FormData()
      formData.append('file', file)
      const res = await fetch(`${API}/api/geotiff/upload`, { method: 'POST', headers, body: formData })
      const json = await res.json()
      if (json.success) await fetchList()
    } finally {
      setUploading(false)
    }
  }, [fetchList])

  const handleDelete = useCallback(async (id: number) => {
    const token = getToken()
    const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {}
    await fetch(`${API}/api/geotiff/${id}`, { method: 'DELETE', headers })
    removeLayer(id)
    setVisibleIds(prev => { const next = new Set(prev); next.delete(id); return next })
    setItems(prev => prev.filter(i => i.id !== id))
  }, [removeLayer])

  const toggleVisibility = useCallback((item: GeoTiffItem) => {
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
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#1e293b' }}>
      {/* 헤더 */}
      <div style={{
        padding: '10px 10px 10px 12px',
        borderBottom: '1px solid rgba(255,255,255,0.08)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0,
      }}>
        <span style={{ fontSize: '12.5px', fontWeight: 700, color: '#f1f5f9' }}>항공영상</span>
      </div>

      {/* 업로드 영역 */}
      <div style={{ padding: '10px 10px 6px', flexShrink: 0 }}>
        <div
          onDragOver={e => { e.preventDefault(); setDragging(true) }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          onClick={() => !uploading && fileInputRef.current?.click()}
          style={{
            border: `1.5px dashed ${dragging ? '#F26722' : 'rgba(255,255,255,0.18)'}`,
            borderRadius: '8px',
            padding: '14px 10px',
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px',
            cursor: uploading ? 'default' : 'pointer',
            background: dragging ? 'rgba(242,103,34,0.08)' : 'rgba(255,255,255,0.03)',
            transition: 'border-color 0.15s, background 0.15s',
          }}
        >
          {uploading ? (
            <Loader2 size={20} color="#F26722" style={{ animation: 'spin 0.8s linear infinite' }} />
          ) : (
            <Upload size={18} color="#64748b" />
          )}
          <span style={{ fontSize: '11px', color: '#64748b', textAlign: 'center', lineHeight: 1.4 }}>
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
              width: '20px', height: '20px', borderRadius: '50%',
              border: '2px solid #F26722', borderTopColor: 'transparent',
              animation: 'spin 0.8s linear infinite',
            }} />
          </div>
        ) : items.length === 0 ? (
          <div style={{ padding: '24px 16px', textAlign: 'center', color: '#475569', fontSize: '11.5px' }}>
            업로드된 파일 없음
          </div>
        ) : items.map(item => {
          const active = visibleIds.has(item.id)
          return (
            <div key={item.id} style={{
              display: 'flex', alignItems: 'center', gap: '6px',
              padding: '7px 10px 7px 12px',
              borderBottom: '1px solid rgba(255,255,255,0.05)',
              background: active ? 'rgba(242,103,34,0.07)' : 'transparent',
            }}>
              {/* 파일명 + 크기 */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontSize: '11.5px',
                  color: active ? '#f1f5f9' : '#94a3b8',
                  fontWeight: active ? 500 : 400,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {item.originalName}
                </div>
                <div style={{ fontSize: '10.5px', color: '#475569', marginTop: '1px' }}>
                  {formatFileSize(item.fileSize)}
                </div>
              </div>

              {/* 가시성 토글 */}
              <button
                onClick={() => toggleVisibility(item)}
                title={active ? '숨기기' : '표시'}
                style={{
                  background: 'none', border: 'none', cursor: 'pointer', padding: '3px',
                  color: active ? '#F26722' : '#475569', display: 'flex', flexShrink: 0,
                }}
              >
                {active ? <Eye size={14} /> : <EyeOff size={14} />}
              </button>

              {/* 삭제 */}
              <button
                onClick={() => handleDelete(item.id)}
                title="삭제"
                style={{
                  background: 'none', border: 'none', cursor: 'pointer', padding: '3px',
                  color: '#475569', display: 'flex', flexShrink: 0,
                }}
                onMouseEnter={e => (e.currentTarget.style.color = '#ef4444')}
                onMouseLeave={e => (e.currentTarget.style.color = '#475569')}
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
