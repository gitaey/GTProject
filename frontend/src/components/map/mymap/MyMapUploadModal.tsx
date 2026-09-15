'use client'

// 나만의지도 업로드 모달 — shp(다중 파일) 또는 엑셀(2단계: 프리뷰 -> 컬럼 선택) 업로드.
import { useRef, useState } from 'react'
import { X, Loader2 } from 'lucide-react'
import { getToken } from '@/stores/authStore'
import { ExcelPreviewResponse, SRID_OPTIONS } from './types'

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8080'

function authHeaders(): Record<string, string> {
    const token = getToken()
    return token ? { Authorization: `Bearer ${token}` } : {}
}

interface MyMapUploadModalProps {
    onClose: () => void
    onUploaded: () => void
}

type Mode = 'shp' | 'excel'

export default function MyMapUploadModal({ onClose, onUploaded }: MyMapUploadModalProps) {
    const [mode, setMode] = useState<Mode>('shp')
    const [name, setName] = useState('')
    const [sourceSrid, setSourceSrid] = useState('EPSG:5186')
    const [submitting, setSubmitting] = useState(false)
    const [error, setError] = useState<string | null>(null)

    // shp
    const shpInputRef = useRef<HTMLInputElement>(null)
    const [shpFiles, setShpFiles] = useState<File[]>([])
    const hasPrj = shpFiles.some(f => f.name.toLowerCase().endsWith('.prj'))

    // excel
    const excelInputRef = useRef<HTMLInputElement>(null)
    const [preview, setPreview] = useState<ExcelPreviewResponse | null>(null)
    const [latColumn, setLatColumn] = useState('')
    const [lonColumn, setLonColumn] = useState('')

    const handleShpSubmit = async () => {
        if (shpFiles.length === 0 || !name.trim()) {
            setError('이름과 shp 파일 세트(.shp/.dbf 최소)를 선택해주세요')
            return
        }
        setSubmitting(true)
        setError(null)
        try {
            const formData = new FormData()
            shpFiles.forEach(f => formData.append('files', f))
            formData.append('name', name)
            formData.append('sourceSrid', sourceSrid)
            const res = await fetch(`${API}/api/mymap/upload/shp`, {
                method: 'POST', headers: authHeaders(), body: formData,
            })
            const json = await res.json()
            if (!json.success) throw new Error(json.message ?? '업로드 실패')
            onUploaded()
            onClose()
        } catch (e) {
            setError(e instanceof Error ? e.message : '업로드 실패')
        } finally {
            setSubmitting(false)
        }
    }

    const handleExcelPreview = async (file: File) => {
        setSubmitting(true)
        setError(null)
        try {
            const formData = new FormData()
            formData.append('file', file)
            const res = await fetch(`${API}/api/mymap/upload/excel/preview`, {
                method: 'POST', headers: authHeaders(), body: formData,
            })
            const json = await res.json()
            if (!json.success) throw new Error(json.message ?? '미리보기 실패')
            setPreview(json.data)
            if (!name.trim()) setName(file.name.replace(/\.xlsx$/i, ''))
        } catch (e) {
            setError(e instanceof Error ? e.message : '미리보기 실패')
        } finally {
            setSubmitting(false)
        }
    }

    const handleExcelConfirm = async () => {
        if (!preview || !latColumn || !lonColumn || !name.trim()) {
            setError('이름과 위도/경도 컬럼을 선택해주세요')
            return
        }
        setSubmitting(true)
        setError(null)
        try {
            const res = await fetch(`${API}/api/mymap/upload/excel/confirm`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...authHeaders() },
                body: JSON.stringify({ uploadId: preview.uploadId, name, latColumn, lonColumn, sourceSrid }),
            })
            const json = await res.json()
            if (!json.success) throw new Error(json.message ?? '업로드 실패')
            onUploaded()
            onClose()
        } catch (e) {
            setError(e instanceof Error ? e.message : '업로드 실패')
        } finally {
            setSubmitting(false)
        }
    }

    return (
        <div style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 1000,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
        }} onClick={onClose}>
            <div
                onClick={e => e.stopPropagation()}
                style={{ background: '#fff', borderRadius: 10, width: 380, maxHeight: '80vh', overflowY: 'auto', boxShadow: '0 8px 30px rgba(0,0,0,0.2)' }}
            >
                <div style={{ padding: '12px 14px', borderBottom: '2px solid #F26722', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: '#F26722' }}>나만의지도 업로드</span>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af' }}><X size={16} /></button>
                </div>

                <div style={{ display: 'flex', borderBottom: '1px solid #f3f4f6' }}>
                    {(['shp', 'excel'] as Mode[]).map(m => (
                        <button key={m} onClick={() => { setMode(m); setError(null) }}
                            style={{
                                flex: 1, padding: '8px 0', fontSize: 12, fontWeight: 600, border: 'none', cursor: 'pointer',
                                background: mode === m ? 'rgba(242,103,34,0.06)' : '#fff',
                                color: mode === m ? '#F26722' : '#9ca3af',
                                borderBottom: mode === m ? '2px solid #F26722' : '2px solid transparent',
                            }}>
                            {m === 'shp' ? 'SHP 파일' : '엑셀 파일'}
                        </button>
                    ))}
                </div>

                <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <label style={{ fontSize: 11, color: '#374151', fontWeight: 600 }}>지도 이름</label>
                    <input value={name} onChange={e => setName(e.target.value)} placeholder="예: 우리 동네 필지"
                        style={{ fontSize: 12, padding: '6px 8px', border: '1px solid #e5e7eb', borderRadius: 6 }} />

                    <label style={{ fontSize: 11, color: '#374151', fontWeight: 600 }}>
                        원본 좌표계{mode === 'shp' && hasPrj ? ' (.prj 자동 인식됨 — 아래 선택은 참고용)' : ''}
                    </label>
                    <select value={sourceSrid} onChange={e => setSourceSrid(e.target.value)}
                        style={{ fontSize: 12, padding: '6px 8px', border: '1px solid #e5e7eb', borderRadius: 6 }}>
                        {SRID_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                    {mode === 'shp' && (
                        <div style={{ fontSize: 10.5, color: '#9ca3af' }}>
                            {hasPrj
                                ? '.prj 파일이 포함되어 있어 실제 좌표계를 자동으로 판별합니다. 인식에 실패할 때만 위 선택값이 쓰입니다.'
                                : '.prj 파일이 없으면 위에서 선택한 좌표계를 그대로 사용합니다.'}
                        </div>
                    )}

                    {mode === 'shp' ? (
                        <>
                            <label style={{ fontSize: 11, color: '#374151', fontWeight: 600 }}>
                                shp 파일 세트 (.shp, .shx, .dbf, .prj 함께 선택 — zip 불필요)
                            </label>
                            <div
                                onClick={() => shpInputRef.current?.click()}
                                style={{
                                    border: '1.5px dashed #d1d5db', borderRadius: 7, padding: '14px 10px',
                                    textAlign: 'center', cursor: 'pointer', background: '#f9fafb', fontSize: 11, color: '#9ca3af',
                                }}>
                                {shpFiles.length > 0 ? shpFiles.map(f => f.name).join(', ') : '.shp/.shx/.dbf/.prj 파일들을 함께 선택'}
                            </div>
                            <input ref={shpInputRef} type="file" multiple accept=".shp,.shx,.dbf,.prj" style={{ display: 'none' }}
                                onChange={e => setShpFiles(Array.from(e.target.files ?? []))} />

                            {error && <div style={{ fontSize: 11, color: '#ef4444' }}>{error}</div>}

                            <button onClick={handleShpSubmit} disabled={submitting}
                                style={{
                                    marginTop: 4, padding: '8px 0', borderRadius: 6, border: 'none',
                                    background: '#F26722', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                                }}>
                                {submitting && <Loader2 size={13} style={{ animation: 'spin 0.8s linear infinite' }} />}
                                업로드
                            </button>
                        </>
                    ) : (
                        <>
                            {!preview ? (
                                <>
                                    <label style={{ fontSize: 11, color: '#374151', fontWeight: 600 }}>엑셀(.xlsx) 파일</label>
                                    <div
                                        onClick={() => excelInputRef.current?.click()}
                                        style={{
                                            border: '1.5px dashed #d1d5db', borderRadius: 7, padding: '14px 10px',
                                            textAlign: 'center', cursor: 'pointer', background: '#f9fafb', fontSize: 11, color: '#9ca3af',
                                        }}>
                                        .xlsx 파일 선택 (첫 행은 헤더)
                                    </div>
                                    <input ref={excelInputRef} type="file" accept=".xlsx" style={{ display: 'none' }}
                                        onChange={e => { const f = e.target.files?.[0]; if (f) handleExcelPreview(f) }} />
                                </>
                            ) : (
                                <>
                                    <label style={{ fontSize: 11, color: '#374151', fontWeight: 600 }}>위도(Y) 컬럼</label>
                                    <select value={latColumn} onChange={e => setLatColumn(e.target.value)}
                                        style={{ fontSize: 12, padding: '6px 8px', border: '1px solid #e5e7eb', borderRadius: 6 }}>
                                        <option value="">선택</option>
                                        {preview.headers.map(h => <option key={h} value={h}>{h}</option>)}
                                    </select>
                                    <label style={{ fontSize: 11, color: '#374151', fontWeight: 600 }}>경도(X) 컬럼</label>
                                    <select value={lonColumn} onChange={e => setLonColumn(e.target.value)}
                                        style={{ fontSize: 12, padding: '6px 8px', border: '1px solid #e5e7eb', borderRadius: 6 }}>
                                        <option value="">선택</option>
                                        {preview.headers.map(h => <option key={h} value={h}>{h}</option>)}
                                    </select>

                                    <div style={{ fontSize: 10.5, color: '#9ca3af' }}>
                                        미리보기 {preview.sampleRows.length}행 / 컬럼 {preview.headers.length}개
                                    </div>
                                </>
                            )}

                            {error && <div style={{ fontSize: 11, color: '#ef4444' }}>{error}</div>}

                            {preview && (
                                <button onClick={handleExcelConfirm} disabled={submitting}
                                    style={{
                                        marginTop: 4, padding: '8px 0', borderRadius: 6, border: 'none',
                                        background: '#F26722', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                                    }}>
                                    {submitting && <Loader2 size={13} style={{ animation: 'spin 0.8s linear infinite' }} />}
                                    업로드
                                </button>
                            )}
                        </>
                    )}
                </div>
                <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
            </div>
        </div>
    )
}
