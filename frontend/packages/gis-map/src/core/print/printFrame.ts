// 지도 위 출력 틀: 위치·크기 계산(순수 함수)과 틀 DOM(gm-print-frame). 틀은 pointer-events:none이라 지도 조작을 막지 않는다.
// 스타일: styles/gis-map.css의 .gm-print-frame (attach CSS에도 실린다). 틀·리스너는 PrintController가 destroy에서 해제한다.
import type { FrameRect } from './composeMap'
import { framePxWidthForScale } from './scaleBar'

/** 지도 화면 안에 들어가는 최대 크기, 가운데. aspect = 가로÷세로, fill = 화면 대비 최대 비율 */
export function defaultFrameRect(mapW: number, mapH: number, aspect: number, fill = 0.88): FrameRect {
    if (!(mapW > 0) || !(mapH > 0) || !(aspect > 0)) return { x: 0, y: 0, w: 0, h: 0 }
    const w = Math.min(mapW * fill, mapH * fill * aspect)
    const h = w / aspect
    return { x: (mapW - w) / 2, y: (mapH - h) / 2, w, h }
}

export interface ScalePlanInput {
    denominator: number
    mapBoxWidthMm: number
    /** 틀 가로÷세로 */
    aspect: number
    mapW: number
    mapH: number
    /** 지금 줌에서 delta단계 바꿨을 때의 지상 해상도(m/px) */
    groundResForDelta(delta: number): number
    /** 바꿀 수 있는 줌 단계 범위(뷰의 min/max 줌 안) */
    minDelta: number
    maxDelta: number
}

export interface ScalePlan {
    /** 현재 줌에서 바꿀 줌 단계(0 = 그대로) */
    zoomDelta: number
    rect: FrameRect
    /** 화면 안에 들어갔는가(어느 줌에서도 못 들어가면 false — 가장 작은 틀을 돌려준다) */
    fits: boolean
}

/** 틀이 화면의 이 비율을 넘으면 줌아웃 */
export const SCALE_FRAME_MAX_RATIO = 0.9

/**
 * 축척 지정: 뷰가 정수 줌(constrainResolution)이라 해상도를 마음대로 못 바꾼다 → 줌 단계마다 틀 크기를 역산해
 * 화면(90%) 안에 들어가는 것 중 가장 큰 틀을 고른다(= 틀이 화면 90%를 넘으면 줌아웃, 너무 작으면 줌인하는 것과 같다)
 */
export function planScaleFrame(inp: ScalePlanInput): ScalePlan {
    let best: { delta: number; w: number } | null = null
    let smallest: { delta: number; w: number } | null = null
    for (let delta = inp.minDelta; delta <= inp.maxDelta; delta++) {
        const res = inp.groundResForDelta(delta)
        const w = framePxWidthForScale(inp.denominator, res, inp.mapBoxWidthMm)
        if (!(w > 0)) continue
        const h = w / inp.aspect
        const fits = w <= inp.mapW * SCALE_FRAME_MAX_RATIO + 1e-6 && h <= inp.mapH * SCALE_FRAME_MAX_RATIO + 1e-6
        if (fits && (!best || w > best.w || (w === best.w && Math.abs(delta) < Math.abs(best.delta)))) best = { delta, w }
        if (!smallest || w < smallest.w) smallest = { delta, w }
    }
    const pick = best ?? smallest
    if (!pick) return { zoomDelta: 0, rect: defaultFrameRect(inp.mapW, inp.mapH, inp.aspect), fits: false }
    const h = pick.w / inp.aspect
    return {
        zoomDelta: pick.delta,
        rect: { x: (inp.mapW - pick.w) / 2, y: (inp.mapH - h) / 2, w: pick.w, h },
        fits: best !== null,
    }
}

/** 지도 뷰포트 안에 붙는 틀 DOM. 위치·이름표만 갱신한다 */
export class PrintFrameView {
    private readonly el: HTMLDivElement
    private readonly labelEl: HTMLDivElement

    /** primary = 테두리·이름표 색(config.theme.primary — attach 호스트에는 CSS 변수가 없어 인라인으로 준다) */
    constructor(doc: Document, viewport: HTMLElement, primary: string) {
        this.el = doc.createElement('div')
        this.el.className = 'gm-print-frame'
        this.el.style.borderColor = primary
        this.labelEl = doc.createElement('div')
        this.labelEl.className = 'gm-print-frame__label'
        this.labelEl.style.backgroundColor = primary
        this.el.appendChild(this.labelEl)
        viewport.appendChild(this.el)
    }

    update(rect: FrameRect, label: string): void {
        const s = this.el.style
        s.left = rect.x + 'px'
        s.top = rect.y + 'px'
        s.width = rect.w + 'px'
        s.height = rect.h + 'px'
        this.labelEl.textContent = label
    }

    destroy(): void {
        if (this.el.parentNode) this.el.parentNode.removeChild(this.el)
    }
}
