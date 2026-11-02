// 지도 합성: 지도 뷰포트의 `.ol-layers` 아래 모든 canvas를 틀 영역만큼 한 캔버스에 겹쳐 그린다(ol 7.1~10.x 공통 — OL 공식 "지도 내보내기" 방식).
//   · `.ol-layer canvas` 선택자는 쓰지 않는다 — attach 호스트가 레이어 className을 바꾸면 빠진다.
//   · 합성 캔버스는 틀 CSS 크기 × devicePixelRatio. 틀 원점을 빼서 처음부터 잘라 그린다(전체 합성 캔버스 없음).
//   · HTML 오버레이는 안 찍힌다 → 측정 툴팁만 drawMeasureTooltips로 다시 그린다.
import type OlMap from 'ol/Map'

/** 틀 사각형. 단위 CSS px, 원점 = 지도 뷰포트 왼쪽 위 */
export interface FrameRect {
    x: number
    y: number
    w: number
    h: number
}

export type Matrix6 = [number, number, number, number, number, number]

/** 'matrix(a, b, c, d, e, f)' → 숫자 6개. 다른 모양(none·translate·matrix3d)이면 null */
export function parseMatrix(transform: string): Matrix6 | null {
    const m = /^matrix\(([^()]*)\)$/.exec(transform.trim())
    if (!m) return null
    const nums = m[1].split(',').map(s => Number(s.trim()))
    if (nums.length !== 6 || nums.some(n => !Number.isFinite(n))) return null
    return nums as Matrix6
}

/** 레이어 canvas의 "캔버스 픽셀 → 뷰포트 CSS px" 변환. style.transform이 matrix면 그것, 아니면 뷰포트 크기 ÷ 캔버스 크기 */
export function layerCanvasMatrix(canvas: HTMLCanvasElement, viewportCssSize: readonly [number, number]): Matrix6 {
    const parsed = parseMatrix(canvas.style.transform || '')
    if (parsed) return parsed
    const sx = canvas.width > 0 ? viewportCssSize[0] / canvas.width : 1
    const sy = canvas.height > 0 ? viewportCssSize[1] / canvas.height : 1
    return [sx, 0, 0, sy, 0, 0]
}

/** 합성 대상 canvas(그리는 순서 = DOM 순서). `.ol-layers`가 없으면 뷰포트 전체에서 찾는다 */
export function listLayerCanvases(viewport: HTMLElement): HTMLCanvasElement[] {
    const root = viewport.querySelector('.ol-layers') ?? viewport
    const all = Array.from(root.querySelectorAll('canvas')) as HTMLCanvasElement[]
    return all.filter(c => c.width > 0 && c.height > 0)
}

function layerOpacity(canvas: HTMLCanvasElement): number {
    const parent = canvas.parentElement
    const raw = (parent && parent.style.opacity) || canvas.style.opacity
    if (raw === '' || raw === undefined || raw === null) return 1
    const n = Number(raw)
    return Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 1
}

/** 부모(.ol-layer)가 숨겨져 있는가 */
function layerHidden(canvas: HTMLCanvasElement): boolean {
    const parent = canvas.parentElement
    return !!parent && parent.style.display === 'none'
}

export interface ComposeOptions {
    viewport: HTMLElement
    /** 뷰포트 CSS 크기(olMap.getSize()) */
    size: readonly [number, number]
    frame: FrameRect
    /** 합성 해상도 배율(기기 픽셀 비율) */
    dpr: number
    createCanvas(width: number, height: number): HTMLCanvasElement
}

export interface ComposeResult {
    canvas: HTMLCanvasElement
    ctx: CanvasRenderingContext2D
    /** 틀 크기 × dpr 로 만든 캔버스 픽셀 수 */
    width: number
    height: number
}

export function composeMapCrop(opts: ComposeOptions): ComposeResult {
    const { frame, dpr } = opts
    const width = Math.max(1, Math.round(frame.w * dpr))
    const height = Math.max(1, Math.round(frame.h * dpr))
    const canvas = opts.createCanvas(width, height)
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('[gis-map] 2D 캔버스를 만들 수 없다')
    for (const layer of listLayerCanvases(opts.viewport)) {
        if (layerHidden(layer)) continue
        const m = layerCanvasMatrix(layer, opts.size)
        ctx.globalAlpha = layerOpacity(layer)
        // 캔버스 픽셀 → (레이어 변환) → 뷰포트 CSS px → 틀 원점 빼기 → × dpr
        ctx.setTransform(dpr * m[0], dpr * m[1], dpr * m[2], dpr * m[3], dpr * (m[4] - frame.x), dpr * (m[5] - frame.y))
        const bg = layer.parentElement ? layer.parentElement.style.backgroundColor : ''
        if (bg) {
            ctx.fillStyle = bg
            ctx.fillRect(0, 0, layer.width, layer.height)
        }
        ctx.drawImage(layer, 0, 0)
    }
    ctx.globalAlpha = 1
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    return { canvas, ctx, width, height }
}

/** 캔버스가 오염(tainted)됐는가 — 다른 출처 그림이 섞이면 getImageData가 SecurityError를 낸다 */
export function isCanvasTainted(ctx: CanvasRenderingContext2D): boolean {
    try {
        ctx.getImageData(0, 0, 1, 1)
        return false
    } catch {
        return true
    }
}

// ── 측정 툴팁 다시 그리기 ───────────────────────────────────────────────────

export interface TooltipBox {
    text: string
    /** 틀 안 CSS px — 상자 아래 가운데(말풍선 꼬리 자리) */
    x: number
    y: number
}

/** 툴팁 오버레이 요소에서 값 글자 한 줄 꺼내기(닫기 단추·안내문 제외). 없으면 null */
export function measureTooltipText(el: HTMLElement | null | undefined): string | null {
    if (!el) return null
    const span = el.querySelector('.gm-measure-tooltip__row span')
    const text = span ? (span.textContent ?? '').trim() : ''
    return text === '' ? null : text
}

/**
 * 지도에 떠 있는 측정 툴팁(엔진이 만든 gm-measure-tooltip 오버레이)의 값과 화면 위치를 모은다.
 * 위치 = 오버레이 좌표 → 픽셀 − 틀 원점 − 위쪽 간격 10px(툴팁 offset [0,-10]과 같다). 틀 밖이면 뺀다
 */
export function collectMeasureTooltips(olMap: OlMap, frame: FrameRect): TooltipBox[] {
    const out: TooltipBox[] = []
    for (const overlay of olMap.getOverlays().getArray()) {
        const text = measureTooltipText(overlay.getElement() as HTMLElement | undefined)
        const pos = overlay.getPosition()
        if (!text || !pos) continue
        const px = olMap.getPixelFromCoordinate(pos)
        if (!px) continue
        const x = px[0] - frame.x
        const y = px[1] - frame.y - 10
        if (x < 0 || y < 0 || x > frame.w || y > frame.h + 10) continue
        out.push({ text, x, y })
    }
    return out
}

/** 화면 툴팁과 같은 모양(검은 반투명 상자 + 흰 글자, .75rem)으로 합성 캔버스에 그린다. 좌표는 CSS px(ctx는 dpr만 곱해 둔다) */
export function drawMeasureTooltips(ctx: CanvasRenderingContext2D, boxes: readonly TooltipBox[], dpr: number, fontFamily: string): void {
    if (boxes.length === 0) return
    ctx.save()
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.font = `12px ${fontFamily}`
    ctx.textBaseline = 'middle'
    ctx.textAlign = 'center'
    for (const b of boxes) {
        const textW = ctx.measureText(b.text).width
        const w = textW + 20
        const h = 24
        const left = b.x - w / 2
        const top = b.y - h
        ctx.fillStyle = 'rgba(0,0,0,0.6)'
        roundRect(ctx, left, top, w, h, 4)
        ctx.fill()
        ctx.fillStyle = '#fff'
        ctx.fillText(b.text, b.x, top + h / 2 + 0.5)
    }
    ctx.restore()
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
    ctx.beginPath()
    ctx.moveTo(x + r, y)
    ctx.lineTo(x + w - r, y)
    ctx.arcTo(x + w, y, x + w, y + r, r)
    ctx.lineTo(x + w, y + h - r)
    ctx.arcTo(x + w, y + h, x + w - r, y + h, r)
    ctx.lineTo(x + r, y + h)
    ctx.arcTo(x, y + h, x, y + h - r, r)
    ctx.lineTo(x, y + r)
    ctx.arcTo(x, y, x + r, y, r)
    ctx.closePath()
}
