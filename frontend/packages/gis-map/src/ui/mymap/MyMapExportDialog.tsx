'use client'

// 나만의지도 레이어 내보내기 — ⋯ 메뉴 `내보내기…`가 연다. 형식(엑셀·GeoJSON)·좌표계·(엑셀) 매칭 실패 행 포함을 골라 받는다.
// 스타일: gm-modal(공용 틀), gm-export-dialog, gm-delivery(형식 카드). 요청은 소스의 exportLayer가 보내고 저장(saveBlob)은 여기서 한다.
// 내려받기 중에는 `내려받기` 단추만 잠그고(중복 클릭 방지) 취소·X·Esc는 열어 둔다 — 닫으면 진행 중 요청을 AbortSignal로 취소한다(소스가 signal을 지원하면 서버 연결도 끊김. 그 전에 온 응답은 어차피 버린다).
import { useEffect, useRef, useState } from 'react'
import { X, Loader2, Download } from 'lucide-react'
import type { MyMapExportFormat, MyMapExportSrid } from '../../core'
import { useGisMap } from '../../react'
import { cx } from '../cx'
import { formatCount } from './format'
import { saveBlob } from './saveBlob'
import { DEFAULT_EXPORT_SRID, EXPORT_SRID_OPTIONS, toExportSrid } from './sridOptions'

interface MyMapExportDialogProps {
    id: number
    name: string
    /** 목록에 나온 피처 수(하단 안내) */
    featureCount: number
    onClose: () => void
}

const FORMAT_ITEMS: readonly { value: MyMapExportFormat; title: string; desc: string }[] = Object.freeze([
    Object.freeze({ value: 'xlsx' as MyMapExportFormat, title: '엑셀 (.xlsx)', desc: '속성 + 대표점 좌표 열' }),
    Object.freeze({ value: 'geojson' as MyMapExportFormat, title: 'GeoJSON', desc: '면 모양 그대로' }),
])

export default function MyMapExportDialog({ id, name, featureCount, onClose }: MyMapExportDialogProps) {
    const myMap = useGisMap()?.sources.myMap
    const [format, setFormat] = useState<MyMapExportFormat>('xlsx')
    const [srid, setSrid] = useState<MyMapExportSrid>(DEFAULT_EXPORT_SRID)
    const [includeFailed, setIncludeFailed] = useState(false)
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState<string | null>(null)
    /** 내려받았지만 실패 행은 보관 기간이 지나 못 담았다는 안내(있으면 창을 닫지 않고 보여 준다) */
    const [skippedNote, setSkippedNote] = useState(false)
    const busyRef = useRef(false)
    const aliveRef = useRef(true)
    const abortRef = useRef<AbortController | null>(null)
    const closeRef = useRef(onClose)
    closeRef.current = onClose
    const startRef = useRef<HTMLButtonElement>(null)

    useEffect(() => {
        aliveRef.current = true
        startRef.current?.focus()
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') closeRef.current() }
        document.addEventListener('keydown', onKey)
        return () => {
            aliveRef.current = false
            abortRef.current?.abort()
            document.removeEventListener('keydown', onKey)
        }
    }, [])

    const isXlsx = format === 'xlsx'

    const handleDownload = async () => {
        if (busyRef.current) return
        if (!myMap?.exportLayer) {
            setError('내보내기를 할 수 없습니다')
            return
        }
        const abort = new AbortController()
        abortRef.current = abort
        busyRef.current = true
        setBusy(true)
        setError(null)
        setSkippedNote(false)
        try {
            const res = await myMap.exportLayer(id, { format, srid, includeFailed: isXlsx && includeFailed }, abort.signal)
            if (!aliveRef.current) return
            saveBlob(res.blob, res.fileName)
            if (res.failedSkipped) setSkippedNote(true)
            else closeRef.current()
        } catch (e) {
            // 닫혀서 취소된 요청(AbortError)은 문구를 띄우지 않는다
            if (aliveRef.current && !abort.signal.aborted) setError(e instanceof Error && e.message ? e.message : '내보내기에 실패했습니다')
        } finally {
            if (abortRef.current === abort) abortRef.current = null
            busyRef.current = false
            if (aliveRef.current) setBusy(false)
        }
    }

    return (
        <div className="gm-modal" onClick={onClose}>
            <div onClick={e => e.stopPropagation()} className="gm-modal__dialog gm-export-dialog" role="dialog" aria-modal="true" aria-label="내보내기">
                <div className="gm-modal__header">
                    <span className="gm-modal__title gm-export-dialog__title" title={name}>내보내기 — {name}</span>
                    <button onClick={onClose} className="gm-modal__close" aria-label="닫기"><X size={16} /></button>
                </div>

                <div className="gm-modal__body">
                    <div className="gm-delivery">
                        <span className="gm-modal__label">형식</span>
                        <div className="gm-delivery__options" role="radiogroup" aria-label="형식">
                            {FORMAT_ITEMS.map(it => (
                                <label key={it.value} className={cx('gm-delivery__option', format === it.value && 'gm-is-active')}>
                                    <span className="gm-delivery__head">
                                        <input type="radio" name="gm-mymap-export-format" value={it.value} checked={format === it.value}
                                            disabled={busy} onChange={() => { setFormat(it.value); setError(null); setSkippedNote(false) }} />
                                        <span className="gm-delivery__title">{it.title}</span>
                                    </span>
                                    <span className="gm-delivery__desc">{it.desc}</span>
                                </label>
                            ))}
                        </div>
                    </div>

                    <label className="gm-export-dialog__field">
                        <span className="gm-modal__label">좌표계</span>
                        <select value={srid} disabled={busy} onChange={e => setSrid(toExportSrid(e.target.value))} className="gm-modal__field">
                            {EXPORT_SRID_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </select>
                        <span className="gm-modal__note">국내 업무용: 중부원점 TM(EPSG:5186), 통일원점 TM(EPSG:5179) · 웹: EPSG:3857</span>
                    </label>

                    <div className="gm-export-dialog__opt">
                        <label className={cx('gm-convert-opts__chk', !isXlsx && 'gm-is-disabled')}>
                            <input type="checkbox" checked={isXlsx && includeFailed} disabled={!isXlsx || busy}
                                onChange={e => setIncludeFailed(e.target.checked)} />
                            매칭 실패 행도 포함 (사유 열 추가)
                        </label>
                        {!isXlsx && (
                            <span className="gm-modal__note">GeoJSON에는 위치가 있는 피처만 담깁니다 — 위치를 찾지 못한 행은 포함되지 않습니다.</span>
                        )}
                    </div>

                    {skippedNote && (
                        <div className="gm-wizard__banner gm-wizard__banner--warn" role="status">
                            <span>파일을 내려받았습니다. 보관 기간이 지나 실패 행은 포함하지 못했습니다.</span>
                        </div>
                    )}
                    {error && <div className="gm-modal__error">{error}</div>}
                </div>

                <div className="gm-wizard__footer">
                    <span className="gm-wizard__footer-note">{formatCount(featureCount)}개 피처</span>
                    {skippedNote ? (
                        <button type="button" className="gm-wizard__submit" onClick={onClose}>닫기</button>
                    ) : (
                        <>
                            <button type="button" className="gm-wizard__back" onClick={onClose}>취소</button>
                            <button ref={startRef} type="button" className="gm-wizard__submit" disabled={busy} onClick={handleDownload}>
                                {busy ? <Loader2 size={13} className="gm-loader" /> : <Download size={13} />}
                                내려받기
                            </button>
                        </>
                    )}
                </div>
            </div>
        </div>
    )
}
