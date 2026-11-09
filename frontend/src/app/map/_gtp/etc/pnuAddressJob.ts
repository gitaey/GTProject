'use client'

// PNU → 주소 찾기: 작업 상태 + 실행기.
// 모듈 수준 zustand 스토어(앱 코드라 허용): MapShell/SidePanel은 열린 패널 하나만 렌더하므로, 컴포넌트 state에 두면
// 다른 탭을 누르는 순간 진행 중인 작업과 결과가 사라진다. 새로고침하면 사라진다(의도). 주인(userId)이 바뀌면 reset.

import { create } from 'zustand'
import type { WorkBook } from 'xlsx'
import { getToken, useAuthStore } from '@/stores/authStore'
import {
    MAX_DATA_ROWS, MAX_FILE_BYTES, PNU_BATCH_SIZE, SUGGEST_SAMPLE_ROWS,
    analyzeColumn, buildResultColumns, chunk, countStatuses, joinRoadAddresses, normalizeItem, rowStatus, startBlock, suggestPnuColumn,
} from './pnuAddressModel'
import type { PnuAddressItem, PnuAddressMeta, PnuCellResult, PnuCheckSummary, PnuResultSummary, ResultRowInput, RowStatus } from './pnuAddressModel'
import { buildResultWorkbook, cellAt, cellDisplay, columnCells, readSheet, readWorkbook, resultFileName, saveWorkbook } from './pnuAddressExcel'
import type { SheetModel } from './pnuAddressExcel'

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8080'
const ENDPOINT = '/api/mymap/ref/pnu-addresses'
const REQUEST_TIMEOUT_MS = 100_000
const BUSY_WAITS_MS: readonly number[] = [1000, 2000, 4000]
const GATEWAY_WAIT_MS = 3000
const WARMUP_HINT_MS = 3000

export type JobPhase = 'idle' | 'reading' | 'ready' | 'running' | 'paused' | 'done' | 'error'

export interface JobError {
    status: number | null
    message: string
}

export interface PnuJobState {
    phase: JobPhase
    ownerId: string
    fileName: string | null
    sheetNames: string[]
    sheetName: string | null
    headers: string[]
    pnuColumn: number | null
    suggestedColumn: number | null
    /** true = 추천 열이 정상 PNU 열이 아니라 숫자로 깨진 후보 */
    suggestBroken: boolean
    dataRowCount: number
    check: PnuCheckSummary | null
    uniquePnus: string[]
    done: number
    results: Record<string, PnuAddressItem>
    meta: PnuAddressMeta | null
    error: JobError | null
    resultSummary: PnuResultSummary | null
    /** paused일 때: 사용자가 중지('user') / 오류로 멈춤('error') */
    pauseReason: 'user' | 'error' | null
    /** 재시도 대기 안내("요청이 많아 2초 뒤 다시 시도합니다") */
    retryNote: string | null
    /** 첫 묶음이 3초를 넘기면 true(주소 사전 준비 안내) */
    warmupHint: boolean

    pickFile: (file: File) => Promise<void>
    chooseSheet: (name: string) => void
    chooseColumn: (index: number) => void
    start: () => void
    stop: () => void
    resume: () => void
    /** 실패하면 사람이 읽을 메시지, 성공이면 null */
    download: () => string | null
    reset: () => void
}

// ── 스토어 밖 모듈 변수(직렬화 불필요·리렌더 유발 X) ─────────────
let sourceBuffer: ArrayBuffer | null = null
let workbook: WorkBook | null = null
let sheetModel: SheetModel | null = null
let columnResults: PnuCellResult[] = []
let runSeq = 0
let readSeq = 0
let running = false
let runAbort: AbortController | null = null

function ownerNow(): string {
    return useAuthStore.getState().user?.userId ?? ''
}

function initialState(): Omit<PnuJobState, 'pickFile' | 'chooseSheet' | 'chooseColumn' | 'start' | 'stop' | 'resume' | 'download' | 'reset'> {
    return {
        phase: 'idle', ownerId: '', fileName: null, sheetNames: [], sheetName: null, headers: [], pnuColumn: null,
        suggestedColumn: null, suggestBroken: false, dataRowCount: 0, check: null, uniquePnus: [], done: 0, results: {},
        meta: null, error: null, resultSummary: null, pauseReason: null, retryNote: null, warmupHint: false,
    }
}

function clearModule(): void {
    runSeq++
    readSeq++
    running = false
    if (runAbort) runAbort.abort()
    runAbort = null
    sourceBuffer = null
    workbook = null
    sheetModel = null
    columnResults = []
}

// ── 요청 ──────────────────────────────────────────────
class ApiFailure extends Error {
    readonly status: number | null
    constructor(status: number | null, message: string) {
        super(message)
        this.status = status
    }
}

const STATUS_MESSAGES: Readonly<Record<number, string>> = Object.freeze({
    400: '요청 값이 올바르지 않습니다(PNU 19자리 숫자 1~500개).',
    401: '로그인이 만료되었습니다. 다시 로그인한 뒤 [이어서 하기]를 눌러 주세요.',
    429: '주소 찾기 요청이 많습니다. 잠시 후 다시 시도하세요.',
    502: '서버에 연결하지 못했습니다.',
    503: '지적도(또는 주소) 자료가 아직 준비되지 않았습니다.',
    504: '서버 응답이 늦어 연결이 끊겼습니다.',
})

function failureMessage(status: number, body: unknown): string {
    // 만료·비로그인은 서버가 401이 아니라 403(빈 본문)으로 돌려준다(JwtFilter가 익명으로 통과시킴)
    if (status === 401 || status === 403) return STATUS_MESSAGES[401]
    if (typeof body === 'object' && body !== null) {
        const m = (body as Record<string, unknown>).message
        if (typeof m === 'string' && m.trim() !== '' && m.length <= 300) return m
    }
    return STATUS_MESSAGES[status] ?? `서버 오류가 발생했습니다(HTTP ${status}).`
}

function parseMeta(data: Record<string, unknown>): PnuAddressMeta {
    return {
        referenceVersion: typeof data.referenceVersion === 'string' ? data.referenceVersion : null,
        roadAvailable: data.roadAvailable !== false,
        relatedIncluded: data.relatedIncluded !== false,
        maxRoadAddresses: typeof data.maxRoadAddresses === 'number' && data.maxRoadAddresses >= 1 ? data.maxRoadAddresses : 20,
    }
}

interface BatchResponse {
    items: unknown[]
    meta: PnuAddressMeta
}

async function postOnce(pnus: readonly string[], runSignal: AbortSignal): Promise<BatchResponse> {
    const ctrl = new AbortController()
    let timedOut = false
    const relay = () => ctrl.abort()
    runSignal.addEventListener('abort', relay, { once: true })
    const timer = setTimeout(() => { timedOut = true; ctrl.abort() }, REQUEST_TIMEOUT_MS)
    try {
        const token = getToken()
        const res = await fetch(`${API}${ENDPOINT}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
            body: JSON.stringify({ pnus }),
            cache: 'no-store',
            signal: ctrl.signal,
        })
        const text = await res.text()
        let body: unknown = null
        try { body = text === '' ? null : JSON.parse(text) } catch { body = null }
        if (!res.ok) throw new ApiFailure(res.status, failureMessage(res.status, body))
        const rec = typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : null
        const data = rec && typeof rec.data === 'object' && rec.data !== null ? (rec.data as Record<string, unknown>) : null
        if (!rec || rec.success === false || !data || !Array.isArray(data.items)) {
            const reason = rec && typeof rec.message === 'string' && rec.message.trim() !== '' && rec.message.length <= 300 ? rec.message : '서버 응답을 해석하지 못했습니다.'
            throw new ApiFailure(res.status, reason)
        }
        return { items: data.items, meta: parseMeta(data) }
    } catch (e) {
        if (e instanceof ApiFailure) throw e
        if (runSignal.aborted) throw e // 사용자 중지·reset
        throw new ApiFailure(null, timedOut ? '서버 응답 시간이 초과되었습니다.' : '서버에 연결하지 못했습니다.')
    } finally {
        clearTimeout(timer)
        runSignal.removeEventListener('abort', relay)
    }
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
        if (signal.aborted) { reject(new DOMException('aborted', 'AbortError')); return }
        const timer = setTimeout(() => { signal.removeEventListener('abort', onAbort); resolve() }, ms)
        const onAbort = () => { clearTimeout(timer); reject(new DOMException('aborted', 'AbortError')) }
        signal.addEventListener('abort', onAbort, { once: true })
    })
}

/** 429는 1·2·4초 뒤 3번, 502/504·네트워크·시간 초과는 3초 뒤 1번 다시 보낸다. 그 밖(400·401·403·503·500)은 바로 실패. */
async function requestBatch(pnus: readonly string[], signal: AbortSignal, note: (text: string | null) => void): Promise<BatchResponse> {
    let busy = 0
    let gatewayRetried = false
    for (;;) {
        try {
            const out = await postOnce(pnus, signal)
            note(null)
            return out
        } catch (e) {
            if (signal.aborted || !(e instanceof ApiFailure)) throw e
            if (e.status === 429 && busy < BUSY_WAITS_MS.length) {
                const wait = BUSY_WAITS_MS[busy++]
                note(`요청이 많아 ${wait / 1000}초 뒤 다시 시도합니다 (${busy}/${BUSY_WAITS_MS.length})`)
                await sleep(wait, signal)
                continue
            }
            if ((e.status === null || e.status === 502 || e.status === 504) && !gatewayRetried) {
                gatewayRetried = true
                note(`응답이 늦어 ${GATEWAY_WAIT_MS / 1000}초 뒤 다시 시도합니다`)
                await sleep(GATEWAY_WAIT_MS, signal)
                continue
            }
            note(null)
            throw e
        }
    }
}

function mergeMeta(prev: PnuAddressMeta | null, cur: PnuAddressMeta): PnuAddressMeta {
    if (!prev) return cur
    return {
        referenceVersion: prev.referenceVersion ?? cur.referenceVersion,
        roadAvailable: prev.roadAvailable && cur.roadAvailable,
        relatedIncluded: prev.relatedIncluded && cur.relatedIncluded,
        maxRoadAddresses: cur.maxRoadAddresses,
    }
}

// ── 행 입력·상태 ───────────────────────────────────────
function rowInputs(results: Record<string, PnuAddressItem>): ResultRowInput[] {
    return columnResults.map((cell) => ({ cell, item: cell.pnu !== null ? results[cell.pnu] : undefined }))
}

function summaryOf(results: Record<string, PnuAddressItem>, meta: PnuAddressMeta | null): PnuResultSummary {
    const roadAvailable = meta?.roadAvailable ?? true
    return countStatuses(rowInputs(results).map((r) => rowStatus(r.cell, r.item, roadAvailable).code))
}

// ── 스토어 ────────────────────────────────────────────
export const usePnuAddressJob = create<PnuJobState>((set, get) => {
    function fail(message: string, extra: Partial<PnuJobState> = {}): void {
        set({ ...extra, phase: 'error', error: { status: null, message } })
    }

    function applyColumn(index: number | null): void {
        const ws = workbook && get().sheetName ? workbook.Sheets[get().sheetName as string] : undefined
        if (index === null || !ws || !sheetModel) {
            columnResults = []
            set({ pnuColumn: null, check: null, uniquePnus: [], done: 0, results: {}, meta: null, resultSummary: null })
            return
        }
        const analysis = analyzeColumn(columnCells(ws, sheetModel, index))
        columnResults = analysis.results
        set({ pnuColumn: index, check: analysis.summary, uniquePnus: analysis.uniquePnus, done: 0, results: {}, meta: null, resultSummary: null })
    }

    function applySheet(name: string): void {
        const ws = workbook?.Sheets[name]
        const model = readSheet(ws)
        sheetModel = model
        columnResults = []
        const base: Partial<PnuJobState> = {
            sheetName: name, headers: model.headers, dataRowCount: model.dataRows.length, pnuColumn: null, suggestedColumn: null,
            suggestBroken: false, check: null, uniquePnus: [], done: 0, results: {}, meta: null, resultSummary: null, error: null,
            pauseReason: null, retryNote: null, warmupHint: false,
        }
        if (model.dataRows.length > MAX_DATA_ROWS) {
            fail(`${MAX_DATA_ROWS.toLocaleString('ko-KR')}행까지 됩니다. 이 시트는 ${model.dataRows.length.toLocaleString('ko-KR')}행입니다. 파일을 나눠 주세요.`, { ...base, headers: [] })
            return
        }
        if (!ws || model.headers.length === 0 || model.dataRows.length === 0) {
            fail('이 시트에는 머리글 아래 데이터 행이 없습니다.', base)
            return
        }
        const sample = model.headers.map((_, c) => columnCells(ws, model, c, SUGGEST_SAMPLE_ROWS))
        const suggestion = suggestPnuColumn(model.headers, sample)
        set({ ...base, phase: 'ready', suggestedColumn: suggestion.column, suggestBroken: suggestion.broken })
        applyColumn(suggestion.column)
    }

    async function runLoop(): Promise<void> {
        if (running) return
        running = true
        const runId = ++runSeq
        const ctrl = new AbortController()
        runAbort = ctrl
        const stale = (): boolean => runId !== runSeq
        let warmTimer: ReturnType<typeof setTimeout> | null = null
        try {
            const batches = chunk(get().uniquePnus, PNU_BATCH_SIZE)
            for (let index = Math.floor(get().done / PNU_BATCH_SIZE); index < batches.length; index++) {
                if (stale()) return
                const batch = batches[index]
                if (index === 0) warmTimer = setTimeout(() => { if (!stale()) set({ warmupHint: true }) }, WARMUP_HINT_MS)
                const res = await requestBatch(batch, ctrl.signal, (text) => { if (!stale()) set({ retryNote: text }) })
                if (warmTimer) { clearTimeout(warmTimer); warmTimer = null }
                if (stale()) return
                const wanted = new Set(batch)
                const next = { ...get().results }
                for (const raw of res.items) {
                    const item = normalizeItem(raw)
                    if (item && wanted.has(item.pnu)) next[item.pnu] = item
                }
                set({ results: next, done: get().done + batch.length, meta: mergeMeta(get().meta, res.meta), warmupHint: false })
            }
            if (stale()) return
            set({ phase: 'done', resultSummary: summaryOf(get().results, get().meta), retryNote: null, warmupHint: false })
        } catch (e) {
            if (stale()) return
            const failure = e instanceof ApiFailure ? e : new ApiFailure(null, e instanceof Error ? e.message : '알 수 없는 오류가 발생했습니다.')
            set({ phase: 'paused', pauseReason: 'error', error: { status: failure.status, message: failure.message }, retryNote: null, warmupHint: false })
        } finally {
            if (warmTimer) clearTimeout(warmTimer)
            if (!stale()) {
                running = false
                runAbort = null
            }
        }
    }

    return {
        ...initialState(),

        pickFile: async (file) => {
            const phase = get().phase
            if (phase === 'running' || phase === 'reading') return
            clearModule()
            set({ ...initialState(), phase: 'reading', ownerId: ownerNow(), fileName: file.name })
            if (/\.csv$/i.test(file.name)) {
                fail("CSV는 바로 읽지 않습니다(긴 숫자가 깨집니다). 아래 'CSV → Excel 변환'으로 먼저 엑셀로 바꿔 주세요.")
                return
            }
            if (!/\.(xlsx|xls)$/i.test(file.name)) {
                fail('엑셀 파일(.xlsx, .xls)만 받을 수 있습니다.')
                return
            }
            if (file.size > MAX_FILE_BYTES) {
                fail(`파일이 너무 큽니다(${(file.size / 1024 / 1024).toFixed(1)}MB). ${MAX_FILE_BYTES / 1024 / 1024}MB까지 됩니다.`)
                return
            }
            const seq = ++readSeq
            try {
                const buffer = await file.arrayBuffer()
                await new Promise<void>((resolve) => setTimeout(resolve, 0)) // '읽는 중' 화면이 먼저 그려지게
                if (seq !== readSeq) return
                const wb = readWorkbook(buffer)
                if (seq !== readSeq) return
                if (wb.SheetNames.length === 0) {
                    fail('엑셀에 시트가 없습니다.')
                    return
                }
                sourceBuffer = buffer
                workbook = wb
                set({ sheetNames: wb.SheetNames.slice() })
                applySheet(wb.SheetNames[0])
            } catch {
                if (seq !== readSeq) return
                fail('엑셀 파일을 읽지 못했습니다. 파일이 손상되었거나 암호가 걸려 있을 수 있습니다.')
            }
        },

        chooseSheet: (name) => {
            const s = get()
            if (!workbook || (s.phase !== 'ready' && s.phase !== 'error') || !workbook.SheetNames.includes(name)) return
            applySheet(name)
        },

        chooseColumn: (index) => {
            const s = get()
            if (s.phase !== 'ready' || index < 0 || index >= s.headers.length) return
            applyColumn(index)
        },

        start: () => {
            const s = get()
            if (s.phase !== 'ready' || running || !s.check || startBlock(s.check) !== null || s.uniquePnus.length === 0) return
            set({ phase: 'running', done: 0, results: {}, meta: null, error: null, resultSummary: null, pauseReason: null, retryNote: null, warmupHint: false })
            void runLoop()
        },

        stop: () => {
            if (get().phase !== 'running') return
            runSeq++ // 진행 중이던 실행기는 낡은 것이 돼 아무것도 바꾸지 않는다
            running = false
            if (runAbort) runAbort.abort()
            runAbort = null
            set({ phase: 'paused', pauseReason: 'user', error: null, retryNote: null, warmupHint: false })
        },

        resume: () => {
            const s = get()
            if (s.phase !== 'paused' || running) return
            if (s.error && s.error.status === 400) return // 같은 요청을 다시 보내도 같은 오류
            set({ phase: 'running', error: null, pauseReason: null, retryNote: null, warmupHint: false })
            void runLoop()
        },

        download: () => {
            const s = get()
            if ((s.phase !== 'done' && s.phase !== 'paused') || !sourceBuffer || !sheetModel || s.sheetName === null || s.fileName === null) {
                return '받을 결과가 없습니다.'
            }
            try {
                const inputs = rowInputs(s.results)
                const roadAvailable = s.meta?.roadAvailable ?? true
                const columns = buildResultColumns(inputs, roadAvailable, s.headers)
                const summary = countStatuses(columns.statuses.flatMap((st) => (st ? [st.code] : [])))
                const wb = buildResultWorkbook(sourceBuffer, sheetModel, columns, { sheetName: s.sheetName, meta: s.meta, summary, totalRows: inputs.length })
                saveWorkbook(wb, resultFileName(s.fileName))
                return null
            } catch (e) {
                return e instanceof Error ? `결과 엑셀을 만들지 못했습니다: ${e.message}` : '결과 엑셀을 만들지 못했습니다.'
            }
        },

        reset: () => {
            clearModule()
            set(initialState())
        },
    }
})

// ── 미리보기 ──────────────────────────────────────────
export interface PreviewRow {
    /** 엑셀 행 번호(1부터) */
    rowNumber: number
    rawPnu: string
    status: RowStatus
    detail: string | null
    jibun: string | null
    road: string | null
    /** 대표 말고 더 있는 도로명주소 수 */
    moreRoads: number
    allRoads: string | null
}

export interface PreviewResult {
    rows: PreviewRow[]
    /** 조건에 맞는 전체 행 수 */
    total: number
}

/** 앞 limit행(onlyIssues면 성공이 아닌 행 중 앞 limit행). 작업이 끝났거나 멈춘 뒤에만 의미가 있다. */
export function buildPreview(onlyIssues: boolean, limit: number): PreviewResult {
    const s = usePnuAddressJob.getState()
    const model = sheetModel
    const ws = workbook && s.sheetName ? workbook.Sheets[s.sheetName] : undefined
    if (!model || !ws || s.pnuColumn === null) return { rows: [], total: 0 }
    const roadAvailable = s.meta?.roadAvailable ?? true
    const rows: PreviewRow[] = []
    let total = 0
    for (let i = 0; i < columnResults.length; i++) {
        const cell = columnResults[i]
        const item = cell.pnu !== null ? s.results[cell.pnu] : undefined
        const status = rowStatus(cell, item, roadAvailable)
        if (onlyIssues && status.code === 'SUCCESS') continue
        total++
        if (rows.length >= limit) continue
        const known = cell.kind === 'OK' && item ? item : null
        const first = known && known.roadAddresses.length > 0 ? known.roadAddresses[0] : null
        rows.push({
            rowNumber: model.dataRows[i] + 1,
            rawPnu: cellDisplay(cellAt(ws, model, s.pnuColumn, i)),
            status,
            detail: cell.detail,
            jibun: known ? known.jibunAddress : null,
            road: first ? first.roadAddress : null,
            moreRoads: known && known.roadAddressCount > 1 ? known.roadAddressCount - 1 : 0,
            allRoads: known && known.roadAddressCount > 1 ? joinRoadAddresses(known) : null,
        })
    }
    return { rows, total }
}

// 로그아웃·다른 사용자 로그인 → 작업 버림(mapSession과 같은 규칙)
if (typeof window !== 'undefined') {
    useAuthStore.subscribe((auth) => {
        const owner = usePnuAddressJob.getState().ownerId
        if (owner !== '' && owner !== (auth.user?.userId ?? '')) usePnuAddressJob.getState().reset()
    })
}
