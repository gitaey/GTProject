// 범례 칸 배치(순수 기하, 단위 mm — 글자는 그리지 않는다). 칸을 넘으면 넘친 레이어 수만 "외 n개 레이어"로 쓴다.
import type { Box } from './paper'
import type { LegendEntry, LegendGroup, LegendSwatch } from './legendModel'

export type LegendPlacement =
    | { kind: 'title'; x: number; y: number; w: number; text: string }
    | { kind: 'entry'; x: number; y: number; w: number; label: string; swatch: LegendSwatch | null; swatchW: number; swatchH: number; rowH: number }
    | { kind: 'image'; x: number; y: number; w: number; label: string; labelH: number; image: HTMLImageElement; imgW: number; imgH: number }
    | { kind: 'more'; x: number; y: number; w: number; text: string }

export interface LegendLayoutResult {
    items: LegendPlacement[]
    /** 칸이 모자라 통째로 못 그린 레이어(묶음) 수 */
    hiddenGroups: number
    truncated: boolean
}

/** 이미지 범례를 96dpi로 보았을 때 mm */
const PX_TO_MM = 25.4 / 96

interface Metrics {
    rowH: number
    titleH: number
    gap: number
    swatchW: number
    swatchH: number
    imageMaxH: number
}

function metrics(k: number): Metrics {
    return { rowH: 4.4 * k, titleH: 4.8 * k, gap: 1.6 * k, swatchW: 5.6 * k, swatchH: 3.2 * k, imageMaxH: 36 * k }
}

function imageSize(entry: LegendEntry, colW: number, m: Metrics, k: number): { w: number; h: number } | null {
    const sw = entry.swatch
    if (!sw || sw.kind !== 'image') return null
    const nw = sw.image.naturalWidth || sw.image.width || 0
    const nh = sw.image.naturalHeight || sw.image.height || 0
    if (nw <= 0 || nh <= 0) return { w: 0, h: 0 }
    const w0 = nw * PX_TO_MM * k
    const h0 = nh * PX_TO_MM * k
    const s = Math.min(1, (colW - 1 * k) / w0, m.imageMaxH / h0)
    return { w: w0 * s, h: h0 * s }
}

function entryHeight(entry: LegendEntry, colW: number, m: Metrics, k: number): number {
    const img = imageSize(entry, colW, m, k)
    return img ? m.rowH + img.h + 0.6 * k : m.rowH
}

function groupHeight(g: LegendGroup, colW: number, m: Metrics, k: number): number {
    let h = g.title ? m.titleH : 0
    for (const e of g.entries) h += entryHeight(e, colW, m, k)
    if (g.more > 0) h += m.rowH
    return h
}

/** box = 범례 안쪽 칸(머리글 "범례"를 뺀 영역). columns = 단 수 */
export function layoutLegend(groups: readonly LegendGroup[], box: Box, k: number, columns: 1 | 2): LegendLayoutResult {
    const m = metrics(k)
    const colGap = 2 * k
    const colW = (box.w - (columns - 1) * colGap) / columns

    const attempt = (limit: number): LegendLayoutResult => {
        const items: LegendPlacement[] = []
        let col = 0
        let y = 0
        let hidden = 0
        const colX = (c: number): number => box.x + c * (colW + colGap)
        for (let i = 0; i < groups.length; i++) {
            const g = groups[i]
            const h = groupHeight(g, colW, m, k)
            if (y + h > limit + 1e-6 && y > 0 && col + 1 < columns) {
                col++
                y = 0
            }
            const fits = y + h <= limit + 1e-6
            if (!fits && items.length > 0) {
                hidden = groups.length - i
                break
            }
            const x = colX(col)
            let cy = box.y + y
            let cutMore = g.more
            if (g.title) {
                items.push({ kind: 'title', x, y: cy, w: colW, text: g.title })
                cy += m.titleH
            }
            for (let ei = 0; ei < g.entries.length; ei++) {
                const e = g.entries[ei]
                const eh = entryHeight(e, colW, m, k)
                // 맨 처음 묶음이 혼자 칸보다 크면 들어가는 만큼만 그리고 나머지는 "외 n개"로 센다
                if (!fits && cy - box.y + eh > limit + 1e-6) {
                    cutMore += g.entries.length - ei
                    break
                }
                const img = imageSize(e, colW, m, k)
                if (img && e.swatch && e.swatch.kind === 'image') {
                    items.push({ kind: 'image', x, y: cy, w: colW, label: e.label, labelH: m.rowH, image: e.swatch.image, imgW: img.w, imgH: img.h })
                } else {
                    items.push({ kind: 'entry', x, y: cy, w: colW, label: e.label, swatch: e.swatch, swatchW: m.swatchW, swatchH: m.swatchH, rowH: m.rowH })
                }
                cy += eh
            }
            if (cutMore > 0) items.push({ kind: 'more', x, y: cy, w: colW, text: '외 ' + cutMore + '개' })
            y = cy - box.y + m.gap
        }
        if (hidden > 0) {
            // 마지막 단의 끝에 "외 n개 레이어"를 둔다(칸 맨 아래 한 줄은 아래에서 미리 비워 둔다)
            const lastX = colX(col)
            const lastY = Math.min(y, box.h - m.rowH)
            items.push({ kind: 'more', x: lastX, y: box.y + Math.max(0, lastY), w: colW, text: '외 ' + hidden + '개 레이어' })
        }
        return { items, hiddenGroups: hidden, truncated: hidden > 0 }
    }

    const full = attempt(box.h)
    if (!full.truncated) return full
    return attempt(Math.max(0, box.h - m.rowH))
}
