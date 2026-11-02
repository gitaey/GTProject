// 용지 크기(mm)와 출력물 레이아웃 상자(mm). 전부 얼린 상수·순수 함수 — DOM 없음.
// 레이아웃은 A4 기준 크기를 정해 두고 A3는 같은 모양을 비례(k)로 키운다. 세로는 지도 아래에 띠(범례 | 방위·축척 막대)를 둔다.
import type { PrintOrientation, PrintPaperSize } from './types'

export interface PaperSizeMm {
    widthMm: number
    heightMm: number
}

/** 용지 세로 방향(portrait) 기준 크기 */
export const PAPER_PORTRAIT_MM: Readonly<Record<PrintPaperSize, Readonly<{ width: number; height: number }>>> = Object.freeze({
    A4: Object.freeze({ width: 210, height: 297 }),
    A3: Object.freeze({ width: 297, height: 420 }),
})

export function paperSizeMm(paper: PrintPaperSize, orientation: PrintOrientation): PaperSizeMm {
    const p = PAPER_PORTRAIT_MM[paper]
    return orientation === 'landscape' ? { widthMm: p.height, heightMm: p.width } : { widthMm: p.width, heightMm: p.height }
}

export interface Box {
    x: number
    y: number
    w: number
    h: number
}

export interface PrintLayout {
    widthMm: number
    heightMm: number
    orientation: PrintOrientation
    /** A4 기준 대비 비율(글자·선 두께에 곱한다) */
    k: number
    margin: number
    header: Box
    /** 잘라 낸 지도 그림이 들어가는 칸 */
    map: Box
    legend: Box
    north: Box
    scale: Box
    footer: Box
    /** 지도 칸의 가로÷세로 — 화면 틀의 비율 */
    mapAspect: number
}

/** A4 기준(mm). 가로 297×210, 세로 210×297 */
const BASE_LANDSCAPE = Object.freeze({
    width: 297, height: 210,
    header: Object.freeze({ x: 10, y: 10, w: 277, h: 16 }),
    map: Object.freeze({ x: 10, y: 30, w: 220, h: 160 }),
    legend: Object.freeze({ x: 240, y: 30, w: 47, h: 92 }),
    north: Object.freeze({ x: 240, y: 126, w: 47, h: 30 }),
    scale: Object.freeze({ x: 240, y: 160, w: 47, h: 30 }),
    footer: Object.freeze({ x: 10, y: 194, w: 277, h: 6 }),
})
const BASE_PORTRAIT = Object.freeze({
    width: 210, height: 297,
    header: Object.freeze({ x: 10, y: 10, w: 190, h: 16 }),
    map: Object.freeze({ x: 10, y: 30, w: 190, h: 195 }),
    legend: Object.freeze({ x: 10, y: 229, w: 134, h: 48 }),
    north: Object.freeze({ x: 148, y: 229, w: 52, h: 22 }),
    scale: Object.freeze({ x: 148, y: 255, w: 52, h: 22 }),
    footer: Object.freeze({ x: 10, y: 281, w: 190, h: 6 }),
})

function scaleBox(b: Readonly<Box>, k: number): Box {
    return { x: b.x * k, y: b.y * k, w: b.w * k, h: b.h * k }
}

export function computeLayout(paper: PrintPaperSize, orientation: PrintOrientation): PrintLayout {
    const { widthMm, heightMm } = paperSizeMm(paper, orientation)
    const base = orientation === 'landscape' ? BASE_LANDSCAPE : BASE_PORTRAIT
    const k = Math.min(widthMm / base.width, heightMm / base.height)
    return {
        widthMm, heightMm, orientation, k, margin: 10 * k,
        header: scaleBox(base.header, k),
        map: scaleBox(base.map, k),
        legend: scaleBox(base.legend, k),
        north: scaleBox(base.north, k),
        scale: scaleBox(base.scale, k),
        footer: scaleBox(base.footer, k),
        mapAspect: base.map.w / base.map.h,
    }
}

/** 용지 이름표: 'A4 가로' */
export function paperLabel(paper: PrintPaperSize, orientation: PrintOrientation): string {
    return paper + (orientation === 'landscape' ? ' 가로' : ' 세로')
}

/** mm → 픽셀(dpi). 최소 1 */
export function mmToPx(mm: number, dpi: number): number {
    return Math.max(1, Math.round((mm * dpi) / 25.4))
}

/** 페이지 캔버스 최대 픽셀 수(A3 200dpi = 3307×2339 ≈ 7.73M). 넘으면 TOO_LARGE */
export const MAX_PAGE_PIXELS = 8_000_000
export const MIN_DPI = 72
export const MAX_DPI = 200

export function clampDpi(dpi: number | undefined, fallback: number): number {
    const v = typeof dpi === 'number' && Number.isFinite(dpi) ? dpi : fallback
    return Math.min(MAX_DPI, Math.max(MIN_DPI, Math.round(v)))
}
