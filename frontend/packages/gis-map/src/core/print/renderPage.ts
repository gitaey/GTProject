// 페이지 캔버스에 출력물을 그린다: 머리줄(제목·부제·로고·기관명) · 지도 · 범례 · 방위표 · 축척 막대 · 바닥줄(출처·출력일).
// 모든 좌표는 mm(ctx.scale(px/mm)), 글자 크기도 mm(k = A4 기준 배율). 글자는 시스템 글꼴 — PDF에서는 그림이 된다.
import { layoutLegend } from './legendLayout'
import type { LegendGroup, LegendSwatch } from './legendModel'
import type { PrintLayout } from './paper'
import { formatScaleRatio, planScaleBar } from './scaleBar'
import type { PrintElements, PrintWarning } from './types'

export interface PageContent {
    layout: PrintLayout
    /** 틀 안을 잘라 낸 지도 그림 */
    mapCanvas: HTMLCanvasElement
    title: string
    subtitle: string
    show: PrintElements
    groups: readonly LegendGroup[]
    /** 용지 축척 분모(지도 중심 기준). 0이면 모름 → 축척 막대를 그리지 않는다 */
    denominator: number
    /** 용지 1mm = 지상 m */
    groundMetersPerMm: number
    /** 뷰 회전(rad, 시계 방향이 +) */
    rotation: number
    dateText: string
    attributions: readonly string[]
    organization?: string
    logo: HTMLImageElement | null
    /** 'A4' | 'A3' — 축척 글자 옆 표기 */
    paperName: string
    primary: string
    fontFamily: string
}

/** 'YYYY-MM-DD HH:mm'(지역 시각) */
export function formatPrintDate(d: Date): string {
    const p = (n: number): string => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

/** maxW를 넘으면 끝을 '…'로 줄인다. measure = 글자 폭 재는 함수 */
export function fitTextWith(measure: (s: string) => number, text: string, maxW: number): string {
    if (maxW <= 0) return ''
    if (measure(text) <= maxW) return text
    const ell = '…'
    let lo = 0
    let hi = text.length
    while (lo < hi) {
        const mid = Math.ceil((lo + hi) / 2)
        if (measure(text.slice(0, mid) + ell) <= maxW) lo = mid
        else hi = mid - 1
    }
    return lo === 0 ? ell : text.slice(0, lo) + ell
}

export interface RenderPageResult {
    warnings: PrintWarning[]
}

export function renderPage(canvas: HTMLCanvasElement, c: PageContent): RenderPageResult {
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('[gis-map] 2D 캔버스를 만들 수 없다')
    const { layout } = c
    const k = layout.k
    const warnings: PrintWarning[] = []
    const font = (weight: 'normal' | 'bold', sizeMm: number): void => {
        ctx.font = `${weight} ${sizeMm}px ${c.fontFamily}`
    }
    const fit = (text: string, maxW: number): string => fitTextWith(s => ctx.measureText(s).width, text, maxW)

    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    const pxPerMm = canvas.width / layout.widthMm
    ctx.setTransform(pxPerMm, 0, 0, pxPerMm, 0, 0)
    ctx.textBaseline = 'alphabetic'
    ctx.textAlign = 'left'

    drawHeader(ctx, c, k, font, fit)
    drawMap(ctx, c, k)
    if (c.show.legend && c.groups.length > 0) drawLegend(ctx, c, k, font, fit, warnings)
    if (c.show.northArrow) drawNorth(ctx, c, k, font)
    if (c.show.scaleBar) drawScale(ctx, c, k, font, fit)
    drawFooter(ctx, c, k, font, fit)

    ctx.setTransform(1, 0, 0, 1, 0, 0)
    return { warnings }
}

type FontFn = (weight: 'normal' | 'bold', sizeMm: number) => void
type FitFn = (text: string, maxW: number) => string

function drawHeader(ctx: CanvasRenderingContext2D, c: PageContent, k: number, font: FontFn, fit: FitFn): void {
    const h = c.layout.header
    // 오른쪽: 로고 + 기관명
    let rightEdge = h.x + h.w
    if (c.show.logo) {
        if (c.organization) {
            font('bold', 3.6 * k)
            const w = ctx.measureText(c.organization).width
            ctx.fillStyle = '#333333'
            ctx.textAlign = 'right'
            ctx.fillText(c.organization, rightEdge, h.y + h.h - 4.5 * k)
            ctx.textAlign = 'left'
            rightEdge -= w + 2 * k
        }
        if (c.logo && c.logo.width > 0 && c.logo.height > 0) {
            const lh = 10 * k
            const lw = Math.min(30 * k, (c.logo.width / c.logo.height) * lh)
            ctx.drawImage(c.logo, rightEdge - lw, h.y + h.h - 4 * k - lh, lw, lh)
            rightEdge -= lw + 2 * k
        }
    }
    const maxW = Math.max(0, rightEdge - h.x - 2 * k)
    const hasTitle = c.title !== ''
    const hasSub = c.subtitle !== ''
    if (hasTitle) {
        font('bold', 6.3 * k)
        ctx.fillStyle = '#111111'
        ctx.fillText(fit(c.title, maxW), h.x, h.y + (hasSub ? 7.2 : 9.5) * k)
    }
    if (hasSub) {
        font('normal', 3.3 * k)
        ctx.fillStyle = '#555555'
        ctx.fillText(fit(c.subtitle, maxW), h.x, h.y + (hasTitle ? 12 : 9.5) * k)
    }
    // 아래 주 색 선
    ctx.fillStyle = c.primary
    ctx.fillRect(h.x, h.y + h.h - 0.6 * k, h.w, 0.6 * k)
}

function drawMap(ctx: CanvasRenderingContext2D, c: PageContent, k: number): void {
    const m = c.layout.map
    ctx.drawImage(c.mapCanvas, m.x, m.y, m.w, m.h)
    ctx.strokeStyle = '#333333'
    ctx.lineWidth = 0.3 * k
    ctx.strokeRect(m.x, m.y, m.w, m.h)
}

function drawSwatch(ctx: CanvasRenderingContext2D, sw: LegendSwatch, x: number, y: number, w: number, h: number, k: number): void {
    if (sw.kind === 'point') {
        ctx.beginPath()
        ctx.arc(x + w / 2, y + h / 2, Math.min(w, h) * 0.42, 0, Math.PI * 2)
        ctx.fillStyle = sw.fill
        ctx.fill()
        ctx.strokeStyle = sw.stroke
        ctx.lineWidth = 0.3 * k
        ctx.stroke()
    } else if (sw.kind === 'polygon') {
        ctx.fillStyle = sw.fill
        ctx.fillRect(x, y, w, h)
        ctx.strokeStyle = sw.stroke
        ctx.lineWidth = 0.35 * k
        ctx.strokeRect(x, y, w, h)
    }
}

function drawLegend(ctx: CanvasRenderingContext2D, c: PageContent, k: number, font: FontFn, fit: FitFn, warnings: PrintWarning[]): void {
    const b = c.layout.legend
    const pad = 2 * k
    ctx.strokeStyle = '#bbbbbb'
    ctx.lineWidth = 0.25 * k
    ctx.strokeRect(b.x, b.y, b.w, b.h)
    font('bold', 3.3 * k)
    ctx.fillStyle = '#111111'
    ctx.fillText('범례', b.x + pad, b.y + 4.6 * k)
    ctx.fillStyle = '#dddddd'
    ctx.fillRect(b.x + pad, b.y + 6 * k, b.w - 2 * pad, 0.25 * k)
    const inner = { x: b.x + pad, y: b.y + 7.4 * k, w: b.w - 2 * pad, h: b.h - 7.4 * k - pad }
    const result = layoutLegend(c.groups, inner, k, c.layout.orientation === 'portrait' ? 2 : 1)
    if (result.truncated) {
        warnings.push({ code: 'LEGEND_TRUNCATED', message: '범례가 칸을 넘어 ' + result.hiddenGroups + '개 레이어를 뺐습니다.' })
    }
    ctx.save()
    ctx.beginPath()
    ctx.rect(b.x, b.y, b.w, b.h)
    ctx.clip()
    for (const it of result.items) {
        if (it.kind === 'title') {
            font('bold', 2.9 * k)
            ctx.fillStyle = '#111111'
            ctx.fillText(fit(it.text, it.w), it.x, it.y + 3.3 * k)
        } else if (it.kind === 'entry') {
            const labelX = it.swatch ? it.x + it.swatchW + 1.6 * k : it.x
            if (it.swatch) drawSwatch(ctx, it.swatch, it.x, it.y + (it.rowH - it.swatchH) / 2, it.swatchW, it.swatchH, k)
            font('normal', 2.8 * k)
            ctx.fillStyle = '#222222'
            ctx.fillText(fit(it.label, it.x + it.w - labelX), labelX, it.y + 3.1 * k)
        } else if (it.kind === 'image') {
            font('bold', 2.9 * k)
            ctx.fillStyle = '#111111'
            ctx.fillText(fit(it.label, it.w), it.x, it.y + 3.2 * k)
            if (it.imgW > 0 && it.imgH > 0) ctx.drawImage(it.image, it.x, it.y + it.labelH, it.imgW, it.imgH)
        } else {
            font('normal', 2.6 * k)
            ctx.fillStyle = '#777777'
            ctx.fillText(fit(it.text, it.w), it.x, it.y + 3 * k)
        }
    }
    ctx.restore()
}

function drawNorth(ctx: CanvasRenderingContext2D, c: PageContent, k: number, font: FontFn): void {
    const b = c.layout.north
    const s = Math.min(b.h * 0.34, b.w * 0.3)
    const cx = b.x + b.w / 2
    const cy = b.y + b.h / 2 + 1.5 * k
    ctx.save()
    ctx.translate(cx, cy)
    ctx.rotate(c.rotation)
    ctx.lineWidth = 0.3 * k
    ctx.strokeStyle = '#111111'
    // 왼쪽 반 검정, 오른쪽 반 흰색 화살표
    ctx.beginPath()
    ctx.moveTo(0, -s)
    ctx.lineTo(-s * 0.5, s * 0.8)
    ctx.lineTo(0, s * 0.35)
    ctx.closePath()
    ctx.fillStyle = '#111111'
    ctx.fill()
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(0, -s)
    ctx.lineTo(s * 0.5, s * 0.8)
    ctx.lineTo(0, s * 0.35)
    ctx.closePath()
    ctx.fillStyle = '#ffffff'
    ctx.fill()
    ctx.stroke()
    font('bold', 3.6 * k)
    ctx.fillStyle = '#111111'
    ctx.textAlign = 'center'
    ctx.fillText('N', 0, -s - 1.2 * k)
    ctx.restore()
}

function drawScale(ctx: CanvasRenderingContext2D, c: PageContent, k: number, font: FontFn, fit: FitFn): void {
    if (!(c.denominator > 0) || !(c.groundMetersPerMm > 0)) return
    const b = c.layout.scale
    const x0 = b.x + 1 * k
    const maxBar = b.w - 6 * k
    font('bold', 3.6 * k)
    ctx.fillStyle = '#111111'
    ctx.fillText(fit('축척 ' + formatScaleRatio(c.denominator), b.w), x0, b.y + 4.2 * k)
    const plan = planScaleBar(c.groundMetersPerMm, maxBar)
    if (plan) {
        const barY = b.y + 8.2 * k
        const barH = 1.8 * k
        const segW = plan.lengthMm / plan.segments
        ctx.strokeStyle = '#111111'
        ctx.lineWidth = 0.25 * k
        for (let i = 0; i < plan.segments; i++) {
            ctx.fillStyle = i % 2 === 0 ? '#111111' : '#ffffff'
            ctx.fillRect(x0 + i * segW, barY, segW, barH)
        }
        ctx.strokeRect(x0, barY, plan.lengthMm, barH)
        font('normal', 2.5 * k)
        ctx.fillStyle = '#111111'
        ctx.textAlign = 'center'
        ctx.fillText(plan.labels[0], x0, barY + barH + 3 * k)
        ctx.fillText(plan.labels[1], x0 + plan.lengthMm / 2, barY + barH + 3 * k)
        ctx.fillText(plan.labels[2], x0 + plan.lengthMm, barY + barH + 3 * k)
        ctx.textAlign = 'left'
    }
    font('normal', 2.4 * k)
    ctx.fillStyle = '#666666'
    ctx.fillText(fit('(' + c.paperName + ' 기준, 중심 기준)', b.w), x0, b.y + b.h - 1.2 * k)
}

function drawFooter(ctx: CanvasRenderingContext2D, c: PageContent, k: number, font: FontFn, fit: FitFn): void {
    const f = c.layout.footer
    ctx.fillStyle = '#cccccc'
    ctx.fillRect(f.x, f.y, f.w, 0.2 * k)
    font('normal', 2.9 * k)
    ctx.fillStyle = '#444444'
    let rightW = 0
    if (c.show.date && c.dateText) {
        const text = '출력일 ' + c.dateText
        rightW = ctx.measureText(text).width
        ctx.textAlign = 'right'
        ctx.fillText(text, f.x + f.w, f.y + 4.4 * k)
        ctx.textAlign = 'left'
    }
    if (c.show.attribution && c.attributions.length > 0) {
        ctx.fillText(fit(c.attributions.join(' · '), f.w - rightW - 4 * k), f.x, f.y + 4.4 * k)
    }
}
