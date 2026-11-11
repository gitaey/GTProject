'use client'

// "위치 찾는 방법" 카드 — 엑셀을 놓으면 서버의 추천으로 방법·열을 미리 골라 둔다.
//  · 접힘(추천이 그대로 맞음): 초록 요약 한 장 + [바꾸기]
//  · 펼침(추천이 없거나 일부만 / [바꾸기]): 방법 라디오 3개 · 열 select · (좌표) 좌표계. 비어 있는 칸은 "필요" 표시
// 상태는 MyMapUploadModal이 들고 있다(여기서는 그리기만). 스타일: gm-upload__card·gm-upload__mode·gm-upload__frow
import { useId } from 'react'
import { AlertCircle, CheckCircle2, FileSpreadsheet } from 'lucide-react'
import type { ExcelPreviewResponse, MyMapUploadMode } from '../../core'
import { cx } from '../cx'
import { SRID_OPTIONS } from './sridOptions'
import { LEGACY_MODES, MODES, MODE_HINTS, MODE_LABELS, SRID_UNCONFIRMED_HINT, TEXT, manualHeadline, missingText, summaryText } from './uploadModel'
import type { ExcelCols } from './uploadModel'

interface ColSelectProps {
    label: string
    value: string
    headers: readonly string[]
    need: boolean
    disabled: boolean
    onChange: (v: string) => void
}

export function ColSelect({ label, value, headers, need, disabled, onChange }: ColSelectProps) {
    const empty = value === ''
    return (
        <label className="gm-upload__frow">
            <span className="gm-upload__frow-label">{label}{need && empty && <em className="gm-upload__need">필요</em>}</span>
            <select value={value} disabled={disabled} onChange={e => onChange(e.target.value)}
                className={cx('gm-modal__field', 'gm-upload__select', need && empty && 'gm-is-need')}>
                <option value="">{need ? '열을 고르세요' : '선택'}</option>
                {headers.map((h, i) => <option key={i} value={h}>{h}</option>)}
            </select>
        </label>
    )
}

interface ExcelLocationCardProps {
    preview: ExcelPreviewResponse
    legacy: boolean
    mode: MyMapUploadMode
    cols: ExcelCols
    srid: string
    /** 좌표계를 추천받았거나 사용자가 골랐다(false면 "좌표계를 확인해 주세요") */
    sridOk: boolean
    /** 추천이 그대로 맞았다(처음 판정) */
    quick: boolean
    expanded: boolean
    locked: boolean
    /** "지적도 기준월 …" 한 줄(PNU·주소일 때) */
    coverageText: string | null
    /** 소스에 convertExcel이 있어 "엑셀로만 받기"를 보일 수 있다 */
    canConvert: boolean
    onExpand: () => void
    onMode: (m: MyMapUploadMode) => void
    onCol: (key: keyof ExcelCols, value: string) => void
    onSrid: (value: string) => void
    onConvert: () => void
}

/** 주소 방법일 때만 보이는 보조 줄 */
export function ConvertSide({ locked, onConvert }: { locked: boolean; onConvert: () => void }) {
    return (
        <div className="gm-upload__side">
            <FileSpreadsheet size={12} aria-hidden="true" />
            <span>{TEXT.convertOnlyHint}</span>
            <button type="button" className="gm-upload__link" disabled={locked} onClick={onConvert}>{TEXT.convertOnly}</button>
        </div>
    )
}

export default function ExcelLocationCard(p: ExcelLocationCardProps) {
    const radioName = useId()
    const headers = p.preview.headers
    const open = p.expanded || !p.quick
    const modes = p.legacy ? LEGACY_MODES : MODES
    const sideShown = p.mode === 'ADDRESS' && p.canConvert && !p.legacy

    if (!open) {
        const s = summaryText(p.mode, p.cols, p.srid)
        return (
            <div className="gm-upload__card gm-is-ok">
                <div className="gm-upload__card-head">
                    <CheckCircle2 size={16} className="gm-upload__card-icon" aria-hidden="true" />
                    <span className="gm-upload__card-text">
                        <b>{s.title}</b>
                        <span>{s.detail}{p.coverageText ? ` ${p.coverageText}` : ''}</span>
                    </span>
                    <button type="button" className="gm-upload__small-btn" disabled={p.locked} onClick={p.onExpand}>{TEXT.changeMethod}</button>
                </div>
                {sideShown && <ConvertSide locked={p.locked} onConvert={p.onConvert} />}
            </div>
        )
    }

    const miss = missingText(p.mode, p.cols)
    const head = p.quick || !miss ? { title: '위치 찾는 방법', detail: '' } : manualHeadline(p.preview, p.cols)
    const needCol = (key: keyof ExcelCols) => (p.mode === 'PNU' ? key === 'pnu' : p.mode === 'ADDRESS' ? key === 'address' : key === 'lat' || key === 'lon')
    return (
        <div className={cx('gm-upload__card', miss ? 'gm-is-need' : 'gm-is-ok')}>
            <div className="gm-upload__card-head">
                {miss
                    ? <AlertCircle size={16} className="gm-upload__card-icon" aria-hidden="true" />
                    : <CheckCircle2 size={16} className="gm-upload__card-icon" aria-hidden="true" />}
                <span className="gm-upload__card-text">
                    <b>{head.title}</b>
                    {head.detail && <span>{head.detail}</span>}
                </span>
            </div>

            {modes.length > 1 && (
                <div className="gm-upload__modes" role="radiogroup" aria-label={TEXT.methodLabel}>
                    {modes.map(m => (
                        <label key={m} className={cx('gm-upload__mode', p.mode === m && 'gm-is-active')}>
                            <span className="gm-upload__mode-head">
                                <input type="radio" name={radioName} value={m} checked={p.mode === m} disabled={p.locked} onChange={() => p.onMode(m)} />
                                <span>{MODE_LABELS[m]}</span>
                            </span>
                            <small>{MODE_HINTS[m]}{p.preview.suggestions?.mode === m && <span className="gm-upload__rec">추천</span>}</small>
                        </label>
                    ))}
                </div>
            )}

            {p.mode === 'PNU' && <ColSelect label="PNU 열" value={p.cols.pnu} headers={headers} need={needCol('pnu')} disabled={p.locked} onChange={v => p.onCol('pnu', v)} />}
            {p.mode === 'ADDRESS' && <ColSelect label="주소 열" value={p.cols.address} headers={headers} need={needCol('address')} disabled={p.locked} onChange={v => p.onCol('address', v)} />}
            {p.mode === 'COORD' && (
                <>
                    <ColSelect label="위도(Y) 열" value={p.cols.lat} headers={headers} need={needCol('lat')} disabled={p.locked} onChange={v => p.onCol('lat', v)} />
                    <ColSelect label="경도(X) 열" value={p.cols.lon} headers={headers} need={needCol('lon')} disabled={p.locked} onChange={v => p.onCol('lon', v)} />
                    <label className="gm-upload__frow">
                        <span className="gm-upload__frow-label">좌표계</span>
                        <select value={p.srid} disabled={p.locked} onChange={e => p.onSrid(e.target.value)} className="gm-modal__field gm-upload__select">
                            {SRID_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </select>
                    </label>
                    {!p.sridOk && <span className="gm-upload__hint">{SRID_UNCONFIRMED_HINT}</span>}
                </>
            )}
            {p.coverageText && p.mode !== 'COORD' && <span className="gm-upload__hint">{p.coverageText}</span>}
            {sideShown && <ConvertSide locked={p.locked} onConvert={p.onConvert} />}
        </div>
    )
}
