'use client'

// 지도 출력 패널(떠 있는 비모달 카드). 열리면 지도 위에 용지 비율 틀(엔진 map.print)을 띄우고, 닫으면 틀을 지운다.
// 용지·축척은 엔진 상태(map.print.store)가 원본이고, 제목·부제·들어갈 것·해상도는 이 패널의 로컬 값이다.
// 미리보기 = 같은 렌더러를 72dpi로 돌려 작은 캔버스에 옮겨 그린다(옵션·지도 이동·레이어 변화 0.3초 뒤). 스타일: gm-print-panel*
import { useCallback, useEffect, useRef, useState } from 'react'
import { Download, FileText, Loader2, Printer, X } from 'lucide-react'
import { INITIAL_PRINT_STATE, saveBlob } from '../../core'
import type { PrintPage, PrintState, PrintWarning } from '../../core'
import { useGisMap, useRegionState, useStoreValue } from '../../react'
import { cx } from '../cx'
import {
    DPI_CHOICES, ELEMENT_CHOICES, PAPER_CHOICES, PREVIEW_DELAY_MS, PREVIEW_DPI, defaultPrintForm, mapDpiNote, printErrorMessage,
    printFileName, scaleChoices, taintMessage, toPrintOptions,
} from './printModel'
import type { PrintForm } from './printModel'

export interface PrintPanelProps {
    onClose: () => void
}

const selectState = (s: PrintState): PrintState => s

interface PreviewInfo {
    tainted: boolean
    suspects: string[]
    warnings: PrintWarning[]
    denominator: number
    mapDpi: number
}

type ExportKind = 'png' | 'pdf' | 'print'

export default function PrintPanel({ onClose }: PrintPanelProps) {
    const gis = useGisMap()
    const print = gis ? gis.print : null
    const state = useStoreValue(print?.store, selectState, INITIAL_PRINT_STATE)
    const region = useRegionState()
    const [form, setForm] = useState<PrintForm>(() => defaultPrintForm())
    const [info, setInfo] = useState<PreviewInfo | null>(null)
    const [previewing, setPreviewing] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [working, setWorking] = useState<ExportKind | null>(null)
    /** 지도 이동·레이어 변화가 있으면 올라가는 숫자 — 미리보기 다시 그리기 신호 */
    const [tick, setTick] = useState(0)
    const canvasRef = useRef<HTMLCanvasElement>(null)

    // 틀: 패널이 있는 동안만. 용지는 엔진 상태가 원본(처음 값 = 엔진 상태)
    useEffect(() => {
        if (!print) return
        print.showFrame()
        return () => print.hideFrame()
    }, [print])

    // 지도 이동·레이어 변화 → 미리보기 다시 그리기 신호
    useEffect(() => {
        if (!gis) return
        const bump = (): void => setTick(t => t + 1)
        const olMap = gis.olMap
        olMap.on('moveend', bump)
        const offs = [gis.layers.store.subscribe(bump), gis.vector.store.subscribe(bump), gis.raster.store.subscribe(bump)]
        return () => {
            olMap.un('moveend', bump)
            offs.forEach(off => off())
        }
    }, [gis])

    // 미리보기(0.3초 늦게). 이전 요청이 끝나기 전에 바뀌면 그 결과는 버린다
    const { title, subtitle, show } = form
    useEffect(() => {
        if (!print || !state.frameVisible) return
        let cancelled = false
        const timer = setTimeout(() => {
            setPreviewing(true)
            print.render({ ...toPrintOptions(form, PREVIEW_DPI), paper: state.paper, orientation: state.orientation })
                .then((page: PrintPage) => {
                    if (cancelled) return
                    const canvas = canvasRef.current
                    if (canvas) {
                        canvas.width = page.canvas.width
                        canvas.height = page.canvas.height
                        canvas.getContext('2d')?.drawImage(page.canvas, 0, 0)
                    }
                    setInfo({
                        tainted: page.tainted, suspects: page.taintSuspects, warnings: page.warnings,
                        denominator: page.scaleDenominator, mapDpi: page.mapDpi,
                    })
                    setPreviewing(false)
                })
                .catch((e: unknown) => {
                    if (cancelled) return
                    setPreviewing(false)
                    setError(printErrorMessage(e))
                })
        }, PREVIEW_DELAY_MS)
        return () => {
            cancelled = true
            clearTimeout(timer)
        }
        // form 전체가 아니라 값으로 의존한다(참조가 매번 새로 만들어지지 않지만 show 객체 변경을 정확히 따른다)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [print, state.frameVisible, state.paper, state.orientation, state.scale, title, subtitle, show, region.name, tick])

    const patch = useCallback((p: Partial<PrintForm>) => {
        setForm(f => ({ ...f, ...p }))
    }, [])

    const run = async (kind: ExportKind): Promise<void> => {
        if (!print || working) return
        setError(null)
        setWorking(kind)
        const opts = { ...toPrintOptions(form), paper: state.paper, orientation: state.orientation }
        try {
            const name = printFileName(form.title, kind === 'png' ? 'png' : 'pdf', new Date())
            if (kind === 'png') saveBlob(await print.exportPng(opts), name)
            else if (kind === 'pdf') saveBlob(await print.exportPdf(opts), name)
            else await print.print(opts)
        } catch (e) {
            setError(printErrorMessage(e))
        } finally {
            setWorking(null)
        }
    }

    const tainted = info?.tainted ?? false
    const busy = state.busy || working !== null
    const choices = scaleChoices()
    const scaleValue = state.scale === null ? '' : String(state.scale)
    const subtitleValue = form.subtitle ?? (region.name === '-' ? '' : region.name)

    return (
        <div className="gm-print-panel" role="dialog" aria-label="지도 출력">
            <div className="gm-print-panel__head">
                <span className="gm-print-panel__title"><Printer size={14} />지도 출력</span>
                <button type="button" onClick={onClose} className="gm-print-panel__close" aria-label="닫기"><X size={16} /></button>
            </div>

            <div className="gm-print-panel__body">
                <div>
                    <span className="gm-print-panel__label">용지</span>
                    <div className="gm-print-panel__papers" role="radiogroup" aria-label="용지">
                        {PAPER_CHOICES.map(c => {
                            const active = state.paper === c.paper && state.orientation === c.orientation
                            return (
                                <button key={c.label} type="button" role="radio" aria-checked={active}
                                    className={cx('gm-print-panel__paper', active && 'gm-is-active')}
                                    onClick={() => print?.showFrame({ paper: c.paper, orientation: c.orientation })}>
                                    {c.label}
                                </button>
                            )
                        })}
                    </div>
                </div>

                <label className="gm-print-panel__row">
                    <span className="gm-print-panel__label">축척</span>
                    <select className="gm-print-panel__field" value={scaleValue}
                        onChange={e => print?.setScale(e.target.value === '' ? null : Number(e.target.value))}>
                        {choices.map(c => <option key={c.label} value={c.value === null ? '' : String(c.value)}>{c.label}</option>)}
                    </select>
                </label>

                <label className="gm-print-panel__row">
                    <span className="gm-print-panel__label">제목</span>
                    <input type="text" className="gm-print-panel__field" value={form.title} maxLength={80} placeholder="예: 민원 위치도"
                        onChange={e => patch({ title: e.target.value })} />
                </label>
                <label className="gm-print-panel__row">
                    <span className="gm-print-panel__label">부제</span>
                    <input type="text" className="gm-print-panel__field" value={subtitleValue} maxLength={80} placeholder="비우면 부제 없음"
                        onChange={e => patch({ subtitle: e.target.value })} />
                </label>

                <div>
                    <span className="gm-print-panel__label">들어갈 것</span>
                    <div className="gm-print-panel__checks">
                        {ELEMENT_CHOICES.map(c => (
                            <label key={c.key} className="gm-print-panel__check">
                                <input type="checkbox" checked={form.show[c.key]}
                                    onChange={e => patch({ show: { ...form.show, [c.key]: e.target.checked } })} />
                                {c.label}
                            </label>
                        ))}
                    </div>
                </div>

                <div className="gm-print-panel__row">
                    <span className="gm-print-panel__label">해상도</span>
                    <div className="gm-print-panel__dpis" role="radiogroup" aria-label="해상도">
                        {DPI_CHOICES.map(d => (
                            <label key={d} className="gm-print-panel__check">
                                <input type="radio" name="gm-print-dpi" checked={form.dpi === d} onChange={() => patch({ dpi: d })} />
                                {d} dpi
                            </label>
                        ))}
                    </div>
                </div>

                <div>
                    <div className="gm-print-panel__preview">
                        <canvas ref={canvasRef} className="gm-print-panel__canvas" />
                        {previewing && <span className="gm-print-panel__preview-busy"><Loader2 size={14} className="gm-loader" /></span>}
                    </div>
                    <div className="gm-print-panel__meta">
                        <span>{info && info.denominator > 0 ? '축척 약 1:' + Math.round(info.denominator).toLocaleString('en-US') : ''}</span>
                        <span>{info ? mapDpiNote(info.mapDpi) : ''}</span>
                    </div>
                </div>

                {tainted && info && <div className="gm-print-panel__warn">{taintMessage(info.suspects)}</div>}
                {info && info.warnings.length > 0 && (
                    <ul className="gm-print-panel__notes">
                        {info.warnings.map((w, i) => <li key={w.code + i}>{w.message}</li>)}
                    </ul>
                )}
                <p className="gm-print-panel__hint">축척을 맞추려면 PDF를 &quot;실제 크기(100%)&quot;로 인쇄하세요. 측정값은 그려지지만 팝업·지역명 표시는 빠집니다.</p>
                {error && <div className="gm-print-panel__error">{error}</div>}
            </div>

            <div className="gm-print-panel__foot">
                <button type="button" className="gm-print-panel__btn gm-print-panel__btn--primary" disabled={busy || !print}
                    onClick={() => void run('print')}>
                    {working === 'print' ? <Loader2 size={13} className="gm-loader" /> : <Printer size={13} />}인쇄
                </button>
                <button type="button" className="gm-print-panel__btn" disabled={busy || !print || tainted} onClick={() => void run('pdf')}>
                    {working === 'pdf' ? <Loader2 size={13} className="gm-loader" /> : <FileText size={13} />}PDF 저장
                </button>
                <button type="button" className="gm-print-panel__btn" disabled={busy || !print || tainted} onClick={() => void run('png')}>
                    {working === 'png' ? <Loader2 size={13} className="gm-loader" /> : <Download size={13} />}PNG 저장
                </button>
            </div>
            {working !== null && <div className="gm-print-panel__working">만드는 중…</div>}
        </div>
    )
}
