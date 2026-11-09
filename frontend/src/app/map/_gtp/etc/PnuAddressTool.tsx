'use client'

// PNU → 주소 찾기 화면. 상태는 전부 pnuAddressJob 스토어에 있어(패널이 닫혀도 작업이 계속) 여기서는 읽고 단추만 누른다.

import { useEffect, useId, useState } from 'react'
import type { ChangeEvent, DragEvent } from 'react'
import { Download, Eye, FileSpreadsheet, Info, Loader2, Pause, Play, RotateCcw, Search, Upload, X } from 'lucide-react'
import { useAuthStore } from '@/stores/authStore'
import { usePnuAddressJob } from './pnuAddressJob'
import { MAX_DATA_ROWS, MAX_FILE_BYTES, startBlock } from './pnuAddressModel'
import type { PnuCheckSummary, PnuResultSummary } from './pnuAddressModel'
import { BTN_LINK, BTN_PRIMARY, BTN_SECONDARY, FIELD, FIELD_LABEL, NoticeBox } from './EtcParts'
import PnuPreviewDialog from './PnuPreviewDialog'

const fmt = (n: number): string => n.toLocaleString('ko-KR')

// ── 작은 조각 ─────────────────────────────────────────
interface FileChipProps {
    name: string
    rows?: number
    onRemove?: () => void
}

function FileChip({ name, rows, onRemove }: FileChipProps) {
    return (
        <div className="flex items-center gap-1.5 rounded-md border border-(--etc-border) bg-(--etc-surface-muted) px-2 py-1.5 text-[11.5px]">
            <FileSpreadsheet size={13} aria-hidden className="shrink-0 text-(--etc-text-faint)" />
            <span className="min-w-0 flex-1 truncate font-semibold text-(--etc-text-2)" title={name}>{name}</span>
            {rows !== undefined && <small className="whitespace-nowrap text-[10.5px] text-(--etc-text-muted)">{fmt(rows)}행</small>}
            {onRemove && (
                <button
                    type="button"
                    onClick={onRemove}
                    aria-label="이 파일 빼기"
                    title="이 파일 빼기"
                    className="shrink-0 rounded text-(--etc-text-faint) hover:text-(--etc-text-2) focus-visible:outline-2 focus-visible:outline-(--etc-primary)"
                >
                    <X size={13} aria-hidden />
                </button>
            )}
        </div>
    )
}

interface DropZoneProps {
    onFile: (file: File) => void
    disabled?: boolean
}

function DropZone({ onFile, disabled }: DropZoneProps) {
    const inputId = useId()
    const [over, setOver] = useState(false)

    function handleChange(e: ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0]
        e.target.value = '' // 같은 파일을 다시 골라도 change가 일어나게
        if (file) onFile(file)
    }
    function handleDrop(e: DragEvent<HTMLLabelElement>) {
        e.preventDefault()
        setOver(false)
        if (disabled) return
        const file = e.dataTransfer.files?.[0]
        if (file) onFile(file)
    }

    return (
        <div className="relative">
            <input id={inputId} type="file" accept=".xlsx,.xls" className="peer sr-only" disabled={disabled} onChange={handleChange} />
            <label
                htmlFor={inputId}
                onDragOver={(e) => { e.preventDefault(); if (!disabled) setOver(true) }}
                onDragLeave={() => setOver(false)}
                onDrop={handleDrop}
                className={`flex cursor-pointer flex-col items-center gap-1 rounded-[7px] border-[1.5px] border-dashed px-2.5 py-3.5 text-center transition-colors hover:border-(--etc-primary) hover:bg-(--etc-primary-soft) peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-(--etc-primary) ${over ? 'border-(--etc-primary) bg-(--etc-primary-soft) text-(--etc-primary)' : 'border-(--etc-border-strong) text-(--etc-text-faint)'}`}
            >
                <Upload size={16} aria-hidden />
                <span className="text-[11.5px] font-semibold text-(--etc-text-2)">엑셀 파일을 끌어 놓거나 눌러서 선택</span>
                <small className="text-[10.5px]">
                    .xlsx · .xls / {fmt(MAX_DATA_ROWS)}행 · {MAX_FILE_BYTES / 1024 / 1024}MB까지
                </small>
            </label>
        </div>
    )
}

function Hint({ children }: { children: React.ReactNode }) {
    return (
        <div className="flex gap-[5px] text-[10.5px] leading-[1.45] text-(--etc-text-muted)">
            <Info size={13} aria-hidden className="mt-px shrink-0 text-(--etc-text-faint)" />
            <span>{children}</span>
        </div>
    )
}

interface SelectFieldProps {
    label: React.ReactNode
    value: string
    onChange: (value: string) => void
    children: React.ReactNode
    disabled?: boolean
}

function SelectField({ label, value, onChange, children, disabled }: SelectFieldProps) {
    const id = useId()
    return (
        <div>
            <label htmlFor={id} className={FIELD_LABEL}>{label}</label>
            <select id={id} value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled} className={FIELD}>
                {children}
            </select>
        </div>
    )
}

interface SummaryRowProps {
    label: string
    value: number
    bad?: boolean
}

function SummaryRow({ label, value, bad }: SummaryRowProps) {
    const tone = value === 0 ? 'text-(--etc-text-faint)' : 'text-(--etc-text-2)'
    return (
        <div className={`flex justify-between border-b border-(--etc-border-subtle) px-2 py-1 last:border-b-0 ${tone}`}>
            <span>{label}</span>
            <em className={`font-bold not-italic tabular-nums ${value > 0 && bad ? 'text-(--etc-danger)' : ''}`}>{fmt(value)}</em>
        </div>
    )
}

function CheckSummary({ check }: { check: PnuCheckSummary }) {
    return (
        <div className="overflow-hidden rounded-md border border-(--etc-border) text-[11px]">
            <SummaryRow label="데이터 행" value={check.rows} />
            <SummaryRow label="정상" value={check.ok} />
            <SummaryRow label="중복(한 번만 조회)" value={check.duplicates} />
            <SummaryRow label="PNU 형식 오류" value={check.format} bad />
            <SummaryRow label="복구 불가(숫자 서식)" value={check.numeric} bad />
            <SummaryRow label="복구 불가(지수 표기)" value={check.exp} bad />
            <SummaryRow label="빈 값" value={check.empty} />
        </div>
    )
}

function ResultChips({ summary }: { summary: PnuResultSummary }) {
    const errors = summary.FORMAT + summary.NUMERIC + summary.EXP + summary.NOT_FETCHED
    const chips: { label: string; count: number; cls: string }[] = [
        { label: '성공', count: summary.SUCCESS, cls: 'bg-(--etc-success-soft) text-(--etc-success)' },
        { label: '건물 없음', count: summary.NO_BUILDING, cls: 'bg-(--etc-warn-soft) text-(--etc-warn)' },
        { label: '지번만', count: summary.JIBUN_ONLY, cls: 'bg-(--etc-warn-soft) text-(--etc-warn)' },
        { label: '법정동 없음', count: summary.NO_LEGAL_DONG, cls: 'bg-(--etc-warn-soft) text-(--etc-warn)' },
        { label: '오류·복구 불가', count: errors, cls: 'bg-(--etc-danger-soft) text-(--etc-danger)' },
        { label: '빈 값', count: summary.EMPTY, cls: 'bg-(--etc-surface-sunken) text-(--etc-text-2)' },
    ]
    return (
        <div className="flex flex-wrap gap-1">
            {chips.filter((c) => c.count > 0).map((c) => (
                <span key={c.label} className={`rounded-full px-[7px] py-0.5 text-[10.5px] tabular-nums ${c.cls}`}>
                    {c.label} {fmt(c.count)}
                </span>
            ))}
        </div>
    )
}

const ALL_BROKEN_TEXT =
    "이 열의 PNU가 모두 숫자로 저장돼 뒷자리가 이미 바뀌었습니다. 엑셀에서 서식만 '텍스트'로 바꿔서는 되돌아오지 않습니다. 원본(시스템 내려받기·CSV)에서 PNU를 텍스트로 다시 받아 오세요. CSV 원본이 있으면 아래 'CSV → Excel 변환'으로 바꾸면 PNU가 그대로 남습니다."

// ── 본체 ──────────────────────────────────────────────
export default function PnuAddressTool() {
    const job = usePnuAddressJob()
    const userId = useAuthStore((s) => s.user?.userId ?? '')
    const [previewOpen, setPreviewOpen] = useState(false)
    const [downloadError, setDownloadError] = useState<string | null>(null)

    // 패널을 다시 열었을 때 다른 사용자의 작업이 남아 있으면 버린다(로그인 사용자가 바뀐 경우)
    useEffect(() => {
        const state = usePnuAddressJob.getState()
        if (state.ownerId !== '' && state.ownerId !== userId) state.reset()
    }, [userId])

    function handleDownload() {
        setDownloadError(job.download())
    }
    function handleReset() {
        setDownloadError(null)
        setPreviewOpen(false)
        job.reset()
    }

    const { phase, check } = job
    const total = job.uniquePnus.length
    const percent = total === 0 ? 0 : Math.min(100, Math.floor((job.done / total) * 100))
    const block = check ? startBlock(check) : null
    const fileRows = job.dataRowCount

    // ── 처음 / 읽는 중 ──
    if (phase === 'idle') {
        return (
            <>
                <DropZone onFile={(f) => void job.pickFile(f)} />
                <Hint>PNU 열은 '텍스트' 서식이어야 합니다. CSV는 아래 'CSV → Excel 변환'으로 먼저 엑셀로 바꿔 주세요.</Hint>
            </>
        )
    }
    if (phase === 'reading') {
        return (
            <>
                {job.fileName && <FileChip name={job.fileName} />}
                <div role="status" className="flex items-center justify-center gap-1.5 py-2 text-[11px] text-(--etc-text-muted)">
                    <Loader2 size={13} aria-hidden className="animate-spin" />
                    파일을 읽는 중…
                </div>
            </>
        )
    }

    // ── 읽기 실패·한도 초과 ──
    if (phase === 'error') {
        return (
            <>
                {job.fileName && <FileChip name={job.fileName} onRemove={handleReset} />}
                {job.sheetNames.length > 1 && (
                    <SelectField label="시트" value={job.sheetName ?? ''} onChange={job.chooseSheet}>
                        {job.sheetNames.map((n) => <option key={n} value={n}>{n}</option>)}
                    </SelectField>
                )}
                {job.error && <NoticeBox tone="err" alert>{job.error.message}</NoticeBox>}
                <button type="button" onClick={handleReset} className={BTN_LINK}>
                    <RotateCcw size={13} aria-hidden />다른 파일
                </button>
            </>
        )
    }

    const chip = job.fileName ? <FileChip name={job.fileName} rows={fileRows} onRemove={phase === 'ready' ? handleReset : undefined} /> : null

    // ── 설정 ──
    if (phase === 'ready') {
        const columnValue = job.pnuColumn === null ? '' : String(job.pnuColumn)
        return (
            <>
                {chip}
                {job.sheetNames.length > 1 && (
                    <SelectField label="시트" value={job.sheetName ?? ''} onChange={job.chooseSheet}>
                        {job.sheetNames.map((n) => <option key={n} value={n}>{n}</option>)}
                    </SelectField>
                )}
                <SelectField
                    label={
                        <>
                            PNU 열
                            {job.pnuColumn !== null && job.pnuColumn === job.suggestedColumn && !job.suggestBroken && (
                                <span className="rounded bg-(--etc-primary-soft) px-[5px] py-px text-[9.5px] font-bold text-(--etc-primary)">추천</span>
                            )}
                        </>
                    }
                    value={columnValue}
                    onChange={(v) => job.chooseColumn(Number(v))}
                >
                    {job.pnuColumn === null && <option value="" disabled>열을 고르세요</option>}
                    {job.headers.map((h, i) => <option key={i} value={i}>{h}</option>)}
                </SelectField>

                {job.pnuColumn === null && <NoticeBox tone="warn">PNU 열을 찾지 못했습니다. 위에서 직접 골라 주세요.</NoticeBox>}
                {check && <CheckSummary check={check} />}
                {block === 'ALL_BROKEN' && (
                    <NoticeBox tone="err" alert><b>PNU를 쓸 수 없습니다.</b> {ALL_BROKEN_TEXT}</NoticeBox>
                )}
                {block === 'NONE_OK' && job.pnuColumn !== null && (
                    <NoticeBox tone="err" alert>조회할 수 있는 PNU가 없습니다. 다른 열을 골라 보세요.</NoticeBox>
                )}
                {check && block === null && check.unrecoverable > 0 && (
                    <NoticeBox tone="warn">
                        {fmt(check.unrecoverable)}행은 숫자 서식이라 뒷자리가 이미 바뀌었습니다. 그 행은 '복구 불가'로 표시됩니다.
                    </NoticeBox>
                )}
                <button type="button" onClick={job.start} disabled={block !== null || job.pnuColumn === null} className={BTN_PRIMARY}>
                    <Search size={13} aria-hidden />
                    {block === null && check ? `주소 찾기 · ${fmt(check.unique)}건 조회` : '주소 찾기'}
                </button>
            </>
        )
    }

    // ── 진행 중 ──
    if (phase === 'running') {
        return (
            <>
                {chip}
                <div className="flex justify-between text-[11px] tabular-nums text-(--etc-text-2)">
                    <span>주소 찾는 중…</span>
                    <span>{fmt(job.done)} / {fmt(total)} · {percent}%</span>
                </div>
                <div
                    role="progressbar"
                    aria-label="주소 찾기 진행률"
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={percent}
                    className="h-1.5 overflow-hidden rounded-full bg-(--etc-surface-sunken)"
                >
                    <div className="h-full rounded-full bg-(--etc-primary) transition-[width]" style={{ width: `${percent}%` }} />
                </div>
                <button type="button" onClick={job.stop} className={BTN_SECONDARY}>
                    <Pause size={13} aria-hidden />중지
                </button>
                <div aria-live="polite" className="flex flex-col gap-1.5">
                    {job.retryNote && <NoticeBox tone="warn">{job.retryNote}</NoticeBox>}
                    {job.warmupHint && <Hint>처음 한 번은 주소 사전을 준비하느라 최대 1분쯤 걸릴 수 있습니다.</Hint>}
                </div>
                <div className="text-center text-[10.5px] text-(--etc-text-faint)">다른 탭으로 옮겨도 계속됩니다</div>
            </>
        )
    }

    // ── 일시정지·오류 ──
    if (phase === 'paused') {
        const canResume = !(job.error && job.error.status === 400)
        return (
            <>
                {chip}
                <div className="flex justify-between text-[11px] tabular-nums text-(--etc-text-2)">
                    <span>멈춤</span>
                    <span>{fmt(job.done)} / {fmt(total)}</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-(--etc-surface-sunken)">
                    <div className="h-full rounded-full bg-(--etc-primary-disabled)" style={{ width: `${percent}%` }} />
                </div>
                {job.error ? (
                    <NoticeBox tone="err" alert>{job.error.message}</NoticeBox>
                ) : (
                    <NoticeBox tone="info">중지했습니다. 이어서 하면 남은 PNU부터 찾습니다.</NoticeBox>
                )}
                {downloadError && <NoticeBox tone="err" alert>{downloadError}</NoticeBox>}
                <div className="flex gap-1.5">
                    {canResume && (
                        <button type="button" onClick={job.resume} className={BTN_PRIMARY}>
                            <Play size={13} aria-hidden />{job.error?.status === 503 ? '다시 시도' : '이어서 하기'}
                        </button>
                    )}
                    <button type="button" onClick={handleDownload} className={BTN_SECONDARY}>여기까지 받기</button>
                </div>
                <Hint>못 찾은 행은 처리상태가 '조회 안 됨'으로 채워집니다.</Hint>
                <button type="button" onClick={handleReset} className={BTN_LINK}>
                    <RotateCcw size={13} aria-hidden />다른 파일
                </button>
            </>
        )
    }

    // ── 완료 ──
    return (
        <>
            {chip}
            <NoticeBox tone="ok"><b>완료 · {fmt(check?.rows ?? 0)}행</b></NoticeBox>
            {job.meta && !job.meta.roadAvailable && (
                <NoticeBox tone="warn">도로명주소 자료가 아직 준비되지 않아 지번주소만 채웠습니다.</NoticeBox>
            )}
            {job.resultSummary && <ResultChips summary={job.resultSummary} />}
            {job.meta?.referenceVersion && <div className="text-[10.5px] text-(--etc-text-faint)">건물DB {job.meta.referenceVersion} 기준</div>}
            {job.meta && job.meta.roadAvailable && !job.meta.relatedIncluded && (
                <Hint>관련지번으로 걸린 건물은 포함하지 않았습니다(대표지번 건물만).</Hint>
            )}
            {downloadError && <NoticeBox tone="err" alert>{downloadError}</NoticeBox>}
            <button type="button" onClick={handleDownload} className={BTN_PRIMARY}>
                <Download size={13} aria-hidden />결과 엑셀 받기
            </button>
            <button type="button" onClick={() => setPreviewOpen(true)} className={BTN_SECONDARY}>
                <Eye size={13} aria-hidden />미리보기
            </button>
            <button type="button" onClick={handleReset} className={BTN_LINK}>
                <RotateCcw size={13} aria-hidden />다른 파일
            </button>
            {previewOpen && <PnuPreviewDialog onClose={() => setPreviewOpen(false)} />}
        </>
    )
}
