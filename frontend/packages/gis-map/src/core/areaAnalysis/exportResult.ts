// 영역 분석 결과 내보내기 글자 만들기(순수 함수). CSV = UTF-8 BOM(엑셀이 한글을 바로 읽음) + 수식 주입 방지.
import { toNumber } from './aggregate'

export const CSV_BOM = '﻿'

/** 엑셀이 수식으로 읽는 첫 글자 */
const FORMULA_START = /^[=+\-@\t\r]/

/**
 * CSV 칸 하나. 숫자는 그대로, 글자는 `= + - @ 탭 CR`로 시작하면(숫자로 읽히는 "-5" 같은 값은 제외) 앞에 작은따옴표를 붙여 수식 실행을 막는다.
 * 쉼표·따옴표·줄바꿈이 있으면 따옴표로 감싸고 안의 따옴표는 두 개로.
 */
export function csvCell(v: unknown): string {
    if (v === null || v === undefined) return ''
    let s: string
    if (typeof v === 'number') s = Number.isFinite(v) ? String(v) : ''
    else if (typeof v === 'boolean') s = v ? 'true' : 'false'
    else if (typeof v === 'string') s = v
    else {
        try { s = JSON.stringify(v) ?? '' } catch { s = String(v) }
    }
    if (typeof v !== 'number' && FORMULA_START.test(s) && toNumber(s) === null) s = "'" + s
    return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s
}

/** 머리 한 줄 + 행들 → CSV 글자(BOM 포함, 줄바꿈 CRLF) */
export function buildCsv(header: readonly string[], rows: ReadonlyArray<ReadonlyArray<unknown>>): string {
    const lines: string[] = [header.map(csvCell).join(',')]
    for (const r of rows) lines.push(r.map(csvCell).join(','))
    return CSV_BOM + lines.join('\r\n') + '\r\n'
}

/** ㎡ 값을 소수 2자리로(내보내기용) */
export function round2(n: number | null): number | null {
    return n === null ? null : Math.round(n * 100) / 100
}
