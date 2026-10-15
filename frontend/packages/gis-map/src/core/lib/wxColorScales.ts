// 스칼라 변수(기온·습도·강수량) 색상 오버레이의 표시 규칙 — 한 곳에서 정의한다. 범례(ui)·오버레이 이미지(core)·마우스 표시가 같은 값을 읽는다. React·ol·DOM 없음.
//   · 색은 정지점(value → #rrggbb) 사이를 선형 보간한다. 막대 위의 위치는 선형(기온·습도)이거나 로그(강수량 — 비 약한 쪽을 넓게)
//   · 이미지는 팔레트 PNG라 값을 levels 단계로 나눈다(최대 255색). 범위 밖 값은 양 끝 색, 자료 없음(NaN)·transparentBelow 미만은 투명
import type { WindScalarVar } from '../types/wind'

export interface WxColorStop {
    value: number
    /** '#rrggbb' */
    color: string
}

export interface WxColorScale {
    readonly key: WindScalarVar
    /** 마우스·안내 글에 쓰는 이름: '기온' */
    readonly label: string
    /** '℃' · '%' · 'mm' */
    readonly unit: string
    /** select·범례 제목: '기온 (℃)' */
    readonly legendTitle: string
    /** 마우스 표시 소수 자릿수 */
    readonly decimals: number
    readonly min: number
    readonly max: number
    readonly stops: readonly WxColorStop[]
    /** 범례 눈금(값) */
    readonly ticks: readonly number[]
    /** 막대 위 위치를 로그(log10)로 둔다 — min은 0보다 커야 한다 */
    readonly log: boolean
    /** 팔레트 단계 수(2~255) */
    readonly levels: number
    /** 이 값 미만은 투명(비 없음). 없으면 자료 없음만 투명 */
    readonly transparentBelow?: number
}

const freezeStops = (stops: WxColorStop[]): readonly WxColorStop[] => Object.freeze(stops.map(s => Object.freeze({ ...s })))

export const WX_COLOR_SCALES: Readonly<Record<WindScalarVar, WxColorScale>> = Object.freeze({
    temp: Object.freeze({
        key: 'temp', label: '기온', unit: '℃', legendTitle: '기온 (℃)', decimals: 1, min: -20, max: 40, log: false, levels: 121,
        stops: freezeStops([
            { value: -20, color: '#3b4cc0' }, { value: -10, color: '#6788ee' }, { value: 0, color: '#9abbff' }, { value: 10, color: '#e8e4c8' },
            { value: 20, color: '#f4a582' }, { value: 30, color: '#d6604d' }, { value: 40, color: '#8b0a26' },
        ]),
        ticks: Object.freeze([-20, -10, 0, 10, 20, 30, 40]),
    }),
    humi: Object.freeze({
        key: 'humi', label: '습도', unit: '%', legendTitle: '습도 (%)', decimals: 0, min: 0, max: 100, log: false, levels: 101,
        stops: freezeStops([
            { value: 0, color: '#f6e8c3' }, { value: 40, color: '#c7eae5' }, { value: 70, color: '#5ab4ac' }, { value: 100, color: '#01665e' },
        ]),
        ticks: Object.freeze([0, 20, 40, 60, 80, 100]),
    }),
    rain: Object.freeze({
        key: 'rain', label: '강수량', unit: 'mm', legendTitle: '강수량 (mm)', decimals: 1, min: 0.1, max: 50, log: true, levels: 100, transparentBelow: 0.1,
        stops: freezeStops([
            { value: 0.1, color: '#c6dbef' }, { value: 1, color: '#6baed6' }, { value: 5, color: '#2171b5' }, { value: 10, color: '#08306b' },
            { value: 20, color: '#6a51a3' }, { value: 50, color: '#d7301f' },
        ]),
        ticks: Object.freeze([0.1, 1, 5, 10, 20, 50]),
    }),
})

/** 오버레이로 고를 수 있는 스칼라 변수 순서(select 순서) */
export const WX_SCALAR_VARS: readonly WindScalarVar[] = Object.freeze(['temp', 'humi', 'rain'] as WindScalarVar[])

export function isWindScalarVar(value: unknown): value is WindScalarVar {
    return value === 'temp' || value === 'humi' || value === 'rain'
}

/** 값의 막대 위 위치(0~1, 범위 밖은 양 끝). 로그 막대는 0 이하를 0으로 본다 */
export function wxScalePosition(scale: WxColorScale, value: number): number {
    if (!Number.isFinite(value)) return 0
    let t: number
    if (scale.log) {
        if (value <= 0) return 0
        t = (Math.log10(value) - Math.log10(scale.min)) / (Math.log10(scale.max) - Math.log10(scale.min))
    } else {
        t = (value - scale.min) / (scale.max - scale.min)
    }
    return Math.min(1, Math.max(0, t))
}

/** 값 → 팔레트 번호(0 ~ levels-1). 자료 없음(NaN)·transparentBelow 미만이면 -1(투명) */
export function wxScaleIndex(scale: WxColorScale, value: number): number {
    if (!Number.isFinite(value)) return -1
    if (scale.transparentBelow !== undefined && value < scale.transparentBelow) return -1
    return Math.round(wxScalePosition(scale, value) * (scale.levels - 1))
}

function hex(color: string): [number, number, number] {
    return [parseInt(color.slice(1, 3), 16), parseInt(color.slice(3, 5), 16), parseInt(color.slice(5, 7), 16)]
}

/** 막대 위 위치(0~1)의 색 — 정지점 사이 선형 보간 */
export function wxScaleColorAt(scale: WxColorScale, t: number): [number, number, number] {
    const stops = scale.stops
    const pos = stops.map(s => wxScalePosition(scale, s.value))
    const x = Math.min(1, Math.max(0, t))
    if (x <= pos[0]) return hex(stops[0].color)
    for (let k = 1; k < stops.length; k++) {
        if (x <= pos[k]) {
            const span = pos[k] - pos[k - 1]
            const f = span > 0 ? (x - pos[k - 1]) / span : 1
            const a = hex(stops[k - 1].color)
            const b = hex(stops[k].color)
            return [Math.round(a[0] + (b[0] - a[0]) * f), Math.round(a[1] + (b[1] - a[1]) * f), Math.round(a[2] + (b[2] - a[2]) * f)]
        }
    }
    return hex(stops[stops.length - 1].color)
}

/** 팔레트(levels개 [r,g,b]) — 번호 k의 색 = 막대 위치 k/(levels-1)의 색 */
export function wxScalePalette(scale: WxColorScale): Array<[number, number, number]> {
    const out: Array<[number, number, number]> = []
    for (let k = 0; k < scale.levels; k++) out.push(wxScaleColorAt(scale, k / (scale.levels - 1)))
    return out
}

/** 범례 막대용 [위치 %, 색] 목록 — CSS 그라데이션을 만드는 쪽이 쓴다. 마지막 색은 끝(100%)까지 이어진다 */
export function wxScaleGradientStops(scale: WxColorScale): Array<{ percent: number; color: string }> {
    const out = scale.stops.map(s => ({ percent: Math.round(wxScalePosition(scale, s.value) * 10000) / 100, color: s.color }))
    if (out[out.length - 1].percent < 100) out.push({ percent: 100, color: out[out.length - 1].color })
    return out
}

/** 눈금 글: 정수면 그대로, 아니면 소수 한 자리('0.1', '2.5') */
export function wxTickLabel(value: number): string {
    return Number.isInteger(value) ? String(value) : value.toFixed(1)
}

/**
 * 마우스 표시 글: '기온 18.3℃' · '습도 72%' · '강수량 1.2mm'. 강수량이 0.1mm 미만이면 '강수 없음'(비 없음을 투명으로 그리는 것과 같은 기준).
 * 값이 null이면 '기온 자료 없음'. 반올림 결과가 -0.0이면 0으로 쓴다
 */
export function formatScalarValue(key: WindScalarVar, value: number | null): string {
    const scale = WX_COLOR_SCALES[key]
    if (value === null || !Number.isFinite(value)) return scale.label + ' 자료 없음'
    if (scale.transparentBelow !== undefined && value < scale.transparentBelow) return '강수 없음'
    const text = value.toFixed(scale.decimals)
    return scale.label + ' ' + (Number(text) === 0 ? (0).toFixed(scale.decimals) : text) + scale.unit
}
