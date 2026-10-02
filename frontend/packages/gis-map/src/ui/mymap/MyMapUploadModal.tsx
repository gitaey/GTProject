'use client'

// 나만의지도 업로드 모달 — shp(다중 파일) 또는 엑셀(2단계: 프리뷰 -> 컬럼 선택) 업로드.
// 요청은 엔진의 나만의지도 소스(map.sources.myMap — 짝 백엔드면 adapters/rest)가 보낸다.
// 스타일: gm-modal(공유 대화상자와 공용), gm-upload-modal (FE-5b-2). 탭의 선택 상태에 따라 바뀌는 값만 인라인 style
import { useRef, useState } from 'react'
import { X, Loader2 } from 'lucide-react'
import type { ExcelPreviewResponse } from '../../core'
import { useGisMap } from '../../react'
import { SRID_OPTIONS } from './sridOptions'

interface MyMapUploadModalProps {
    onClose: () => void
    onUploaded: () => void
}

type Mode = 'shp' | 'excel'

export default function MyMapUploadModal({ onClose, onUploaded }: MyMapUploadModalProps) {
    const myMap = useGisMap()?.sources.myMap
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
            if (!myMap?.uploadShp) throw new Error('업로드 실패')
            // 실패(success:false)면 소스가 서버 message(없으면 '업로드 실패')로 throw
            await myMap.uploadShp({ files: shpFiles, name, sourceSrid })
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
            if (!myMap?.previewExcel) throw new Error('미리보기 실패')
            setPreview(await myMap.previewExcel(file))
            if (!name.trim()) setName(file.name.replace(/[.]xlsx$/i, ''))
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
            if (!myMap?.confirmExcel) throw new Error('업로드 실패')
            await myMap.confirmExcel({ uploadId: preview.uploadId, name, latColumn, lonColumn, sourceSrid })
            onUploaded()
            onClose()
        } catch (e) {
            setError(e instanceof Error ? e.message : '업로드 실패')
        } finally {
            setSubmitting(false)
        }
    }

    return (
        <div className="gm-modal" onClick={onClose}>
            <div
                onClick={e => e.stopPropagation()}
                className="gm-modal__dialog gm-upload-modal"
            >
                <div className="gm-modal__header">
                    <span className="gm-modal__title">나만의지도 업로드</span>
                    <button onClick={onClose} className="gm-modal__close"><X size={16} /></button>
                </div>

                <div className="gm-upload-modal__tabs">
                    {(['shp', 'excel'] as Mode[]).map(m => (
                        <button key={m} onClick={() => { setMode(m); setError(null) }}
                            className="gm-upload-modal__tab"
                            style={{
                                background: mode === m ? 'rgba(var(--gm-primary-rgb), 0.06)' : '#fff',
                                color: mode === m ? 'var(--gm-primary)' : '#9ca3af',
                                borderBottom: mode === m ? '2px solid var(--gm-primary)' : '2px solid transparent',
                            }}>
                            {m === 'shp' ? 'SHP 파일' : '엑셀 파일'}
                        </button>
                    ))}
                </div>

                <div className="gm-modal__body">
                    <label className="gm-modal__label">지도 이름</label>
                    <input value={name} onChange={e => setName(e.target.value)} placeholder="예: 우리 동네 필지"
                        className="gm-modal__field" />

                    <label className="gm-modal__label">
                        원본 좌표계{mode === 'shp' && hasPrj ? ' (.prj 자동 인식됨 — 아래 선택은 참고용)' : ''}
                    </label>
                    <select value={sourceSrid} onChange={e => setSourceSrid(e.target.value)}
                        className="gm-modal__field">
                        {SRID_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                    {mode === 'shp' && (
                        <div className="gm-modal__note">
                            {hasPrj
                                ? '.prj 파일이 포함되어 있어 실제 좌표계를 자동으로 판별합니다. 인식에 실패할 때만 위 선택값이 쓰입니다.'
                                : '.prj 파일이 없으면 위에서 선택한 좌표계를 그대로 사용합니다.'}
                        </div>
                    )}

                    {mode === 'shp' ? (
                        <>
                            <label className="gm-modal__label">
                                shp 파일 세트 (.shp, .shx, .dbf, .prj 함께 선택 — zip 불필요)
                            </label>
                            <div
                                onClick={() => shpInputRef.current?.click()}
                                className="gm-upload-modal__drop">
                                {shpFiles.length > 0 ? shpFiles.map(f => f.name).join(', ') : '.shp/.shx/.dbf/.prj 파일들을 함께 선택'}
                            </div>
                            <input ref={shpInputRef} type="file" multiple accept=".shp,.shx,.dbf,.prj" className="gm-file-input"
                                onChange={e => setShpFiles(Array.from(e.target.files ?? []))} />

                            {error && <div className="gm-modal__error">{error}</div>}

                            <button onClick={handleShpSubmit} disabled={submitting}
                                className="gm-modal__submit">
                                {submitting && <Loader2 size={13} className="gm-loader" />}
                                업로드
                            </button>
                        </>
                    ) : (
                        <>
                            {!preview ? (
                                <>
                                    <label className="gm-modal__label">엑셀(.xlsx) 파일</label>
                                    <div
                                        onClick={() => excelInputRef.current?.click()}
                                        className="gm-upload-modal__drop">
                                        .xlsx 파일 선택 (첫 행은 헤더)
                                    </div>
                                    <input ref={excelInputRef} type="file" accept=".xlsx" className="gm-file-input"
                                        onChange={e => { const f = e.target.files?.[0]; if (f) handleExcelPreview(f) }} />
                                </>
                            ) : (
                                <>
                                    <label className="gm-modal__label">위도(Y) 컬럼</label>
                                    <select value={latColumn} onChange={e => setLatColumn(e.target.value)}
                                        className="gm-modal__field">
                                        <option value="">선택</option>
                                        {preview.headers.map(h => <option key={h} value={h}>{h}</option>)}
                                    </select>
                                    <label className="gm-modal__label">경도(X) 컬럼</label>
                                    <select value={lonColumn} onChange={e => setLonColumn(e.target.value)}
                                        className="gm-modal__field">
                                        <option value="">선택</option>
                                        {preview.headers.map(h => <option key={h} value={h}>{h}</option>)}
                                    </select>

                                    <div className="gm-modal__note">
                                        미리보기 {preview.sampleRows.length}행 / 컬럼 {preview.headers.length}개
                                    </div>
                                </>
                            )}

                            {error && <div className="gm-modal__error">{error}</div>}

                            {preview && (
                                <button onClick={handleExcelConfirm} disabled={submitting}
                                    className="gm-modal__submit">
                                    {submitting && <Loader2 size={13} className="gm-loader" />}
                                    업로드
                                </button>
                            )}
                        </>
                    )}
                </div>
            </div>
        </div>
    )
}
