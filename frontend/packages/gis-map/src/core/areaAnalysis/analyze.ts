// 영역 분석 본체(순수 — ol 없이 시험 가능): 후보 피처들을 약 12ms씩 나눠 판정·면적·길이·열 통계를 쌓고 결과를 만든다.
// 피처는 getGeometry()/getKeys()/get()만 있으면 된다(ol Feature가 구조적으로 맞는다).
import { ColumnAccumulator, NeumaierSum, defaultCategoryColumn } from './aggregate'
import type { PropReader } from './aggregate'
import { clipPolygonAreaM2, lineLengthM, polygonAreaM2 } from './clip'
import type { ToLonLat } from './clip'
import { runChunked } from './runner'
import type { ChunkOptions } from './runner'
import { geomParts, partsKind, selectParts } from './spatial'
import type { AreaModel, GeomLike, SelectMode } from './spatial'
import type { AreaAnalysisColumn, NumericColumnStats } from './types'

export interface AnalysisFeature extends PropReader {
    getGeometry(): GeomLike | null | undefined
}

export interface Candidate<F extends AnalysisFeature = AnalysisFeature> {
    feature: F
    /** 레이어 안 피처 번호(속성 표 행 번호 − 1) */
    index: number
}

export interface SelectedRecord<F extends AnalysisFeature = AnalysisFeature> {
    feature: F
    index: number
    kind: 'polygon' | 'line' | 'point'
    areaM2: number | null
    clipAreaM2: number | null
    lengthM: number | null
}

export interface AnalyzeInput<F extends AnalysisFeature> {
    candidates: ReadonlyArray<Candidate<F>>
    area: AreaModel
    mode: SelectMode
    toLonLat: ToLonLat
    /** 속성이 아닌 키(지오메트리 이름) */
    skipKeys: readonly string[]
    /** 어댑터가 아는 열 정보(화면 이름·합계 숨김·파생 열). 받은 피처에 없는 열은 무시한다 */
    columnInfo?: readonly AreaAnalysisColumn[]
    chunk: ChunkOptions
}

export interface AnalyzeOutput<F extends AnalysisFeature> {
    records: Array<SelectedRecord<F>>
    byKind: { polygon: number; line: number; point: number; empty: number }
    sumAreaM2: number | null
    clipAreaM2: number | null
    sumLengthM: number | null
    columns: AreaAnalysisColumn[]
    numeric: NumericColumnStats[]
    defaultCategory: string | null
    /** 열 통계 누적기(범주 열 후보의 서로 다른 값 수) */
    acc: ColumnAccumulator
}

/** 후보를 판정해 선택된 것만 레코드로. 취소되면 null */
export async function analyzeCandidates<F extends AnalysisFeature>(input: AnalyzeInput<F>): Promise<AnalyzeOutput<F> | null> {
    const { candidates, area, mode, toLonLat } = input
    const records: Array<SelectedRecord<F>> = []
    const acc = new ColumnAccumulator(input.skipKeys)
    const byKind = { polygon: 0, line: 0, point: 0, empty: 0 }
    const sumArea = new NeumaierSum(), sumClip = new NeumaierSum(), sumLen = new NeumaierSum()
    let anyPoly = false, anyLine = false

    const completed = await runChunked(candidates.length, i => {
        const c = candidates[i]
        const parts = geomParts(c.feature.getGeometry())
        const kind = partsKind(parts)
        if (kind === 'empty' || !selectParts(parts, area, mode)) return
        let areaM2: number | null = null
        let clipAreaM2: number | null = null
        let lengthM: number | null = null
        if (parts.polygons.length > 0) {
            let a = 0, cl = 0
            for (const rings of parts.polygons) {
                const pa = polygonAreaM2(rings, toLonLat)
                a += pa
                cl += mode === 'within' ? pa : clipPolygonAreaM2(rings, area, toLonLat, pa)
            }
            anyPoly = true
            areaM2 = a
            clipAreaM2 = cl
            sumArea.add(a)
            sumClip.add(cl)
        }
        if (parts.lines.length > 0) {
            let len = 0
            for (const l of parts.lines) {
                const flat = new Array<number>(l.length * 2)
                for (let k = 0; k < l.length; k++) { flat[2 * k] = l[k][0]; flat[2 * k + 1] = l[k][1] }
                len += lineLengthM(toLonLat(flat))
            }
            anyLine = true
            lengthM = len
            sumLen.add(len)
        }
        byKind[kind]++
        acc.add(c.feature)
        records.push({ feature: c.feature, index: c.index, kind, areaM2, clipAreaM2, lengthM })
    }, input.chunk)
    if (!completed) return null

    const info = input.columnInfo
    const byName = info ? new Map(info.map(c => [c.name, c])) : null
    const columns = acc.columns(byName ? name => byName.get(name)?.label ?? name : undefined, byName ? name => byName.get(name)?.sum === false : undefined)
    if (byName) for (const c of columns) if (byName.get(c.name)?.derived) c.derived = true
    return {
        records, byKind,
        sumAreaM2: anyPoly ? sumArea.value : null,
        clipAreaM2: anyPoly ? sumClip.value : null,
        sumLengthM: anyLine ? sumLen.value : null,
        columns, numeric: acc.numericStats(columns), defaultCategory: defaultCategoryColumn(columns, acc), acc,
    }
}
