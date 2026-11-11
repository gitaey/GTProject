'use client'

// 나만의지도 "레이어 올리기" — 종류를 묻지 않는 한 화면. 파일을 창 어디에나 끌어 놓거나 눌러서 고르면 확장자·머리 바이트로 엑셀(.xlsx 1개)·SHP 묶음을 알아서 판별한다.
//  · 엑셀: 서버 미리보기(previewExcel)의 추천이 맞으면 요약 한 장 + 이름만 보여 주고 [레이어 만들기] 하나로 끝(빠른 길), 아니면 같은 화면에서 방법·열을 고른다
//  · SHP: 로컬 검사만(서버 요청 없음). 빠진 파일(.dbf·.shp)을 짚어 주고 더 끌어 놓으면 합친다. 보내는 파일은 항상 한 벌(서버는 확장자별 마지막 파일만 쓴다)
//  · 주소 방법이면 보조 길 "엑셀로만 받기"(레이어 없이 변환 엑셀만) — 같은 미리보기를 쓰고, 끝나면 결과 화면(MyMapConvertResultDialog)
// 판별·문구·추천 판정은 전부 순수 함수(uploadFiles·uploadModel — 시험 가능), 이 파일은 상태와 그리기. 요청은 엔진의 나만의지도 소스(map.sources.myMap)가 보낸다.
// 업로드가 끝나면 onUploaded(result) → onClose() 순서(패널이 방금 올린 레이어를 기억해 처리가 끝나면 결과 창을 한 번 연다). 바깥(어두운 배경) 클릭으로는 닫히지 않는다 — X(또는 파일이 없을 때 Esc)로만.
// 스타일: gm-modal(공유·보고서와 공용), gm-upload-modal, gm-upload__*. 선택 상태에 따라 바뀌는 값은 gm-is-* 클래스
import { useEffect, useId, useMemo, useRef, useState } from 'react'
import type { ReactNode, RefObject } from 'react'
import { X, Loader2, FileSpreadsheet, AlertCircle, CheckCircle2, Info, ChevronDown, ArrowLeft, Download, Layers, Upload } from 'lucide-react'
import type { ExcelPreviewResponse, MyMapConfirmResult, MyMapConvertResult, MyMapExportSrid, MyMapQuota, MyMapUploadMode } from '../../core'
import { GisHttpError } from '../../core'
import { useGisMap } from '../../react'
import { cx } from '../cx'
import { ConvertOptions } from './MyMapConvertForm'
import MyMapConvertResultDialog from './MyMapConvertResultDialog'
import ExcelLocationCard, { ColSelect } from './ExcelLocationCard'
import UploadDropZone from './UploadDropZone'
import UploadFileList from './UploadFileList'
import type { MissingSlot } from './UploadFileList'
import SampleLinks from './SampleLinks'
import type { SampleLinksClasses } from './SampleLinks'
import { DEFAULT_CONVERT_FLAGS, formatBytes, toConvertInclude } from './convertModel'
import type { ConvertFlags } from './convertModel'
import { filesFromDataTransfer } from './folderEntries'
import { keepFocusOnBackdrop, trapTab } from './focusTrap'
import { describeCoverage, formatCount } from './format'
import { saveBlob } from './saveBlob'
import { sniffHead } from './sniffFile'
import { DEFAULT_EXPORT_SRID, SRID_OPTIONS } from './sridOptions'
import { classifyFiles, defaultLayerName, kindOf, isShpFamily, mergeShpFiles, resolvePick, shouldMergeShp } from './uploadFiles'
import type { ClassifyOptions, UploadPick } from './uploadFiles'
import {
    ADDRESS_TIP, EMPTY_COLS, NUMERIC_PNU_TEXT, NO_PRJ_TEXT, TEXT, cardForPick, excelBlockText, excelOverSizeText, footerOf, groupDescribe, limitsLine,
    liveMessage, manualHeadline, missingText, overLimitOf, pickExcelDefaults, replacedNotice, sendingNote, shpSummary, shpWarnings, summaryText, uploadFailText,
} from './uploadModel'
import type { ExcelBlock, ExcelCols } from './uploadModel'
import { useBlockBrowserFileOpen, useFileDrop } from './useFileDrop'

export interface MyMapUploadModalProps {
    onClose: () => void
    /** 확정이 {id, parcelVersion?}을 돌려줬으면 함께 넘긴다(엑셀·새 서버의 SHP. 옛 서버는 없음) */
    onUploaded: (result?: MyMapConfirmResult) => void
    /** 패널이 가진 한도·적재 범위. 없으면 한도 안내가 빠진다 */
    quota?: MyMapQuota | null
    /** 패널에 끌어 놓아 연 경우 미리 채울 파일(폴더는 패널이 펼쳐서 준다) */
    initialFiles?: File[]
    /** 패널에서 폴더를 읽지 못했거나 비어 있을 때 첫 화면에 띄울 안내 */
    initialNotice?: string | null
    /** 닫힐 때 포커스를 돌려줄 곳(열기 전에 포커스가 있던 요소가 없을 때) */
    returnFocusRef?: RefObject<HTMLElement | null>
}

const PREVIEW_ROWS = 5
/** 한도를 알 수 없을 때 변환 안내에 쓰는 행 수(서버 기본 한도) */
const FALLBACK_CONVERT_ROWS = 5000
const DEFAULT_SOURCE_SRID = 'EPSG:5186'
/** 엑셀 방법·열 선택 상태 */
interface ExcelSel {
    mode: MyMapUploadMode
    cols: ExcelCols
    srid: string
    /** 좌표계를 추천받았거나 사용자가 골랐다 */
    sridOk: boolean
    /** 추천이 그대로 맞았다(처음 판정) */
    quick: boolean
    /** [바꾸기]를 눌러 펼쳤다 */
    expanded: boolean
}
const INITIAL_SEL: Readonly<ExcelSel> = Object.freeze({ mode: 'COORD' as MyMapUploadMode, cols: EMPTY_COLS, srid: DEFAULT_SOURCE_SRID, sridOk: false, quick: false, expanded: false })

/** 샘플 받기 줄 모양(업로드 창 — 드롭 영역 바로 아래) */
const UPLOAD_SAMPLE_CLASSES: SampleLinksClasses = Object.freeze({ root: 'gm-upload__samples', label: 'gm-upload__samples-label', button: 'gm-upload__sample' })

type BannerTone = 'info' | 'warn' | 'error'
const BANNER_CLASS: Readonly<Record<BannerTone, string>> = Object.freeze({
    info: 'gm-wizard__banner--info', warn: 'gm-wizard__banner--warn', error: 'gm-wizard__banner--error',
})

function Banner({ tone, children }: { tone: BannerTone; children: string }) {
    return (
        <div className={cx('gm-wizard__banner', BANNER_CLASS[tone])} role={tone === 'error' ? 'alert' : undefined}>
            {tone === 'info' ? <Info size={12} aria-hidden="true" /> : <AlertCircle size={12} aria-hidden="true" />}
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

/** 접이식(<details>) — 펼침 상태는 브라우저가 들고 있다. open은 처음 값만 */
function Fold({ icon, title, hint, open, children }: { icon: 'info' | 'file'; title: string; hint?: string; open?: boolean; children: ReactNode }) {
    return (
        <details className="gm-upload__details" open={open}>
            <summary className="gm-upload__details-sum">
                {icon === 'info' ? <Info size={13} aria-hidden="true" /> : <FileSpreadsheet size={13} aria-hidden="true" />}
                <span>{title}</span>
                {hint && <span className="gm-upload__details-hint">{hint}</span>}
                <ChevronDown size={14} className="gm-upload__chev" aria-hidden="true" />
            </summary>
            <div className="gm-upload__details-body">{children}</div>
        </details>
    )
}

export default function MyMapUploadModal({ onClose, onUploaded, quota, initialFiles, initialNotice, returnFocusRef }: MyMapUploadModalProps) {
    const myMap = useGisMap()?.sources.myMap
    const canShp = !!myMap?.uploadShp
    const canExcel = !!myMap?.previewExcel
    const convertAvailable = !!myMap?.convertExcel
    const maxShpMb = quota?.maxShpMb ?? null
    const maxExcelMb = quota?.maxExcelMb ?? null
    const opts = useMemo<ClassifyOptions>(() => ({ canShp, canExcel, maxShpMb, maxExcelMb }), [canShp, canExcel, maxShpMb, maxExcelMb])

    const titleId = useId()
    const descId = useId()
    const footId = useId()
    const shpRadioName = useId()
    const dialogRef = useRef<HTMLDivElement>(null)
    const bodyRef = useRef<HTMLDivElement>(null)
    const titleRef = useRef<HTMLSpanElement>(null)
    const dropBtnRef = useRef<HTMLButtonElement>(null)

    // 파일·판별
    const [files, setFiles] = useState<File[]>(() => initialFiles ?? [])
    const [shpKeyChoice, setShpKeyChoice] = useState<string | null>(null)
    const resolved = useMemo(() => resolvePick(files, opts, shpKeyChoice), [files, opts, shpKeyChoice])
    const pick = resolved.pick
    const [typedName, setTypedName] = useState<string | null>(null)
    const name = typedName ?? defaultLayerName(pick)
    const [shpSrid, setShpSrid] = useState(DEFAULT_SOURCE_SRID)

    // 엑셀 미리보기·선택
    const [preview, setPreview] = useState<ExcelPreviewResponse | null>(null)
    const [sel, setSel] = useState<ExcelSel>(INITIAL_SEL)
    const [reading, setReading] = useState(false)
    const [block, setBlock] = useState<ExcelBlock | null>(null)
    const [expired, setExpired] = useState(false)
    /** 읽기 요청의 세대 번호 — 파일이 바뀌면 올려서 늦게 온 이전 응답을 버린다 */
    const readSeqRef = useRef(0)

    // 주소 변환(엑셀로만 받기)
    const [convertMode, setConvertMode] = useState(false)
    const [flags, setFlags] = useState<ConvertFlags>(DEFAULT_CONVERT_FLAGS)
    const [convertSrid, setConvertSrid] = useState<MyMapExportSrid>(DEFAULT_EXPORT_SRID)
    const [converted, setConverted] = useState<{ result: MyMapConvertResult; sourceName: string; notice: string | null } | null>(null)
    /** 변환 요청의 세대 번호 — 모드·컬럼·옵션이 바뀌면 올려서 늦게 온 이전 응답을 버린다 */
    const convertSeqRef = useRef(0)

    const [submitting, setSubmitting] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [notice, setNotice] = useState<string | null>(initialNotice ?? null)
    /** 요청이 도는 동안 true — 화면은 disabled, 이벤트가 새어 와도 여기서 막는다(요청이 겹치는 경로 자체가 없다) */
    const busyRef = useRef(false)
    /** 닫힌 뒤에 도착한 응답으로 내려받기·상태 변경·닫기를 하지 않게 */
    const aliveRef = useRef(true)
    const openerRef = useRef<HTMLElement | null>(null)
    const pendingFocusRef = useRef<number | null>(null)
    const initDoneRef = useRef(false)
    const filesLenRef = useRef(files.length)
    filesLenRef.current = files.length
    const onCloseRef = useRef(onClose)
    onCloseRef.current = onClose
    const convertedRef = useRef(false)
    convertedRef.current = converted !== null

    // 열릴 때: 열기 전 포커스를 기억하고 첫 포커스(드롭 영역, 파일을 채워 열렸으면 제목). 닫히면 되돌려 준다. Esc는 파일이 없고 처리 중이 아닐 때만 닫는다
    useEffect(() => {
        aliveRef.current = true
        const active = document.activeElement
        openerRef.current = active instanceof HTMLElement && active !== document.body ? active : null
        if (initialFiles && initialFiles.length > 0) titleRef.current?.focus()
        else dropBtnRef.current?.focus()
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Tab') {
                if (!convertedRef.current && dialogRef.current) trapTab(e, dialogRef.current)
                return
            }
            if (e.key !== 'Escape' || e.defaultPrevented || e.isComposing) return
            if (convertedRef.current || busyRef.current || filesLenRef.current > 0) return
            onCloseRef.current()
        }
        document.addEventListener('keydown', onKey)
        return () => {
            aliveRef.current = false
            document.removeEventListener('keydown', onKey)
            const back = openerRef.current && openerRef.current.isConnected ? openerRef.current : returnFocusRef?.current
            if (back && back.isConnected) back.focus()
        }
        // 열릴 때 한 번만
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    // 패널에 끌어 놓아 열렸으면 처음 한 번 판별을 시작한다(StrictMode에서 두 번 돌아도 요청은 한 번)
    useEffect(() => {
        if (initDoneRef.current) return
        initDoneRef.current = true
        if (initialFiles && initialFiles.length > 0) startRead(classifyFiles(initialFiles, opts))
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    // 파일을 빼면 다음 칩(없으면 드롭 영역)으로 포커스
    useEffect(() => {
        const at = pendingFocusRef.current
        if (at === null) return
        pendingFocusRef.current = null
        const buttons = bodyRef.current?.querySelectorAll<HTMLElement>('[data-gm-remove]')
        const target = at >= 0 && buttons && buttons.length > 0 ? buttons[Math.min(at, buttons.length - 1)] : dropBtnRef.current
        target?.focus()
    }, [files])

    const locked = () => busyRef.current

    /** 이전 변환 결과를 버린다(옵션·컬럼·모드·파일이 바뀔 때) */
    const invalidateConvert = () => {
        convertSeqRef.current += 1
        setConverted(null)
    }

    // ───────────── 엑셀 읽기 ─────────────
    /** 머리 바이트 검사 → 서버 미리보기 → 추천을 선택 상태로. keep이 있으면 고른 방법·열을 유지(만료 뒤 다시 읽기) */
    const readExcel = async (file: File, keep?: ExcelSel) => {
        const seq = ++readSeqRef.current
        setReading(true)
        setBlock(null)
        setExpired(false)
        setPreview(null)
        try {
            const head = await sniffHead(file)
            if (seq !== readSeqRef.current) return
            if (head === 'cfb') { setBlock({ code: 'ENCRYPTED_OR_OLD', name: file.name }); return }
            if (head === 'other') { setBlock({ code: 'NOT_EXCEL', name: file.name }); return }
            if (!myMap?.previewExcel) throw new Error('미리보기 실패')
            const res = await myMap.previewExcel(file)
            if (seq !== readSeqRef.current) return
            const d = pickExcelDefaults(res, quota)
            let next: ExcelSel = { mode: d.mode, cols: d.cols, srid: d.srid ?? DEFAULT_SOURCE_SRID, sridOk: d.srid !== null, quick: d.quick, expanded: false }
            if (keep) {
                const only = (v: string) => (res.headers.includes(v) ? v : '')
                next = { ...keep, cols: { pnu: only(keep.cols.pnu), address: only(keep.cols.address), lat: only(keep.cols.lat), lon: only(keep.cols.lon) }, quick: d.quick, expanded: true }
            }
            setPreview(res)
            setSel(next)
        } catch (e) {
            if (seq !== readSeqRef.current) return
            setBlock({ code: 'SERVER', name: file.name, message: e instanceof Error ? e.message : undefined })
        } finally {
            if (seq === readSeqRef.current) setReading(false)
        }
    }

    /** 판별이 엑셀이고 용량이 괜찮으면 읽기 시작 */
    function startRead(p: UploadPick<File>) {
        if (p.kind === 'excel' && !p.overSize) void readExcel(p.file)
    }

    /** 파일 목록을 바꾸고(합치기·교체·빼기) 판별·읽기를 처음부터 다시 한다 */
    const commitFiles = (next: File[], note: string | null = null) => {
        readSeqRef.current += 1
        invalidateConvert()
        setFiles(next)
        setShpKeyChoice(null)
        setPreview(null)
        setBlock(null)
        setExpired(false)
        setReading(false)
        setConvertMode(false)
        setError(null)
        setNotice(note)
        startRead(classifyFiles(next, opts))
    }

    /** 새로 놓거나 고른 파일. SHP(부족 포함)에 SHP 파일을 더 놓으면 합치고, 그 밖은 통째로 바꾼다(바뀌었다고 알림) */
    const acceptFiles = (added: File[]) => {
        if (locked() || reading || added.length === 0) return
        if (shouldMergeShp(resolved.raw.kind, added)) {
            commitFiles(mergeShpFiles(files, added))
            return
        }
        const had = resolved.raw.kind !== 'empty' && resolved.raw.kind !== 'unsupported'
        let note: string | null = null
        if (had) {
            const np = classifyFiles(added, opts)
            const label = np.kind === 'excel' ? np.file.name : np.kind === 'shp' && np.group.shp ? np.group.shp.name : added[0].name
            note = replacedNotice(label)
        }
        commitFiles(added, note)
    }

    const acceptDrop = async (dt: DataTransfer) => {
        const r = await filesFromDataTransfer(dt)
        if (r.files.length === 0) {
            if (r.unreadable.length > 0) setNotice('폴더는 열어서 안의 파일을 끌어 놓아 주세요.')
            else if (r.folders.length > 0) setNotice(`'${r.folders[0]}' 안에 올릴 수 있는 파일이 없습니다.`)
            return
        }
        acceptFiles(r.files)
    }

    const drop = useFileDrop({ accepting: !submitting && !reading && !converted, onDropFiles: dt => { void acceptDrop(dt) } })
    // 창이 열려 있는 동안 어두운 배경에 놓아도 브라우저가 파일을 열어 페이지를 떠나지 않게(닫히면 해제)
    useBlockBrowserFileOpen(true, () => dialogRef.current)

    const removeFile = (file: File, index: number) => {
        if (locked()) return
        pendingFocusRef.current = index
        commitFiles(files.filter(f => f !== file))
    }
    const clearFiles = () => {
        if (locked()) return
        pendingFocusRef.current = -1
        commitFiles([])
    }
    /** 섞임: 고른 쪽만 남긴다 */
    const keepKind = (keep: 'excel' | 'shp') => {
        if (locked()) return
        commitFiles(files.filter(f => { const k = kindOf(f.name); return keep === 'excel' ? k === 'xlsx' : isShpFamily(k) || k === 'companion' }))
    }

    // ───────────── 파생 값 ─────────────
    const excelFile = pick.kind === 'excel' ? pick.file : null
    const legacy = preview !== null && preview.suggestions === undefined
    /** 이번 제출이 "엑셀로만 받기"인가(주소 방법에서만, 소스에 convertExcel이 있을 때만) */
    const toExcel = convertMode && convertAvailable && !legacy && sel.mode === 'ADDRESS' && preview !== null
    const converting = submitting && toExcel
    const over = preview && pick.kind === 'excel' ? overLimitOf(preview, quota, sel.mode) : null
    const miss = preview ? missingText(toExcel ? 'ADDRESS' : sel.mode, sel.cols) : null
    const coverageNote = describeCoverage(quota?.coverage)
    const usesParcel = sel.mode === 'PNU' || sel.mode === 'ADDRESS'
    const convertRows = over?.limit ?? FALLBACK_CONVERT_ROWS
    const footer = footerOf({
        sending: submitting, reading, pick, excelBlocked: block !== null, hasPreview: preview !== null, expired, missing: miss, over,
        nameEmpty: !toExcel && name.trim() === '', convert: toExcel, convertRows, maxShpFeatures: quota?.maxShpFeatures ?? null,
    })
    const canSubmit = footer.ready && !submitting
    const sendBytes = pick.kind === 'shp' ? pick.bytes : pick.kind === 'excel' ? pick.file.size : 0

    // 낭독(aria-live)용 문장
    let liveTitle: string | null = null
    let liveDetail: string | null = null
    if (pick.kind === 'excel') {
        if (block) liveTitle = excelBlockText(block)
        else if (pick.overSize && maxExcelMb) liveTitle = excelOverSizeText(pick.file.name, pick.file.size, maxExcelMb)
        else if (preview && !expired) {
            if (sel.quick && !sel.expanded) {
                const s = summaryText(sel.mode, sel.cols, sel.srid)
                liveTitle = s.title
                liveDetail = `${s.detail} 레이어 이름을 확인하고 만들기를 누르세요.`
            } else {
                liveTitle = manualHeadline(preview, sel.cols).title
            }
        }
    } else {
        const c = cardForPick(pick, maxShpMb)
        liveTitle = c?.title ?? null
        liveDetail = c?.lines[0] ?? null
    }
    const live = liveMessage({ sending: submitting, reading, convert: toExcel, title: liveTitle, detail: liveDetail })

    // ───────────── 제출 ─────────────
    /** 성공: 패널에 알리고(방금 올린 레이어 기억·목록 갱신) 닫는다. 이미 닫힌 창이면(X로 닫고 보내기만 계속된 경우) 알리기만 한다 */
    const finish = (result?: MyMapConfirmResult) => {
        onUploaded(result)
        if (aliveRef.current) onClose()
    }

    const handleShpSubmit = async () => {
        if (pick.kind !== 'shp' || pick.missing.length > 0 || pick.nameMismatch || pick.overSize || !name.trim()) {
            setError('레이어 이름과 SHP 파일 묶음(.shp·.dbf 필수)을 확인해 주세요.')
            return
        }
        busyRef.current = true
        setSubmitting(true)
        setError(null)
        try {
            if (!myMap?.uploadShp) throw new Error('업로드 실패')
            // 실패(success:false)면 소스가 서버 message(없으면 '업로드 실패')로 throw. 한 벌만 보낸다(서버는 확장자별 마지막 파일만 쓴다)
            const result = await myMap.uploadShp({ files: pick.group.files, name, sourceSrid: shpSrid })
            finish(result || undefined)
        } catch (e) {
            if (aliveRef.current) setError(uploadFailText(e instanceof Error ? e.message : null, e instanceof GisHttpError ? e.status : null))
        } finally {
            busyRef.current = false
            if (aliveRef.current) setSubmitting(false)
        }
    }

    const handleExcelConfirm = async () => {
        if (!preview || miss || !name.trim()) {
            setError(miss ?? '레이어 이름을 적어 주세요.')
            return
        }
        if (over?.blocked) {
            setError('행 수가 한도를 넘어 올릴 수 없습니다.')
            return
        }
        busyRef.current = true
        setSubmitting(true)
        setError(null)
        try {
            if (!myMap?.confirmExcel) throw new Error('업로드 실패')
            let result: void | MyMapConfirmResult
            const { mode, cols, srid } = sel
            if (legacy) {
                // 옛 서버 — 옛 호출 그대로
                result = await myMap.confirmExcel({ uploadId: preview.uploadId, name, latColumn: cols.lat, lonColumn: cols.lon, sourceSrid: srid })
            } else if (mode === 'PNU') {
                result = await myMap.confirmExcel({ uploadId: preview.uploadId, name, mode: 'PNU', pnuColumn: cols.pnu })
            } else if (mode === 'ADDRESS') {
                result = await myMap.confirmExcel({ uploadId: preview.uploadId, name, mode: 'ADDRESS', addressColumn: cols.address })
            } else {
                result = await myMap.confirmExcel({ uploadId: preview.uploadId, name, mode: 'COORD', latColumn: cols.lat, lonColumn: cols.lon, sourceSrid: srid })
            }
            finish(result || undefined)
        } catch (e) {
            if (!aliveRef.current) return
            if (e instanceof GisHttpError && e.status === 404) {
                // 미리보기가 만료됐다 — 같은 파일을 다시 읽으면 된다(고른 방법·열은 유지)
                setExpired(true)
                setError('파일을 올린 지 오래되어 다시 읽어야 합니다.')
            } else {
                setError(uploadFailText(e instanceof Error ? e.message : null, e instanceof GisHttpError ? e.status : null))
            }
        } finally {
            busyRef.current = false
            if (aliveRef.current) setSubmitting(false)
        }
    }

    const handleConvert = async () => {
        if (busyRef.current) return
        if (!preview || !sel.cols.address) {
            setError('주소 열을 골라 주세요.')
            return
        }
        if (over?.blocked) {
            setError('행 수가 한도를 넘어 변환할 수 없습니다.')
            return
        }
        if (!myMap?.convertExcel) {
            setError('주소 변환을 할 수 없습니다.')
            return
        }
        const seq = ++convertSeqRef.current
        busyRef.current = true
        setSubmitting(true)
        setError(null)
        setConverted(null)
        try {
            const result = await myMap.convertExcel({ uploadId: preview.uploadId, addressColumn: sel.cols.address, include: toConvertInclude(flags), srid: convertSrid })
            if (!aliveRef.current || seq !== convertSeqRef.current) return
            // 끝나는 순간 한 번 내려받는다. 저장이 막혀도 결과 화면의 "엑셀 다시 받기"가 남는다
            let note: string | null = null
            try {
                saveBlob(result.file, result.fileName)
            } catch {
                note = '파일을 자동으로 저장하지 못했습니다. "엑셀 다시 받기"를 눌러 주세요.'
            }
            setConverted({ result, sourceName: excelFile?.name ?? '', notice: note })
        } catch (e) {
            if (!aliveRef.current || seq !== convertSeqRef.current) return
            if (e instanceof GisHttpError && e.status === 404) {
                // 올린 파일이 없거나 만료 — 같은 uploadId로는 다시 못 한다. 다시 읽기(방식·붙일 열·좌표계는 유지)
                setExpired(true)
                setError(`${e.message || '올린 파일을 찾을 수 없습니다'} — 다시 읽어 주세요.`)
            } else {
                // 503·413·500·429 등 — 같은 uploadId로 다시 시도할 수 있다(단추는 finally에서 다시 켜진다)
                setError(e instanceof Error && e.message ? e.message : '주소 변환에 실패했습니다.')
            }
        } finally {
            if (seq === convertSeqRef.current) {
                busyRef.current = false
                if (aliveRef.current) setSubmitting(false)
            }
        }
    }

    const reread = () => {
        if (locked() || !excelFile) return
        setError(null)
        invalidateConvert()
        void readExcel(excelFile, sel)
    }

    /** 결과 화면 → 처음(파일 없음). 방식·붙일 열·좌표계는 그대로 둔다 */
    const restart = () => {
        commitFiles([])
        pendingFocusRef.current = -1
    }

    // ───────────── 선택 변경 ─────────────
    const setMode = (m: MyMapUploadMode) => {
        if (locked()) return
        invalidateConvert()
        setSel(s => ({ ...s, mode: m, expanded: true }))
        if (m !== 'ADDRESS') setConvertMode(false)
        setError(null)
    }
    const setCol = (key: keyof ExcelCols, value: string) => {
        if (locked()) return
        invalidateConvert()
        setSel(s => ({ ...s, cols: { ...s.cols, [key]: value } }))
    }
    const setSrid = (value: string) => {
        if (locked()) return
        setSel(s => ({ ...s, srid: value, sridOk: true }))
    }
    const enterConvert = () => {
        if (locked()) return
        invalidateConvert()
        setConvertMode(true)
        setError(null)
    }
    const leaveConvert = () => {
        if (locked()) return
        invalidateConvert()
        setConvertMode(false)
        setError(null)
    }

    if (converted) {
        return <MyMapConvertResultDialog sourceName={converted.sourceName} result={converted.result} notice={converted.notice}
            onRestart={restart} onClose={onClose} />
    }

    // ───────────── 조각 ─────────────
    const selectedColumns = sel.mode === 'PNU' ? [sel.cols.pnu] : sel.mode === 'ADDRESS' ? [sel.cols.address] : [sel.cols.lat, sel.cols.lon]

    const nameField = (
        <label className="gm-upload__namefield">
            <span className="gm-modal__label">{TEXT.nameLabel}</span>
            <input value={name} maxLength={100} disabled={submitting} onChange={e => setTypedName(e.target.value)} placeholder={TEXT.namePlaceholder}
                className="gm-modal__field gm-upload__name-input" />
        </label>
    )

    const stepsStrip = submitting && !toExcel && (
        <ol className="gm-upload__steps" aria-hidden="true">
            <li className="gm-upload__step gm-is-now"><Loader2 size={16} className="gm-loader" /><span><b>파일 보내기</b>지금</span></li>
            <li className="gm-upload__step"><span className="gm-upload__step-n">2</span><span><b>위치 찾기</b>목록에서 진행률</span></li>
            <li className="gm-upload__step"><span className="gm-upload__step-n">3</span><span><b>결과 확인</b>끝나면 자동으로 열림</span></li>
        </ol>
    )
    const sendNote = submitting && !toExcel ? sendingNote(sendBytes) : null

    const moreZone = <UploadDropZone variant="more" ref={dropBtnRef} disabled={submitting || reading} onPick={acceptFiles}
        label={pick.kind === 'unsupported' || block ? TEXT.otherDrop : undefined} sub={pick.kind === 'unsupported' || block ? null : undefined} />

    const cardEl = (c: ReturnType<typeof cardForPick>) => c && (
        <div className={cx('gm-upload__card', cardToneClass(c.tone))} role={c.tone === 'err' ? 'alert' : undefined}>
            <div className="gm-upload__card-head">
                {c.tone === 'ok' ? <CheckCircle2 size={16} className="gm-upload__card-icon" aria-hidden="true" /> : <AlertCircle size={16} className="gm-upload__card-icon" aria-hidden="true" />}
                <span className="gm-upload__card-text">
                    <b>{c.title}</b>
                    {c.lines.map((l, i) => <span key={i}>{l}</span>)}
                </span>
            </div>
        </div>
    )

    // 칩 목록에서 빠진 필수 파일 자리
    const missingSlots: MissingSlot[] = []
    if (pick.kind === 'shp' && !pick.nameMismatch) {
        if (pick.missing.includes('shp') && !pick.emptyNames.shp) missingSlots.push({ name: `${pick.group.base}.shp`, label: '도형 · 필요' })
        if (pick.missing.includes('dbf') && !pick.emptyNames.dbf) missingSlots.push({ name: `${pick.group.base}.dbf`, label: '속성 · 필요' })
    }

    /** SHP 한 벌이 정해졌을 때의 아래쪽(좌표계·이름) */
    const shpTail = pick.kind === 'shp' && pick.missing.length === 0 && !pick.nameMismatch && !pick.overSize && (
        <>
            {shpWarnings(pick).map(w => <Banner key={w} tone="warn">{w}</Banner>)}
            {pick.noPrj ? (
                <>
                    <label className="gm-upload__frow">
                        <span className="gm-upload__frow-label">원본 좌표계</span>
                        <select value={shpSrid} disabled={submitting} onChange={e => setShpSrid(e.target.value)} className="gm-modal__field gm-upload__select">
                            {SRID_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </select>
                    </label>
                    <span className="gm-upload__hint">{NO_PRJ_TEXT}</span>
                </>
            ) : (
                <Fold icon="info" title="좌표계 직접 정하기" hint="(.prj를 못 읽을 때만 이 값을 씁니다)">
                    <label className="gm-upload__frow">
                        <span className="gm-upload__frow-label">원본 좌표계</span>
                        <select value={shpSrid} disabled={submitting} onChange={e => setShpSrid(e.target.value)} className="gm-modal__field gm-upload__select">
                            {SRID_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </select>
                    </label>
                </Fold>
            )}
            {nameField}
            {stepsStrip}
        </>
    )

    const excelRow = pick.kind === 'excel' && (
        <div className="gm-upload__filerow">
            <span className="gm-upload__filerow-icon" aria-hidden="true"><FileSpreadsheet size={16} /></span>
            <span className="gm-upload__filerow-text">
                <b title={pick.file.name}>{pick.file.name}</b>
                <span>
                    {formatBytes(pick.file.size)}
                    {preview && preview.totalRows !== undefined ? ` · 데이터 ${formatCount(preview.totalRows)}행` : ''}
                    {preview ? ` · 열 ${preview.headers.length}개` : ''}
                </span>
            </span>
            {reading && <Loader2 size={14} className="gm-loader gm-loader--primary" aria-hidden="true" />}
            <button type="button" className="gm-upload__small-btn" disabled={submitting || reading} onClick={clearFiles}>{TEXT.otherFile}</button>
        </div>
    )

    const excelBody = () => {
        if (pick.kind !== 'excel') return null
        const others = resolved.items.filter(i => i.use !== 'use')
        const head = (
            <>
                {excelRow}
                {others.length > 0 && <UploadFileList items={others} disabled={submitting} onRemove={removeFile} />}
            </>
        )
        if (pick.overSize && maxExcelMb) {
            return <>{head}<div className="gm-upload__card gm-is-err" role="alert"><div className="gm-upload__card-head"><AlertCircle size={16} className="gm-upload__card-icon" aria-hidden="true" /><span className="gm-upload__card-text"><b>파일이 너무 큽니다</b><span>{excelOverSizeText(pick.file.name, pick.file.size, maxExcelMb)}</span></span></div></div>{moreZone}</>
        }
        if (block) {
            return <>{head}<div className="gm-upload__card gm-is-err" role="alert"><div className="gm-upload__card-head"><AlertCircle size={16} className="gm-upload__card-icon" aria-hidden="true" /><span className="gm-upload__card-text"><b>엑셀을 읽지 못했습니다</b><span>{excelBlockText(block)}</span></span></div></div>{moreZone}</>
        }
        if (reading || !preview) {
            return (
                <>
                    {head}
                    <div className="gm-upload__skeleton" aria-hidden="true">
                        <b>파일을 읽고 있습니다…</b>
                        <span>열과 값 모양을 살펴보는 중</span>
                        <i /><i />
                    </div>
                </>
            )
        }
        if (expired) {
            return (
                <>
                    {head}
                    <div className="gm-upload__card gm-is-need">
                        <div className="gm-upload__card-head">
                            <AlertCircle size={16} className="gm-upload__card-icon" aria-hidden="true" />
                            <span className="gm-upload__card-text"><b>파일을 다시 읽어야 합니다</b><span>올린 지 오래되어 서버가 파일을 잊었습니다. 고른 방법·열은 그대로 둡니다.</span></span>
                            <button type="button" className="gm-upload__small-btn" onClick={reread}>{TEXT.reread}</button>
                        </div>
                    </div>
                </>
            )
        }
        const warnings = (preview.warnings ?? []).filter(w => w.code !== 'OVER_LIMIT' && (w.code !== 'NUMERIC_PNU_CELLS' || sel.mode === 'PNU'))
        const manual = !sel.quick
        const banners = (
            <>
                {usesParcel && coverageNote.partial && (
                    <Banner tone="info">{`적재된 시도 밖의 ${sel.mode === 'ADDRESS' ? '주소' : 'PNU'}는 "이 지역 지적도는 아직 제공하지 않습니다"로 실패합니다.`}</Banner>
                )}
                {usesParcel && coverageNote.missing && (
                    <Banner tone="warn">{`지적도 자료 준비 중입니다. 준비가 끝나기 전에는 ${sel.mode === 'ADDRESS' ? '주소' : 'PNU'}로 올릴 수 없습니다(좌표 엑셀·SHP는 가능).`}</Banner>
                )}
                {warnings.map(w => (
                    <Banner key={w.code} tone={w.code === 'NUMERIC_PNU_CELLS' ? 'warn' : 'info'}>{w.code === 'NUMERIC_PNU_CELLS' ? NUMERIC_PNU_TEXT : w.message}</Banner>
                ))}
                {over?.blocked && over.text && <Banner tone="error">{over.text}</Banner>}
            </>
        )
        if (toExcel) {
            return (
                <>
                    <button type="button" className="gm-upload__back" disabled={converting} onClick={leaveConvert}>
                        <ArrowLeft size={13} aria-hidden="true" />{TEXT.convertBack}
                    </button>
                    {head}
                    <div className="gm-upload__card gm-is-info">
                        <div className="gm-upload__card-head">
                            <Info size={16} className="gm-upload__card-icon" aria-hidden="true" />
                            <span className="gm-upload__card-text"><b>지도에 올리지 않고 결과 엑셀만 받습니다</b><span>원본 열은 그대로 두고 오른쪽에 붙입니다. 실패한 행도 사유와 함께 남고, 서버에는 남지 않습니다.</span></span>
                        </div>
                    </div>
                    <ColSelect label="주소 열" value={sel.cols.address} headers={preview.headers} need disabled={converting} onChange={v => setCol('address', v)} />
                    <ConvertOptions flags={flags} onFlags={v => { if (locked()) return; invalidateConvert(); setFlags(v) }} disabled={converting}
                        srid={convertSrid} onSrid={v => { if (locked()) return; invalidateConvert(); setConvertSrid(v) }} />
                    {banners}
                </>
            )
        }
        return (
            <>
                {head}
                <ExcelLocationCard preview={preview} legacy={legacy} mode={sel.mode} cols={sel.cols} srid={sel.srid} sridOk={sel.sridOk} quick={sel.quick}
                    expanded={sel.expanded} locked={submitting} coverageText={usesParcel ? coverageNote.text : null}
                    canConvert={convertAvailable} onExpand={() => setSel(s => ({ ...s, expanded: true }))}
                    onMode={setMode} onCol={setCol} onSrid={setSrid} onConvert={enterConvert} />
                {banners}
                <Fold key={preview.uploadId} icon="file" title={`미리보기 (앞 ${Math.min(preview.sampleRows.length, PREVIEW_ROWS)}행)`} open={manual}>
                    <PreviewTable preview={preview} selected={selectedColumns} />
                    <span className="gm-upload__hint">고른 열은 주황으로 표시됩니다{over?.limit ? ` · 최대 ${formatCount(over.limit)}행까지 올릴 수 있습니다` : ''}</span>
                </Fold>
                {sel.mode === 'ADDRESS' && <Fold icon="info" title="주소 적는 요령"><span className="gm-upload__hint">{ADDRESS_TIP}</span></Fold>}
                {nameField}
                {stepsStrip}
            </>
        )
    }

    const choose = () => {
        if (pick.kind === 'mixed') {
            return (
                <>
                    <UploadFileList items={resolved.items} disabled={submitting} onRemove={removeFile} />
                    <div className="gm-upload__card gm-is-need">
                        <div className="gm-upload__card-head">
                            <Info size={16} className="gm-upload__card-icon" aria-hidden="true" />
                            <span className="gm-upload__card-text"><b>엑셀과 SHP는 따로 올려야 합니다</b><span>어느 쪽부터 올릴까요? 고르지 않은 파일은 빠집니다.</span></span>
                        </div>
                        <div className="gm-upload__choice">
                            <button type="button" className="gm-upload__opt" onClick={() => keepKind('excel')}>
                                <FileSpreadsheet size={16} aria-hidden="true" />
                                <span className="gm-upload__opt-text"><b>엑셀로 계속</b><span>{pick.excels.length === 1 ? pick.excels[0].name : `엑셀 ${pick.excels.length}개`}</span></span>
                            </button>
                            <button type="button" className="gm-upload__opt" onClick={() => keepKind('shp')}>
                                <Layers size={16} aria-hidden="true" />
                                <span className="gm-upload__opt-text"><b>SHP로 계속</b><span>{shpSummary(pick.shpFiles)}</span></span>
                            </button>
                        </div>
                    </div>
                </>
            )
        }
        if (pick.kind === 'choose-excel') {
            return (
                <>
                    <UploadFileList items={resolved.items} disabled={submitting} onRemove={removeFile} />
                    <div className="gm-upload__card gm-is-need">
                        <div className="gm-upload__card-head">
                            <Info size={16} className="gm-upload__card-icon" aria-hidden="true" />
                            <span className="gm-upload__card-text"><b>엑셀은 한 번에 하나씩 올릴 수 있습니다</b><span>올릴 파일을 고르세요.</span></span>
                        </div>
                        <div className="gm-upload__choice gm-is-col">
                            {pick.excels.map((f, i) => (
                                <button key={`${f.name}-${i}`} type="button" className="gm-upload__opt" onClick={() => { if (!locked()) commitFiles([f]) }}>
                                    <FileSpreadsheet size={16} aria-hidden="true" />
                                    <span className="gm-upload__opt-text"><b title={f.name}>{f.name}</b><span>{formatBytes(f.size)} · 이 파일로</span></span>
                                </button>
                            ))}
                        </div>
                    </div>
                </>
            )
        }
        return null
    }

    /** SHP: 칩 목록 · (여러 벌이면 묶음 고르기) · 판별 카드 · 좌표계·이름 */
    const shpBody = () => {
        const raw = resolved.raw
        const card = cardForPick(pick, maxShpMb)
        return (
            <>
                <UploadFileList items={resolved.items} missing={missingSlots} disabled={submitting} onRemove={removeFile} />
                {raw.kind === 'choose-shp' && (
                    <div className="gm-upload__card gm-is-need">
                        <div className="gm-upload__card-head">
                            <Layers size={16} className="gm-upload__card-icon" aria-hidden="true" />
                            <span className="gm-upload__card-text"><b>SHP가 {raw.groups.length}벌 있습니다</b><span>SHP는 한 번에 한 레이어씩 올릴 수 있습니다. 올릴 묶음을 고르세요.</span></span>
                        </div>
                        <div className="gm-upload__choice gm-is-col" role="radiogroup" aria-label="올릴 SHP 묶음">
                            {raw.groups.map(g => (
                                <label key={g.key} className={cx('gm-upload__opt', resolved.shpKey === g.key && 'gm-is-active')}>
                                    <input type="radio" name={shpRadioName} checked={resolved.shpKey === g.key} disabled={submitting} onChange={() => setShpKeyChoice(g.key)} />
                                    <span className="gm-upload__opt-text"><b>{g.base}</b><span>{groupDescribe(g)}</span></span>
                                </label>
                            ))}
                        </div>
                    </div>
                )}
                {card && (raw.kind !== 'choose-shp' || card.tone !== 'ok') && cardEl(card)}
                {shpTail}
            </>
        )
    }

    const empty = files.length === 0
    const kindBody = () => {
        if (pick.kind === 'excel') return excelBody()
        if (pick.kind === 'shp') return <>{shpBody()}{moreZone}</>
        if (pick.kind === 'mixed' || pick.kind === 'choose-excel') return choose()
        if (pick.kind === 'unsupported') {
            return (
                <>
                    <UploadFileList items={resolved.items} disabled={submitting} onRemove={removeFile} />
                    {cardEl(cardForPick(pick, maxShpMb))}
                    {moreZone}
                </>
            )
        }
        return null
    }
    // choose-shp는 resolved.pick이 고른 묶음 하나로 풀린 'shp'라 shp 화면(shpBody)이 묶음 고르기까지 함께 그린다
    const body = empty ? null : kindBody()

    const submitLabel = submitting ? TEXT.submitting : toExcel ? TEXT.convertSubmit : TEXT.submit
    const onSubmit = pick.kind === 'shp' ? handleShpSubmit : toExcel ? handleConvert : handleExcelConfirm

    return (
        // 바깥(어두운 배경)을 눌러도 닫지 않는다 — 올리는 도중 실수로 입력·진행이 날아가지 않게 X 단추로만 닫는다
        <div className="gm-modal" onMouseDown={keepFocusOnBackdrop}>
            <div ref={dialogRef} className="gm-modal__dialog gm-upload-modal" role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={descId}
                aria-busy={submitting || reading} {...drop.bind}>
                <div className="gm-modal__header">
                    <span id={titleId} ref={titleRef} tabIndex={-1} className="gm-modal__title">{toExcel ? TEXT.convertTitle : TEXT.title}</span>
                    <button type="button" onClick={onClose} className="gm-modal__close" aria-label="닫기"><X size={16} /></button>
                </div>

                <div ref={bodyRef} className="gm-modal__body">
                    <span id={descId} className="gm-upload__sr">엑셀(.xlsx) 1개 또는 SHP 묶음(.shp·.shx·.dbf·.prj)을 올릴 수 있습니다. 파일을 끌어 놓거나 눌러서 고르세요.</span>
                    {empty ? (
                        <>
                            <UploadDropZone variant="big" ref={dropBtnRef} disabled={submitting} onPick={acceptFiles} />
                            <SampleLinks onError={setError} classes={UPLOAD_SAMPLE_CLASSES} label="샘플 엑셀 받기" />
                            <Fold icon="info" title={TEXT.canUpload}>
                                <ul className="gm-upload__kl">
                                    <li><FileSpreadsheet size={12} aria-hidden="true" /><span><b>엑셀 – PNU</b> 19자리 PNU 열 → 필지 모양</span></li>
                                    <li><FileSpreadsheet size={12} aria-hidden="true" /><span><b>엑셀 – 주소</b> 도로명·지번 주소 열 → 필지 모양</span></li>
                                    <li><FileSpreadsheet size={12} aria-hidden="true" /><span><b>엑셀 – 좌표</b> 위도·경도 열 → 점</span></li>
                                    <li><Layers size={12} aria-hidden="true" /><span><b>SHP</b> 점·선·면 그대로 (.shp·.dbf 필수, .shx·.prj 함께)</span></li>
                                </ul>
                                <span className="gm-upload__hint">
                                    첫 행은 머리글이어야 합니다. 수식 칸은 값으로 붙여넣어 주세요. 압축 파일(.zip)은 풀어서 올려 주세요.
                                    {limitsLine(quota) ? <><br />{limitsLine(quota)}</> : null}
                                </span>
                            </Fold>
                        </>
                    ) : body}

                    {notice && <div className="gm-upload__alert gm-is-info" role="status"><Info size={12} aria-hidden="true" /><span>{notice}</span></div>}
                    {error && <div className="gm-upload__alert gm-is-error" role="alert"><AlertCircle size={12} aria-hidden="true" /><span>{error}</span></div>}
                    {sendNote && <div className="gm-upload__alert gm-is-info" role="status"><Info size={12} aria-hidden="true" /><span>{sendNote}</span></div>}
                </div>

                <div className="gm-upload__foot">
                    <span id={footId} className={cx('gm-upload__foot-note', footer.need && 'gm-is-need')}>{footer.text}</span>
                    <button type="button" className="gm-upload__submit" disabled={!canSubmit} aria-describedby={footId} onClick={() => { void onSubmit() }}>
                        {submitting ? <Loader2 size={13} className="gm-loader" aria-hidden="true" /> : toExcel ? <Download size={13} aria-hidden="true" /> : null}
                        {submitLabel}
                    </button>
                </div>

                <div className="gm-upload__sr" role="status" aria-live="polite">{live}</div>

                {drop.dragging && (
                    <div className={cx('gm-upload__overlay', (submitting || reading) && 'gm-is-locked')} aria-hidden="true">
                        <span className="gm-upload__overlay-icon"><Upload size={24} /></span>
                        <b>{submitting || reading ? TEXT.overlayLocked : TEXT.overlay}</b>
                        <small>{submitting || reading ? TEXT.overlayLockedSub : TEXT.overlaySub}</small>
                    </div>
                )}
            </div>
        </div>
    )
}

/** 판별 카드 색 클래스 */
function cardToneClass(tone: 'ok' | 'need' | 'err' | 'info'): string {
    return tone === 'ok' ? 'gm-is-ok' : tone === 'need' ? 'gm-is-need' : tone === 'err' ? 'gm-is-err' : 'gm-is-info'
}
