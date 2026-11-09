// PNU → 주소 찾기: 엑셀 읽기·결과 엑셀 만들기(SheetJS). React·zustand·fetch 없음 — node에서 그대로 시험한다.
import * as XLSX from 'xlsx'
import { isBlankCell, uniqueHeader } from './pnuAddressModel'
import type { CellLike, PnuAddressMeta, PnuResultSummary, ResultColumns } from './pnuAddressModel'
import { STATUS_CODES, statusOf } from './pnuAddressModel'

/** cellNF: 숫자 서식(w 표시 글자)을 얻는다. cellDates 끔: 날짜도 숫자로(PNU 칸 판정에 영향 없음) */
const READ_OPTIONS: XLSX.ParsingOptions = { type: 'array', cellNF: true, cellDates: false }

export function readWorkbook(buffer: ArrayBuffer): XLSX.WorkBook {
    return XLSX.read(buffer, READ_OPTIONS)
}

export interface SheetModel {
    /** 머리글 행(0부터) = 시트 범위의 첫 행 */
    headerRow: number
    startCol: number
    endCol: number
    headers: string[]
    /** 비어 있지 않은 데이터 행의 시트 행 번호(0부터, 오름차순). 완전히 빈 행은 없다 */
    dataRows: number[]
}

const EMPTY_SHEET: SheetModel = Object.freeze({ headerRow: 0, startCol: 0, endCol: -1, headers: [], dataRows: [] }) as SheetModel

function headerText(cell: XLSX.CellObject | undefined): string {
    if (!cell || cell.v === undefined || cell.v === null) return ''
    return (typeof cell.w === 'string' ? cell.w : String(cell.v)).trim()
}

/** 시트의 머리글과 데이터 행 목록을 읽는다. 셀이 있는 자리만 훑으므로 서식만 큰 시트도 빠르다. */
export function readSheet(ws: XLSX.WorkSheet | undefined): SheetModel {
    if (!ws || typeof ws['!ref'] !== 'string') return EMPTY_SHEET
    const range = XLSX.utils.decode_range(ws['!ref'])
    const headerRow = range.s.r
    const filled = new Set<number>()
    for (const key of Object.keys(ws)) {
        if (key.charAt(0) === '!') continue
        const pos = XLSX.utils.decode_cell(key)
        if (pos.r <= headerRow || pos.r > range.e.r || pos.c < range.s.c || pos.c > range.e.c) continue
        if (!isBlankCell(ws[key] as CellLike)) filled.add(pos.r)
    }
    const headers: string[] = []
    for (let c = range.s.c; c <= range.e.c; c++) {
        const text = headerText(ws[XLSX.utils.encode_cell({ r: headerRow, c })] as XLSX.CellObject | undefined)
        headers.push(text === '' ? `열${c - range.s.c + 1}` : text)
    }
    return { headerRow, startCol: range.s.c, endCol: range.e.c, headers, dataRows: Array.from(filled).sort((a, b) => a - b) }
}

/** headers의 col번째 열의 셀을 데이터 행 순서대로 */
export function columnCells(ws: XLSX.WorkSheet, model: SheetModel, col: number, limit?: number): (CellLike | undefined)[] {
    const rows = limit === undefined ? model.dataRows : model.dataRows.slice(0, limit)
    return rows.map((r) => ws[XLSX.utils.encode_cell({ r, c: model.startCol + col })] as CellLike | undefined)
}

/** headers의 col번째 열, dataIndex번째 데이터 행의 셀 하나 */
export function cellAt(ws: XLSX.WorkSheet, model: SheetModel, col: number, dataIndex: number): CellLike | undefined {
    return ws[XLSX.utils.encode_cell({ r: model.dataRows[dataIndex], c: model.startCol + col })] as CellLike | undefined
}

/** 미리보기·표시용 원본 글자 */
export function cellDisplay(cell: CellLike | undefined): string {
    if (!cell || cell.v === undefined || cell.v === null) return ''
    return typeof cell.w === 'string' ? cell.w : String(cell.v)
}

// ── 결과 엑셀 ─────────────────────────────────────────
const COLUMN_WIDTHS: readonly number[] = [18, 22, 36, 42, 10, 24, 14, 64, 40]

const COLUMN_MEANINGS: readonly string[] = [
    '이 행의 처리 결과(성공 · 건물 없음 · 지번만 · 법정동 없음 · PNU 형식 오류 · 복구 불가 · 빈 값 · 조회 안 됨)',
    '하이픈·공백을 뺀 19자리 PNU(조회한 행만)',
    '표준 지번주소(시도 시군구 법정동 [리] [산 ]본번[-부번])',
    '대표 도로명주소 1개(대표지번 건물 우선 · 도로명 · 지하여부 · 건물번호 순)',
    '대표 도로명주소의 우편번호(5자리 글자)',
    '대표 도로명주소의 건물명',
    '이 필지에 걸린 서로 다른 도로명주소의 수',
    '도로명주소가 2개 이상일 때 전체 목록(최대 20개, 넘으면 끝에 외 N건)',
    '형식 오류 상세 · 관련지번으로 찾은 건물 · 건물이 없을 때 안내',
]

function pad(n: number): string {
    return n < 10 ? `0${n}` : String(n)
}

function stamp(d: Date): string {
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export interface ResultInfo {
    sheetName: string
    meta: PnuAddressMeta | null
    summary: PnuResultSummary
    totalRows: number
    now?: Date
}

/** 원본 파일을 다시 읽어 고른 시트 오른쪽에 열을 덧붙이고 '열설명' 시트를 더한다(몇 번을 불러도 원본 버퍼는 그대로). */
export function buildResultWorkbook(buffer: ArrayBuffer, model: SheetModel, columns: ResultColumns, info: ResultInfo): XLSX.WorkBook {
    const wb = readWorkbook(buffer)
    const ws = wb.Sheets[info.sheetName]
    if (!ws) throw new Error(`시트를 찾을 수 없습니다: ${info.sheetName}`)

    const originCol = model.endCol + 1
    const last = model.dataRows.length > 0 ? model.dataRows[model.dataRows.length - 1] : model.headerRow
    const aoa: (string | number | null)[][] = []
    for (let i = 0; i <= last - model.headerRow; i++) aoa.push([])
    aoa[0] = columns.headers.slice()
    model.dataRows.forEach((r, i) => { aoa[r - model.headerRow] = columns.rows[i] })
    XLSX.utils.sheet_add_aoa(ws, aoa, { origin: { r: model.headerRow, c: originCol } })

    const cols = (ws['!cols'] ?? []) as XLSX.ColInfo[]
    COLUMN_WIDTHS.forEach((wch, k) => { cols[originCol + k] = { wch } })
    ws['!cols'] = cols

    // ── 열설명 시트 ──
    const taken = new Set(wb.SheetNames)
    const sheetName = uniqueHeader('열설명', taken)
    const rows: (string | number)[][] = [['열 이름', '뜻']]
    columns.headers.forEach((h, i) => rows.push([h, COLUMN_MEANINGS[i] ?? '']))
    rows.push([])
    rows.push(['건물DB 기준월', info.meta?.referenceVersion ?? '알 수 없음'])
    rows.push(['처리 일시', stamp(info.now ?? new Date())])
    rows.push(['전체 행 수', info.totalRows])
    for (const code of STATUS_CODES) {
        if (info.summary[code] > 0) rows.push([`행 수 · ${statusOf(code).label}`, info.summary[code]])
    }
    rows.push([])
    rows.push(['안내', '글꼴·색 서식은 유지되지 않습니다(원본 값·숫자 서식·병합·열 너비는 유지).'])
    rows.push(['안내', '도로명주소는 행정안전부 도로명주소 건물DB 기준입니다.'])
    if (info.meta && !info.meta.roadAvailable) rows.push(['안내', '도로명주소 자료가 아직 준비되지 않아 지번주소만 채웠습니다.'])
    if (info.meta && !info.meta.relatedIncluded) rows.push(['안내', '관련지번 건물은 포함하지 않았습니다(대표지번 건물만).'])
    const guide = XLSX.utils.aoa_to_sheet(rows)
    guide['!cols'] = [{ wch: 28 }, { wch: 90 }]
    XLSX.utils.book_append_sheet(wb, guide, sheetName)
    return wb
}

export function resultFileName(originalName: string): string {
    const base = originalName.replace(/\.(xlsx|xls)$/i, '').replace(/[\\/:*?"<>|]/g, '_')
    return `${base === '' ? '결과' : base}_주소.xlsx`
}

export function saveWorkbook(wb: XLSX.WorkBook, fileName: string): void {
    XLSX.writeFile(wb, fileName, { bookType: 'xlsx' })
}
