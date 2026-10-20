'use client'

// 나만의지도 업로드 — 한 화면 마법사: ① 종류(SHP / 엑셀 카드) → ② 파일·미리보기·모드·컬럼 → ③ 이름 → 업로드.
// 엑셀은 PNU 매칭(필지 폴리곤)과 좌표(점) 두 모드다. 주소 모드는 2단계에서 켜지므로 선택지·샘플 모두 숨긴다.
// 서버가 미리보기에 suggestions를 안 주는 옛 서버면 좌표 모드 하나뿐인 옛 흐름(위도·경도 컬럼)으로 동작한다.
// 요청은 엔진의 나만의지도 소스(map.sources.myMap — 짝 백엔드면 adapters/rest)가 보낸다.
// 스타일: gm-modal(공유·보고서와 공용), gm-upload-modal, gm-wizard(마법사 조각). 선택 상태에 따라 바뀌는 값은 gm-is-* 클래스
import { useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'
import { X, Loader2, Layers, FileSpreadsheet, Download, AlertCircle, Info } from 'lucide-react'
import type { ExcelPreviewResponse, MyMapConfirmResult, MyMapQuota, MyMapSampleKind, MyMapUploadMode } from '../../core'
import { useGisMap } from '../../react'
import { cx } from '../cx'
import { describeCoverage, formatCount, sampleFileName } from './format'
import { saveBlob } from './saveBlob'
import { SRID_OPTIONS } from './sridOptions'

interface MyMapUploadModalProps {
    onClose: () => void
    /** 엑셀 확정이 {id, parcelVersion?}을 돌려줬으면 함께 넘긴다(SHP·옛 서버는 없음) */
    onUploaded: (result?: MyMapConfirmResult) => void
    /** 패널이 가진 한도·적재 범위. 없으면 한도 안내가 빠진다 */
    quota?: MyMapQuota | null
}

type Kind = 'shp' | 'excel'

const STEP_LABELS: readonly string[] = Object.freeze(['종류', '파일·컬럼', '이름'])
const PREVIEW_ROWS = 10
/** 화면에서 고르게 하는 엑셀 모드(주소는 2단계) */
const MODES: readonly MyMapUploadMode[] = Object.freeze(['PNU', 'COORD'] as MyMapUploadMode[])
const LEGACY_MODES: readonly MyMapUploadMode[] = Object.freeze(['COORD'] as MyMapUploadMode[])
const MODE_LABELS: Readonly<Record<string, string>> = Object.freeze({ PNU: 'PNU (필지 폴리곤)', COORD: '좌표 (위도·경도)' })
/** 화면에서 받게 하는 샘플(주소는 2단계) */
const SAMPLE_BUTTONS: readonly { kind: MyMapSampleKind; label: string }[] = Object.freeze([
    Object.freeze({ kind: 'pnu' as MyMapSampleKind, label: 'PNU' }),
    Object.freeze({ kind: 'coord' as MyMapSampleKind, label: '좌표' }),
])

/** 샘플 받기 링크 줄. 소스에 downloadSample이 없으면 아무것도 그리지 않는다 */
function SampleLinks({ onError }: { onError: (message: string | null) => void }) {
    const myMap = useGisMap()?.sources.myMap
    const [busy, setBusy] = useState<MyMapSampleKind | null>(null)
    if (!myMap?.downloadSample) return null
    const download = myMap.downloadSample.bind(myMap)

    const handle = async (kind: MyMapSampleKind) => {
        setBusy(kind)
        onError(null)
        try {
            saveBlob(await download(kind), sampleFileName(kind))
        } catch (e) {
            onError(e instanceof Error ? e.message : '샘플을 받지 못했습니다')
        } finally {
            setBusy(null)
        }
    }

    return (
        <div className="gm-wizard__samples" onClick={e => e.stopPropagation()} onKeyDown={e => e.stopPropagation()}>
            <span className="gm-wizard__samples-label">샘플 받기</span>
            {SAMPLE_BUTTONS.map(s => (
                <button key={s.kind} type="button" className="gm-wizard__sample" disabled={busy !== null}
                    onClick={() => handle(s.kind)}>
                    {busy === s.kind ? <Loader2 size={11} className="gm-loader" /> : <Download size={11} />} {s.label}
                </button>
            ))}
        </div>
    )
}

type BannerTone = 'info' | 'warn' | 'error'
const BANNER_CLASS: Readonly<Record<BannerTone, string>> = Object.freeze({
    info: 'gm-wizard__banner--info', warn: 'gm-wizard__banner--warn', error: 'gm-wizard__banner--error',
})

function Banner({ tone, children }: { tone: BannerTone; children: string }) {
    return (
        <div className={cx('gm-wizard__banner', BANNER_CLASS[tone])}>
            {tone === 'info' ? <Info size={12} /> : <AlertCircle size={12} />}
            <span>{children}</span>
        </div>
    )
}

/** 긴 값은 CSS가 말줄임하고 title에 전체 값. 고른 컬럼은 강조 */
function PreviewTable({ preview, selected }: { preview: ExcelPreviewResponse; selected: readonly string[] }) {
    return (
        <div className="gm-wizard__table-wrap">
            <table className="gm-wizard__table">
                <thead>
                    <tr>
                        {preview.headers.map((h, ci) => (
                            <th key={ci} className={cx(selected.includes(h) && 'gm-is-selected')}>{h}</th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {preview.sampleRows.slice(0, PREVIEW_ROWS).map((row, ri) => (
                        <tr key={ri}>
                            {preview.headers.map((h, ci) => (
                                <td key={ci} title={row[ci] ?? ''} className={cx(selected.includes(h) && 'gm-is-selected')}>{row[ci] ?? ''}</td>
                            ))}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    )
}

/** Enter·Space로도 카드를 고른다(카드 자신에서 눌렀을 때만 — 안의 샘플 버튼 키 입력은 그 버튼이 처리) */
const onActivate = (fn: () => void) => (e: KeyboardEvent) => {
    if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) {
        e.preventDefault()
        fn()
    }
}

export default function MyMapUploadModal({ onClose, onUploaded, quota }: MyMapUploadModalProps) {
    const myMap = useGisMap()?.sources.myMap
    const [kind, setKind] = useState<Kind | null>(null)
    const [name, setName] = useState('')
    const [sourceSrid, setSourceSrid] = useState('EPSG:5186')
    const [submitting, setSubmitting] = useState(false)
    const [previewing, setPreviewing] = useState(false)
    const [error, setError] = useState<string | null>(null)

    // shp
    const shpInputRef = useRef<HTMLInputElement>(null)
    const [shpFiles, setShpFiles] = useState<File[]>([])
    const hasPrj = shpFiles.some(f => f.name.toLowerCase().endsWith('.prj'))

    // excel
    const excelInputRef = useRef<HTMLInputElement>(null)
    const [fileName, setFileName] = useState('')
    const [preview, setPreview] = useState<ExcelPreviewResponse | null>(null)
    const [mode, setMode] = useState<MyMapUploadMode>('COORD')
    const [pnuColumn, setPnuColumn] = useState('')
    const [latColumn, setLatColumn] = useState('')
    const [lonColumn, setLonColumn] = useState('')
    const [addressDetected, setAddressDetected] = useState(false)

    /** 서버가 모드·추천을 모르는 옛 서버(suggestions 없음) → 좌표 하나뿐인 옛 흐름 */
    const legacy = preview !== null && preview.suggestions === undefined
    const modes = legacy ? LEGACY_MODES : MODES

    const limits = preview?.limits ?? quota?.maxRows ?? null
    const limit = limits ? (mode === 'PNU' ? limits.pnu : limits.coord) : null
    const totalRows = preview?.totalRows
    const overLimit = limit !== null && totalRows !== undefined && totalRows > limit
    // 한도를 계산할 수 없는데 서버가 한도 초과라고 알린 경우만 서버 경고를 따른다
    const overLimitWarning = (preview?.warnings ?? []).find(w => w.code === 'OVER_LIMIT')
    const serverOverLimit = limit === null && !!overLimitWarning

    const columnsReady = mode === 'PNU' ? !!pnuColumn : !!latColumn && !!lonColumn
    const excelReady = preview !== null && columnsReady && !overLimit && !serverOverLimit
    const fileReady = kind === 'shp' ? shpFiles.length > 0 : excelReady
    /** 지금 단계(머리줄 표시용): 1 종류 · 2 파일·컬럼 · 3 이름 */
    const step = kind === null ? 1 : fileReady ? 3 : 2

    const pickKind = (k: Kind) => {
        if (k === kind) return
        setKind(k)
        setError(null)
    }

    /** 이전: 미리보기가 있으면 파일 고르기로, 아니면 종류 고르기로 */
    const goBack = () => {
        setError(null)
        if (kind === 'excel' && preview) setPreview(null)
        else setKind(null)
    }

    /** 추천 값이 실제 머리글에 있을 때만 쓴다 */
    const header = (p: ExcelPreviewResponse, v: string | null | undefined): string => (v && p.headers.includes(v) ? v : '')

    const handleShpFiles = (files: File[]) => {
        setShpFiles(files)
        if (!name.trim()) {
            const shp = files.find(f => f.name.toLowerCase().endsWith('.shp'))
            if (shp) setName(shp.name.replace(/[.]shp$/i, ''))
        }
    }

    const handleExcelPreview = async (file: File) => {
        setPreviewing(true)
        setError(null)
        try {
            if (!myMap?.previewExcel) throw new Error('미리보기 실패')
            const res = await myMap.previewExcel(file)
            const sg = res.suggestions
            const pnu = header(res, sg?.pnuColumn)
            const lat = header(res, sg?.latColumn)
            const lon = header(res, sg?.lonColumn)
            let next: MyMapUploadMode = 'COORD'
            if (sg) {
                if (sg.mode === 'PNU' || sg.mode === 'COORD') next = sg.mode
                else if (pnu) next = 'PNU'
                else if (lat && lon) next = 'COORD'
                else next = 'PNU'
            }
            setPreview(res)
            setFileName(file.name)
            setMode(next)
            setPnuColumn(pnu)
            setLatColumn(lat)
            setLonColumn(lon)
            setAddressDetected(sg?.mode === 'ADDRESS' && !pnu)
            if (sg?.sourceSrid && SRID_OPTIONS.some(o => o.value === sg.sourceSrid)) setSourceSrid(sg.sourceSrid)
            if (!name.trim()) setName(file.name.replace(/[.]xlsx$/i, ''))
        } catch (e) {
            setError(e instanceof Error ? e.message : '미리보기 실패')
        } finally {
            setPreviewing(false)
            // 같은 파일을 다시 골라도 change가 오도록
            if (excelInputRef.current) excelInputRef.current.value = ''
        }
    }

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

    const handleExcelConfirm = async () => {
        if (!preview || !columnsReady || !name.trim()) {
            setError(mode === 'PNU' ? '이름과 PNU 컬럼을 선택해주세요' : '이름과 위도/경도 컬럼을 선택해주세요')
            return
        }
        if (overLimit || serverOverLimit) {
            setError('행 수가 한도를 넘어 올릴 수 없습니다')
            return
        }
        setSubmitting(true)
        setError(null)
        try {
            if (!myMap?.confirmExcel) throw new Error('업로드 실패')
            let result: void | MyMapConfirmResult
            if (legacy) {
                // 옛 서버 — 옛 호출 그대로
                result = await myMap.confirmExcel({ uploadId: preview.uploadId, name, latColumn, lonColumn, sourceSrid })
            } else if (mode === 'PNU') {
                result = await myMap.confirmExcel({ uploadId: preview.uploadId, name, mode: 'PNU', pnuColumn })
            } else {
                result = await myMap.confirmExcel({ uploadId: preview.uploadId, name, mode: 'COORD', latColumn, lonColumn, sourceSrid })
            }
            onUploaded(result || undefined)
            onClose()
        } catch (e) {
            setError(e instanceof Error ? e.message : '업로드 실패')
        } finally {
            setSubmitting(false)
        }
    }

    const selectedColumns = mode === 'PNU' ? [pnuColumn] : [latColumn, lonColumn]
    const coverageNote = describeCoverage(quota?.coverage)
    const parcelNote = coverageNote.text
    const parcelMissing = coverageNote.missing

    const columnSelect = (label: string, value: string, set: (v: string) => void) => (
        <label className="gm-wizard__field-row">
            <span className="gm-wizard__field-label">{label}</span>
            <select value={value} onChange={e => set(e.target.value)} className="gm-modal__field gm-wizard__field-select">
                <option value="">선택</option>
                {preview?.headers.map((h, i) => <option key={i} value={h}>{h}</option>)}
            </select>
        </label>
    )

    const shpDesc = quota
        ? `.shp·.shx·.dbf·.prj 함께 선택 · 최대 ${formatCount(quota.maxShpFeatures)}개·${formatCount(quota.maxShpMb)}MB`
        : '.shp·.shx·.dbf·.prj 함께 선택'
    const excelDesc = quota
        ? `PNU · 좌표 컬럼 중 하나 · 최대 ${formatCount(quota.maxRows.pnu)}행`
        : 'PNU · 좌표 컬럼 중 하나'

    return (
        <div className="gm-modal" onClick={onClose}>
            <div
                onClick={e => e.stopPropagation()}
                className="gm-modal__dialog gm-upload-modal"
                role="dialog" aria-label="나만의지도 업로드"
            >
                <div className="gm-modal__header">
                    <span className="gm-modal__title">나만의지도 업로드</span>
                    <ol className="gm-wizard__steps">
                        {STEP_LABELS.map((label, i) => (
                            <li key={label} className={cx('gm-wizard__step', step === i + 1 && 'gm-is-active', step > i + 1 && 'gm-is-done')}>
                                {i + 1} {label}
                            </li>
                        ))}
                    </ol>
                    <button onClick={onClose} className="gm-modal__close" aria-label="닫기"><X size={16} /></button>
                </div>

                <div className="gm-modal__body">
                    <div className="gm-wizard__cards" role="radiogroup" aria-label="업로드 종류">
                        <div role="radio" aria-checked={kind === 'shp'} tabIndex={0}
                            className={cx('gm-wizard__card', kind === 'shp' && 'gm-is-active')}
                            onClick={() => pickKind('shp')} onKeyDown={onActivate(() => pickKind('shp'))}>
                            <span className="gm-wizard__card-title"><Layers size={14} /> SHP 파일</span>
                            <span className="gm-wizard__card-desc">{shpDesc}</span>
                        </div>
                        <div role="radio" aria-checked={kind === 'excel'} tabIndex={0}
                            className={cx('gm-wizard__card', kind === 'excel' && 'gm-is-active')}
                            onClick={() => pickKind('excel')} onKeyDown={onActivate(() => pickKind('excel'))}>
                            <span className="gm-wizard__card-title"><FileSpreadsheet size={14} /> 엑셀 (.xlsx)</span>
                            <span className="gm-wizard__card-desc">{excelDesc}</span>
                            <SampleLinks onError={setError} />
                        </div>
                    </div>

                    {kind === 'shp' && (
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
                                onChange={e => handleShpFiles(Array.from(e.target.files ?? []))} />

                            <label className="gm-modal__label">
                                원본 좌표계{hasPrj ? ' (.prj 자동 인식됨 — 아래 선택은 참고용)' : ''}
                            </label>
                            <select value={sourceSrid} onChange={e => setSourceSrid(e.target.value)} className="gm-modal__field">
                                {SRID_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                            </select>
                            <div className="gm-modal__note">
                                {hasPrj
                                    ? '.prj 파일이 포함되어 있어 실제 좌표계를 자동으로 판별합니다. 인식에 실패할 때만 위 선택값이 쓰입니다.'
                                    : '.prj 파일이 없으면 위에서 선택한 좌표계를 그대로 사용합니다.'}
                            </div>
                        </>
                    )}

                    {kind === 'excel' && !preview && (
                        <>
                            <label className="gm-modal__label">엑셀(.xlsx) 파일</label>
                            <div
                                onClick={() => !previewing && excelInputRef.current?.click()}
                                className="gm-upload-modal__drop">
                                {previewing ? <Loader2 size={14} className="gm-loader gm-loader--primary" /> : '.xlsx 파일 선택 (첫 행은 머리글)'}
                            </div>
                            <input ref={excelInputRef} type="file" accept=".xlsx" className="gm-file-input"
                                onChange={e => { const f = e.target.files?.[0]; if (f) handleExcelPreview(f) }} />
                            {quota && (
                                <div className="gm-modal__note">
                                    최대 {formatCount(quota.maxRows.pnu)}행, {formatCount(quota.maxExcelMb)}MB까지 올릴 수 있습니다.
                                </div>
                            )}
                            <div className="gm-modal__note gm-wizard__formula-help">
                                수식이 든 칸은 값으로 붙여넣은 파일을 올려 주세요. 계산된 값이 저장되지 않은 수식은 빈 칸으로 읽힙니다.
                            </div>
                        </>
                    )}

                    {kind === 'excel' && preview && (
                        <>
                            <div className="gm-wizard__file">
                                <FileSpreadsheet size={13} />
                                <span className="gm-wizard__file-name" title={fileName}>{fileName}</span>
                                <span className="gm-wizard__file-meta">
                                    {totalRows !== undefined ? `데이터 ${formatCount(totalRows)}행 · ` : ''}컬럼 {preview.headers.length}개
                                </span>
                                <button type="button" className="gm-wizard__link"
                                    onClick={() => { setPreview(null); setError(null) }}>다른 파일</button>
                            </div>
                            {parcelNote && mode === 'PNU' && (
                                <div className="gm-modal__note" title={coverageNote.title ?? undefined}>{parcelNote}</div>
                            )}

                            {modes.length > 1 && (
                                <>
                                    <span className="gm-modal__label">무엇으로 위치를 찾을까요?{preview.suggestions?.mode ? ' (값 모양으로 추천했습니다)' : ''}</span>
                                    <div className="gm-wizard__modes" role="radiogroup" aria-label="매칭 방식">
                                        {modes.map(m => (
                                            <label key={m} className={cx('gm-wizard__mode', mode === m && 'gm-is-active')}>
                                                <input type="radio" name="gm-mymap-mode" value={m} checked={mode === m}
                                                    onChange={() => { setMode(m); setError(null) }} />
                                                {MODE_LABELS[m]}
                                                {preview.suggestions?.mode === m && <span className="gm-wizard__recommend">(추천)</span>}
                                            </label>
                                        ))}
                                    </div>
                                </>
                            )}

                            {mode === 'PNU' ? (
                                columnSelect('PNU 컬럼', pnuColumn, setPnuColumn)
                            ) : (
                                <>
                                    {columnSelect('위도(Y) 컬럼', latColumn, setLatColumn)}
                                    {columnSelect('경도(X) 컬럼', lonColumn, setLonColumn)}
                                    <label className="gm-wizard__field-row">
                                        <span className="gm-wizard__field-label">원본 좌표계</span>
                                        <select value={sourceSrid} onChange={e => setSourceSrid(e.target.value)} className="gm-modal__field gm-wizard__field-select">
                                            {SRID_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                                        </select>
                                    </label>
                                </>
                            )}

                            {mode === 'PNU' && coverageNote.partial && (
                                <Banner tone="info">적재된 시도 밖의 PNU는 "이 지역 지적도는 아직 제공하지 않습니다"로 실패합니다.</Banner>
                            )}
                            {mode === 'PNU' && parcelMissing && (
                                <Banner tone="warn">지적도 자료 준비 중입니다. 준비가 끝나기 전에는 PNU로 올릴 수 없습니다(좌표 엑셀·SHP는 가능).</Banner>
                            )}
                            {(preview.warnings ?? []).filter(w => w.code !== 'OVER_LIMIT' && (w.code !== 'NUMERIC_PNU_CELLS' || mode === 'PNU')).map(w => (
                                <Banner key={w.code} tone={w.code === 'NUMERIC_PNU_CELLS' ? 'warn' : 'info'}>{w.message}</Banner>
                            ))}
                            {overLimit && limit !== null && totalRows !== undefined && (
                                <Banner tone="error">
                                    {`행이 ${formatCount(totalRows)}개로 한도 ${formatCount(limit)}행을 넘습니다. 행을 줄여 다시 올려 주세요.`}
                                </Banner>
                            )}
                            {serverOverLimit && overLimitWarning && <Banner tone="error">{overLimitWarning.message}</Banner>}
                            {addressDetected && (
                                <Banner tone="info">주소 컬럼이 보이지만 주소로 찾기는 아직 지원하지 않습니다. PNU 또는 좌표 컬럼을 지정해 주세요.</Banner>
                            )}

                            <PreviewTable preview={preview} selected={selectedColumns} />
                            <div className="gm-modal__note">
                                미리보기 {Math.min(preview.sampleRows.length, PREVIEW_ROWS)}행
                                {limit !== null && ` · 최대 ${formatCount(limit)}행까지 올릴 수 있습니다`}
                            </div>
                        </>
                    )}

                    {fileReady && (
                        <label className="gm-wizard__field-row">
                            <span className="gm-wizard__field-label">지도 이름</span>
                            <input value={name} onChange={e => setName(e.target.value)} placeholder="예: 우리 동네 필지"
                                className="gm-modal__field gm-wizard__field-select" />
                        </label>
                    )}

                    {error && <div className="gm-modal__error">{error}</div>}
                </div>

                <div className="gm-wizard__footer">
                    <span className="gm-wizard__footer-note">
                        {kind === 'excel' && !legacy ? '올리면 바로 닫히고, 패널에서 진행률과 결과를 볼 수 있습니다.' : ''}
                    </span>
                    {kind !== null && (
                        <button type="button" className="gm-wizard__back" onClick={goBack} disabled={submitting}>이전</button>
                    )}
                    <button type="button" className="gm-wizard__submit" disabled={submitting || !fileReady}
                        onClick={kind === 'shp' ? handleShpSubmit : handleExcelConfirm}>
                        {submitting && <Loader2 size={13} className="gm-loader" />}
                        업로드
                    </button>
                </div>
            </div>
        </div>
    )
}
