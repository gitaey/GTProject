// 영역 분석 집계(순수 함수·누적기). 합계는 Neumaier 보정(수만 건을 더해도 오차가 쌓이지 않게).
// 숫자 읽기·범주 키는 나만의지도와 같은 규칙(readNumberDetail·categoryKey — 서버 컬럼 통계와 같다).
import { categoryKey, readNumberDetail } from '../lib/mymapStyleConfig'
import type { AreaAnalysisColumn, CategoryResult, NumericColumnStats } from './types'

/** Neumaier 보정 합계 */
export class NeumaierSum {
    private sum = 0
    private comp = 0

    add(x: number): void {
        const t = this.sum + x
        if (Math.abs(this.sum) >= Math.abs(x)) this.comp += this.sum - t + x
        else this.comp += x - t + this.sum
        this.sum = t
    }

    get value(): number {
        return this.sum + this.comp
    }
}

/** 값 → 숫자(숫자 형이면 그대로, 글자는 readNumberDetail 규칙). 못 읽으면 null */
export function toNumber(v: unknown): number | null {
    if (typeof v === 'number') return Number.isFinite(v) && Math.abs(v) < 1e15 ? v : null
    if (typeof v !== 'string') return null
    const r = readNumberDetail(v)
    return r.error === undefined ? r.value : null
}

/** 서로 다른 값을 세는 상한 */
export const DISTINCT_CAP = 2000
/** 범주 열 후보: 서로 다른 값이 이 범위(2~50)인 글자 열 */
export const CATEGORY_DISTINCT_MIN = 2
export const CATEGORY_DISTINCT_MAX = 50

interface ColAcc {
    filled: number
    numeric: number
    sum: NeumaierSum
    min: number
    max: number
    distinct: Set<string>
    capped: boolean
}

/** 피처의 속성 읽기(ol Feature가 구조적으로 맞는다) */
export interface PropReader {
    getKeys(): string[]
    get(key: string): unknown
}

/** 선택된 피처를 하나씩 받아 열별 통계를 쌓는다 */
export class ColumnAccumulator {
    private readonly cols = new Map<string, ColAcc>()
    private readonly skip: ReadonlySet<string>
    total = 0

    constructor(skipKeys: readonly string[]) {
        this.skip = new Set(skipKeys)
    }

    add(f: PropReader): void {
        this.total++
        const keys = f.getKeys()
        for (let i = 0; i < keys.length; i++) {
            const key = keys[i]
            if (this.skip.has(key)) continue
            let a = this.cols.get(key)
            if (!a) {
                a = { filled: 0, numeric: 0, sum: new NeumaierSum(), min: Infinity, max: -Infinity, distinct: new Set(), capped: false }
                this.cols.set(key, a)
            }
            const raw = f.get(key)
            const k = categoryKey(raw)
            if (k === null) continue
            a.filled++
            const n = toNumber(raw)
            if (n !== null) {
                a.numeric++
                a.sum.add(n)
                if (n < a.min) a.min = n
                if (n > a.max) a.max = n
            }
            if (!a.capped && !a.distinct.has(k)) {
                if (a.distinct.size >= DISTINCT_CAP) a.capped = true
                else a.distinct.add(k)
            }
        }
    }

    /** 열 목록(처음 나온 순서). 숫자 열 = 값이 있는 칸의 90% 이상(올림)이 숫자(서버·나만의지도 컬럼 통계와 같은 기준) */
    columns(labelOf?: (name: string) => string, sumHidden?: (name: string) => boolean): AreaAnalysisColumn[] {
        const out: AreaAnalysisColumn[] = []
        this.cols.forEach((a, name) => {
            const isNumber = a.filled > 0 && a.numeric >= Math.ceil(a.filled * 0.9)
            const col: AreaAnalysisColumn = { name, label: labelOf ? labelOf(name) : name, kind: isNumber ? 'number' : 'text' }
            if (isNumber && sumHidden?.(name)) col.sum = false
            out.push(col)
        })
        return out
    }

    numericStats(columns: readonly AreaAnalysisColumn[]): NumericColumnStats[] {
        const out: NumericColumnStats[] = []
        for (const c of columns) {
            if (c.kind !== 'number') continue
            const a = this.cols.get(c.name)
            if (!a || a.numeric === 0) continue
            const hidden = c.sum === false
            out.push({
                name: c.name, label: c.label, filled: a.filled, numeric: a.numeric, nonNumeric: a.filled - a.numeric,
                blank: this.total - a.filled, sum: hidden ? null : a.sum.value, sumHidden: hidden,
                mean: a.sum.value / a.numeric, min: a.min, max: a.max,
            })
        }
        return out
    }

    /** 서로 다른 값 수(상한까지). 모르는 열이면 0 */
    distinctOf(name: string): { count: number; capped: boolean } {
        const a = this.cols.get(name)
        return a ? { count: a.distinct.size, capped: a.capped } : { count: 0, capped: false }
    }
}

/** 기본 범주 열: 글자 열 중 서로 다른 값이 2~50개이고 값이 되풀이되는(서로 다른 값 수 < 선택 수) 첫 열. 없으면 null */
export function defaultCategoryColumn(columns: readonly AreaAnalysisColumn[], acc: ColumnAccumulator): string | null {
    for (const c of columns) {
        if (c.kind !== 'text') continue
        const d = acc.distinctOf(c.name)
        if (!d.capped && d.count >= CATEGORY_DISTINCT_MIN && d.count <= CATEGORY_DISTINCT_MAX && d.count < acc.total) return c.name
    }
    return null
}

/** 범주 집계에 필요한 레코드(선택된 피처 하나) */
export interface CategorizeRecord {
    feature: PropReader
    clipAreaM2: number | null
}

interface Group {
    count: number
    clip: NeumaierSum | null
}

/**
 * 범주 열 하나로 센다: 값별 개수·잘라낸 면적 합 → 개수 많은 순(같으면 처음 나온 순) 상위 top개 + 기타 + 빈 값.
 * 서로 다른 값이 DISTINCT_CAP을 넘으면 그 뒤 새 값은 기타로 묶는다(distinctCapped).
 */
export function categorize(records: readonly CategorizeRecord[], column: string, label: string, top: number): CategoryResult {
    const groups = new Map<string, Group>()
    const hasClip = records.some(r => r.clipAreaM2 !== null)
    let blankCount = 0
    const blankClip = hasClip ? new NeumaierSum() : null
    let overflowCount = 0
    const overflowClip = hasClip ? new NeumaierSum() : null
    let capped = false
    for (const r of records) {
        const k = categoryKey(r.feature.get(column))
        const clip = r.clipAreaM2
        if (k === null) {
            blankCount++
            if (blankClip && clip !== null) blankClip.add(clip)
            continue
        }
        let g = groups.get(k)
        if (!g) {
            if (groups.size >= DISTINCT_CAP) {
                capped = true
                overflowCount++
                if (overflowClip && clip !== null) overflowClip.add(clip)
                continue
            }
            g = { count: 0, clip: hasClip ? new NeumaierSum() : null }
            groups.set(k, g)
        }
        g.count++
        if (g.clip && clip !== null) g.clip.add(clip)
    }
    const sorted = Array.from(groups, ([value, g]) => ({ value, count: g.count, clip: g.clip }))
    sorted.sort((a, b) => b.count - a.count)
    const n = Math.max(0, Math.floor(top))
    const rows = sorted.slice(0, n).map(g => ({ value: g.value, count: g.count, clipAreaM2: g.clip ? g.clip.value : null }))
    const rest = sorted.slice(n)
    const otherClip = hasClip ? new NeumaierSum() : null
    let otherCount = overflowCount
    for (const g of rest) {
        otherCount += g.count
        if (otherClip && g.clip) otherClip.add(g.clip.value)
    }
    if (otherClip && overflowClip) otherClip.add(overflowClip.value)
    return {
        column, label, rows,
        other: { count: otherCount, clipAreaM2: otherClip ? otherClip.value : null, kinds: rest.length },
        blank: { count: blankCount, clipAreaM2: blankClip ? blankClip.value : null },
        distinctCapped: capped,
    }
}
