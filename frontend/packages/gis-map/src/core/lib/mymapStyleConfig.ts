// 나만의지도 스타일 설정(styleConfig v1) — 스키마·기본값·검증·직렬화·구간 계산·팔레트·컬럼 요약. ol·React·DOM 없음(순수 함수).
//   · 서버(백엔드 StyleConfigValidator)가 저장 전에 같은 v1 스키마를 검사한다: 모르는 키는 거절, 색은 #rrggbb[aa](구간 색은 알파 없는 #rrggbb만), 범주 1~12개·구간 3~7개·팝업 0~30개(0개 = 팝업 끔),
//     컬럼은 그 레이어에 있어야 하고 구간형은 숫자 컬럼이어야 한다. 값 범위는 서버와 같다(아래 STYLE_* — 서버가 받은 값을 조용히 줄여 그리지 않는다).
//     읽을 때는 절대 throw하지 않고 못 읽는 부분을 기본값으로 채우며, v가 1이 아니거나 JSON이 깨졌으면 null(= 옛 고정 스타일 그대로)
//   · 점 색·점 테두리(pointColor·pointStroke·pointStrokeWidth)는 기본값(선 색을 따름·흰색·1px)이면 저장 JSON에 넣지 않는다(키가 없으면 기본)
//   · 속성값은 서버에 문자열로 저장돼 있다("1100", "1,100") → 구간형은 readNumber로 숫자로 읽는다. 숫자 판정은 서버 컬럼 통계(NumericText)와 같은 규칙이다
import type {
    MyMapBreakMethod, MyMapCategorizedStyle, MyMapClassify, MyMapColumnInfo, MyMapDisplay, MyMapGraduatedStyle, MyMapLabelStyle,
    MyMapPopupStyle, MyMapStyleConfig,
} from '../types/mymap'
import { normalizeHexColor } from './color'

export const MYMAP_STYLE_VERSION = 1
/** 서버 상한(StyleConfigValidator.MAX_BYTES)과 같다 — 이보다 길면 저장하지 않는다 */
export const MYMAP_STYLE_MAX_BYTES = 16 * 1024
/** 읽을 때의 안전 상한(글자 수) — 이보다 긴 문자열은 해석하지 않는다 */
const MAX_JSON_CHARS = MYMAP_STYLE_MAX_BYTES * 2

interface Range {
    readonly min: number
    readonly max: number
}
const range = (min: number, max: number): Range => Object.freeze({ min, max })

/** 값 범위 = 서버 StyleConfigValidator의 범위(읽을 때 이 안으로 자르고, 화면 입력 한도로도 쓴다). 같은 범위라서 서버가 받은 값은 줄어들지 않고 그대로 그려지고 다시 열어도 같다 */
export const STYLE_FILL_OPACITY = range(0, 1)
export const STYLE_STROKE_WIDTH = range(0, 20)
export const STYLE_POINT_RADIUS = range(1, 50)
export const STYLE_POINT_STROKE_WIDTH = range(0, 10)
export const STYLE_LABEL_SIZE = range(8, 40)
export const STYLE_LABEL_MIN_ZOOM = range(0, 28)
/** 범주 최대 개수(+ 기타) */
export const STYLE_MAX_CATEGORIES = 12
export const STYLE_MIN_BREAK_CLASSES = 3
export const STYLE_MAX_BREAK_CLASSES = 7
export const STYLE_MAX_POPUP_FIELDS = 30
/** 컬럼 이름·범주 값 길이 상한(서버 NAME_MAX와 같다) */
export const STYLE_MAX_TEXT = 200
/** 팝업 설정이 없을 때 보이는 컬럼 수 */
export const POPUP_DEFAULT_FIELD_COUNT = 5

export const DEFAULT_OTHER_COLOR = '#9ca3af'
export const DEFAULT_LABEL_SIZE = 12
export const DEFAULT_LABEL_COLOR = '#111827'
export const DEFAULT_LABEL_HALO = '#ffffff'
export const DEFAULT_LABEL_MIN_ZOOM = 15
const FALLBACK_BASE = '#f26722'

/** 범주 기본 팔레트(12색) */
export const CATEGORY_PALETTE: readonly string[] = Object.freeze([
    '#2563eb', '#f26722', '#16a34a', '#dc2626', '#9333ea', '#0891b2', '#ca8a04', '#db2777', '#4f46e5', '#65a30d', '#ea580c', '#0d9488',
])

export interface ColorRamp {
    id: string
    label: string
    /** 5개 기준 색(옅음 → 짙음) — 구간 수가 달라도 이 사이를 보간한다 */
    stops: readonly string[]
}

const ramp = (id: string, label: string, stops: readonly string[]): ColorRamp => Object.freeze({ id, label, stops: Object.freeze([...stops]) })

/** 구간형 색 띠(ColorBrewer 순차형 5단계) */
export const COLOR_RAMPS: readonly ColorRamp[] = Object.freeze([
    ramp('reds', '빨강', ['#fee5d9', '#fcae91', '#fb6a4a', '#de2d26', '#a50f15']),
    ramp('oranges', '주황', ['#feedde', '#fdbe85', '#fd8d3c', '#e6550d', '#a63603']),
    ramp('blues', '파랑', ['#eff3ff', '#bdd7e7', '#6baed6', '#3182bd', '#08519c']),
    ramp('greens', '초록', ['#edf8e9', '#bae4b3', '#74c476', '#31a354', '#006d2c']),
    ramp('purples', '보라', ['#f2f0f7', '#cbc9e2', '#9e9ac8', '#756bb1', '#54278f']),
    ramp('viridis', '청록-노랑', ['#440154', '#3b528b', '#21908c', '#5dc863', '#fde725']),
])

// ── 작은 도우미 ───────────────────────────────────────────────────────────────

function asObject(v: unknown): Record<string, unknown> | null {
    return v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null
}

export function clampNumber(v: unknown, r: Range, fallback: number): number {
    if (typeof v !== 'number' || !Number.isFinite(v)) return fallback
    return Math.min(r.max, Math.max(r.min, v))
}

/** '#rgb'·'#rrggbb' → '#rrggbb'(소문자). 서버가 허용하는 '#rrggbbaa'는 알파를 버리고 읽는다. 그 밖은 fallback */
export function styleColor(v: unknown, fallback: string): string {
    const eight = typeof v === 'string' ? /^\s*(#[0-9a-f]{6})[0-9a-f]{2}\s*$/i.exec(v) : null
    const hex = normalizeHexColor(eight ? eight[1] : v)
    return hex ? hex.toLowerCase() : fallback
}

function fieldName(v: unknown): string | null {
    if (typeof v !== 'string' || v.trim() === '' || v.length > STYLE_MAX_TEXT) return null
    return v
}

function round(n: number, digits: number): number {
    const f = Math.pow(10, digits)
    return Math.round(n * f) / f
}

// ── 기본값·읽기·쓰기 ──────────────────────────────────────────────────────────

/** 옛 고정 스타일과 같은 모양(채우기 = 색 + 알파 20%, 선 2px, 점 반지름 5 + 흰 테두리 1px) */
export function defaultMyMapStyle(baseColor: string): MyMapStyleConfig {
    const base = styleColor(baseColor, FALLBACK_BASE)
    return {
        v: 1, display: 'polygon',
        fill: base, fillOpacity: 0.2, stroke: base, strokeWidth: 2,
        pointRadius: 5, pointColor: null, pointStroke: '#ffffff', pointStrokeWidth: 1,
        classify: null, label: null, popup: null,
    }
}

function parseClassify(v: unknown, base: string): MyMapClassify | null {
    const o = asObject(v)
    if (!o) return null
    const field = fieldName(o.field)
    if (!field) return null
    const other = styleColor(o.otherColor, DEFAULT_OTHER_COLOR)
    if (o.type === 'categorical') {
        if (!Array.isArray(o.classes)) return null
        const seen = new Set<string>()
        const classes: Array<{ value: string; color: string }> = []
        for (const c of o.classes) {
            const co = asObject(c)
            if (!co) continue
            const value = typeof co.value === 'string' ? co.value.trim() : typeof co.value === 'number' ? String(co.value) : ''
            if (value === '' || value.length > STYLE_MAX_TEXT || seen.has(value)) continue
            seen.add(value)
            classes.push({ value, color: styleColor(co.color, base) })
            if (classes.length >= STYLE_MAX_CATEGORIES) break
        }
        return classes.length > 0 ? { type: 'categorical', field, classes, otherColor: other } : null
    }
    if (o.type === 'graduated') {
        if (!Array.isArray(o.colors) || !Array.isArray(o.breaks)) return null
        const colors = o.colors.map(c => normalizeHexColor(c))
        if (colors.length < STYLE_MIN_BREAK_CLASSES || colors.length > STYLE_MAX_BREAK_CLASSES || colors.some(c => c === null)) return null
        const breaks = o.breaks as unknown[]
        if (breaks.length !== colors.length - 1 || breaks.some(b => typeof b !== 'number' || !Number.isFinite(b) || Math.abs(b) >= BREAK_ABS_LIMIT)) return null
        const nums = breaks as number[]
        // 오름차순이어야 한다(서버와 같이 같은 값은 허용 — 이 패키지가 만드는 값은 항상 위로만 커진다)
        for (let i = 1; i < nums.length; i++) if (nums[i] < nums[i - 1]) return null
        const method: MyMapBreakMethod = o.method === 'quantile' || o.method === 'equal' ? o.method : 'manual'
        return {
            type: 'graduated', field, method, breaks: [...nums],
            colors: (colors as string[]).map(c => c.toLowerCase()), otherColor: other,
        }
    }
    return null
}

function parseLabel(v: unknown): MyMapLabelStyle | null {
    const o = asObject(v)
    if (!o) return null
    const field = fieldName(o.field)
    if (!field) return null
    return {
        field,
        size: Math.round(clampNumber(o.size, STYLE_LABEL_SIZE, DEFAULT_LABEL_SIZE)),
        color: styleColor(o.color, DEFAULT_LABEL_COLOR),
        halo: styleColor(o.halo, DEFAULT_LABEL_HALO),
        minZoom: Math.round(clampNumber(o.minZoom, STYLE_LABEL_MIN_ZOOM, DEFAULT_LABEL_MIN_ZOOM)),
    }
}

function parsePopup(v: unknown): MyMapPopupStyle | null {
    const o = asObject(v)
    if (!o || !Array.isArray(o.fields)) return null
    const fields: string[] = []
    for (const f of o.fields) {
        const name = fieldName(f)
        if (name && !fields.includes(name)) fields.push(name)
        if (fields.length >= STYLE_MAX_POPUP_FIELDS) break
    }
    return { fields }
}

/**
 * 서버에서 받은 styleConfig(JSON 문자열 또는 객체) → 빈 곳을 기본값으로 채운 스타일.
 * 없음·빈 문자열·깨진 JSON·객체가 아님·v가 1이 아님이면 null — 호출한 쪽이 옛 고정 스타일을 쓴다. 절대 throw하지 않는다
 */
export function parseMyMapStyle(input: unknown, baseColor: string): MyMapStyleConfig | null {
    let raw: unknown = input
    if (typeof input === 'string') {
        if (input.trim() === '' || input.length > MAX_JSON_CHARS) return null
        try {
            raw = JSON.parse(input)
        } catch {
            return null
        }
    }
    const o = asObject(raw)
    if (!o || o.v !== MYMAP_STYLE_VERSION) return null
    const def = defaultMyMapStyle(baseColor)
    const fill = styleColor(o.fill, def.fill)
    const stroke = styleColor(o.stroke, o.fill !== undefined ? fill : def.stroke)
    const display: MyMapDisplay = o.display === 'point' ? 'point' : 'polygon'
    // 점 색이 선 색과 같으면 "선 색을 따름"(null)으로 — 저장 JSON에 pointColor가 없는 옛 모양과 같다
    const pointColor = styleColor(o.pointColor, stroke)
    return {
        v: 1,
        display,
        fill,
        fillOpacity: clampNumber(o.fillOpacity, STYLE_FILL_OPACITY, def.fillOpacity),
        stroke,
        strokeWidth: clampNumber(o.strokeWidth, STYLE_STROKE_WIDTH, def.strokeWidth),
        pointRadius: clampNumber(o.pointRadius, STYLE_POINT_RADIUS, def.pointRadius),
        pointColor: pointColor === stroke ? null : pointColor,
        pointStroke: styleColor(o.pointStroke, def.pointStroke),
        pointStrokeWidth: clampNumber(o.pointStrokeWidth, STYLE_POINT_STROKE_WIDTH, def.pointStrokeWidth),
        classify: parseClassify(o.classify, stroke),
        label: parseLabel(o.label),
        popup: parsePopup(o.popup),
    }
}

/**
 * 서버에 보낼 JSON. 설계 5.2의 키 순서(v, display, fill, …, classify, label, popup).
 * 점 설정(pointColor·pointStroke·pointStrokeWidth)은 기본값이 아닐 때만 넣는다(키가 없으면 점 색 = 선 색, 테두리 흰색 1px).
 * 팝업: null = 기본(앞 5개 컬럼), `{ fields: [] }` = 팝업 끔 — 둘은 다른 뜻이라 그대로 쓴다(서버도 같은 뜻으로 저장·검증한다)
 */
export function serializeMyMapStyle(cfg: MyMapStyleConfig): string {
    const clean = parseMyMapStyle(cfg, cfg.fill)
    const c = clean ?? defaultMyMapStyle(cfg.fill)
    const out: Record<string, unknown> = {
        v: 1,
        display: c.display,
        fill: c.fill,
        fillOpacity: round(c.fillOpacity, 2),
        stroke: c.stroke,
        strokeWidth: round(c.strokeWidth, 1),
        pointRadius: round(c.pointRadius, 1),
    }
    const def = defaultMyMapStyle(c.fill)
    if (c.pointColor !== null) out.pointColor = c.pointColor
    if (c.pointStroke !== def.pointStroke) out.pointStroke = c.pointStroke
    if (round(c.pointStrokeWidth, 1) !== def.pointStrokeWidth) out.pointStrokeWidth = round(c.pointStrokeWidth, 1)
    out.classify = c.classify
    out.label = c.label
    out.popup = c.popup
    return JSON.stringify(out)
}

/** UTF-8 바이트 수(서버 16KB 검사와 같은 기준) */
export function utf8Length(s: string): number {
    let n = 0
    for (let i = 0; i < s.length; i++) {
        const code = s.charCodeAt(i)
        if (code < 0x80) n += 1
        else if (code < 0x800) n += 2
        else if (code >= 0xd800 && code <= 0xdbff) {
            n += 4
            i++
        } else n += 3
    }
    return n
}

/** 두 스타일이 저장 모양으로 같은지 */
export function sameMyMapStyle(a: MyMapStyleConfig, b: MyMapStyleConfig): boolean {
    return serializeMyMapStyle(a) === serializeMyMapStyle(b)
}

/** 기본(옛 고정) 스타일과 같은지 — 같으면 저장하지 않고 서버 값을 지운다("") */
export function isDefaultMyMapStyle(cfg: MyMapStyleConfig, baseColor: string): boolean {
    return sameMyMapStyle(cfg, defaultMyMapStyle(baseColor))
}

// ── 숫자·값 읽기 ─────────────────────────────────────────────────────────────

/** 올바르게 묶은 천 단위 쉼표("1,234", "1,234,567.89")만 — 쉼표 뒤가 정확히 3자리씩 */
const GROUPED_NUMBER = /^[+-]?\d{1,3}(,\d{3})+(\.\d+)?$/
/** 보통 숫자: 부호·소수점·지수("12", "-3.5", ".5", "5.", "1.5E+3") */
const PLAIN_NUMBER = /^[+-]?(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?$/
/** 정수 부분이 이보다 길면(PNU 같은 식별자) 실수로 정밀도가 깨지므로 숫자로 보지 않는다 */
const MAX_INTEGER_DIGITS = 15
/**
 * 숫자로 읽는 값의 크기 상한(**미만** — 1e15 자신도 숫자가 아니다). 서버가 숫자 판정(NumericText.ABS_LIMIT)과 구간 경계(StyleConfigValidator.BREAK_ABS_LIMIT)에
 * 같은 "절댓값 1e15 미만"을 쓰므로 그 값("1e15", "9e15", "1.5E+16")은 숫자로 보지 않는다 — 그러면 분위·같은 간격 경계가 항상 이 안에 들어 서버가 거절할 경계를 만들 수 없다(공유 표로 확인)
 */
export const NUMBER_ABS_LIMIT = 1e15
/** 구간 경계의 크기 상한(**미만**, 서버 BREAK_ABS_LIMIT와 같다). 직접 입력·저장 JSON 읽기·반올림 결과에 같이 적용한다 */
export const BREAK_ABS_LIMIT = 1e15

/**
 * 속성값 → 숫자. **서버의 컬럼 통계(NumericText)와 같은 규칙**이다 — 서버가 "숫자 컬럼"이라 한 컬럼에만 구간형을 허용하므로 둘이 어긋나면 저장이 거절된다.
 * 앞뒤 공백(전각·NBSP 포함)을 떼고 NFKC로 정리한 뒤: 보통 숫자 · 올바르게 묶은 쉼표 숫자는 숫자.
 * 빈 값·NaN·Infinity·16진수·퍼센트/통화 기호가 붙은 값·잘못 묶은 쉼표("1,5")·공백으로 나눈 값("1 000")·앞이 0인 코드("007")·16자리 이상 정수·
 * 크기가 ±1e15 이상인 값("9e15")은 null.
 */
export function readNumber(v: unknown): number | null {
    const r = readNumberDetail(v)
    return r.error === undefined ? r.value : null
}

export type NumberRead = { value: number; error?: undefined } | { value?: undefined; error: 'format' | 'range' }

/**
 * readNumber와 같은 규칙인데 못 읽은 이유를 함께 준다: 'format' = 숫자 모양이 아님(코드·식별자 포함), 'range' = 숫자 모양이지만 크기가 ±1e15 이상(1e999처럼 무한대가 되는 값 포함).
 * 화면이 "쓸 수 없는 값"의 원인을 말해 줄 때 쓴다(직접 입력한 경계값·너무 큰 값이 든 컬럼)
 */
export function readNumberDetail(v: unknown): NumberRead {
    let s: string
    if (typeof v === 'string') s = v
    else if (typeof v === 'number') s = String(v)
    else return { error: 'format' }
    s = s.normalize('NFKC').trim()
    if (s === '') return { error: 'format' }
    if (s.includes(',')) {
        if (!GROUPED_NUMBER.test(s)) return { error: 'format' }
        s = s.replace(/,/g, '')
    }
    if (!PLAIN_NUMBER.test(s)) return { error: 'format' }
    const body = s[0] === '+' || s[0] === '-' ? s.slice(1) : s
    const end = body.search(/[.eE]/)
    const intPart = end < 0 ? body : body.slice(0, end)
    if (intPart.length > 1 && intPart[0] === '0') return { error: 'format' }
    if (intPart.length > MAX_INTEGER_DIGITS) return { error: 'format' }
    const n = Number(s)
    if (!Number.isFinite(n)) return { error: 'range' }
    return Math.abs(n) >= NUMBER_ABS_LIMIT ? { error: 'range' } : { value: n }
}

/** 범주 비교용 값 글자. 값이 없으면(null·빈 글자) null */
export function categoryKey(v: unknown): string | null {
    if (v === null || v === undefined) return null
    const s = typeof v === 'string' ? v.trim() : typeof v === 'number' || typeof v === 'boolean' ? String(v) : ''
    return s === '' ? null : s
}

/** 값 → 색을 돌려주는 함수(스타일 함수가 피처마다 부른다). 범주는 Map을 한 번만 만든다 */
export function makeClassColorFn(c: MyMapClassify): (raw: unknown) => string {
    if (c.type === 'categorical') {
        const map = new Map<string, string>()
        c.classes.forEach(x => map.set(x.value, x.color))
        return raw => {
            const k = categoryKey(raw)
            return k === null ? c.otherColor : map.get(k) ?? c.otherColor
        }
    }
    const { breaks, colors, otherColor } = c
    return raw => {
        const n = readNumber(raw)
        if (n === null) return otherColor
        let i = 0
        while (i < breaks.length && n >= breaks[i]) i++
        return colors[i]
    }
}

// ── 색 띠·구간 ───────────────────────────────────────────────────────────────

function hexToRgb(hex: string): [number, number, number] {
    return [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number]
}

function rgbToHex(rgb: readonly number[]): string {
    return '#' + rgb.map(c => Math.round(Math.min(255, Math.max(0, c))).toString(16).padStart(2, '0')).join('')
}

/** 색 띠(5개 기준 색)를 k개로 보간. k가 5면 기준 색 그대로 */
export function rampColors(stops: readonly string[], k: number): string[] {
    const n = stops.length
    if (n === 0 || k <= 0) return []
    if (k === 1) return [stops[0]]
    const out: string[] = []
    for (let i = 0; i < k; i++) {
        const pos = (i / (k - 1)) * (n - 1)
        const lo = Math.floor(pos)
        const hi = Math.min(n - 1, lo + 1)
        const t = pos - lo
        const a = hexToRgb(stops[lo])
        const b = hexToRgb(stops[hi])
        out.push(rgbToHex([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]))
    }
    return out
}

/** 저장된 구간 색(JSON에는 색 띠 id가 없다 — 서버 스키마가 모르는 키를 거절한다)에서 색 띠를 되찾는다. 어느 띠와도 안 맞으면 null */
export function findRampIdByColors(colors: readonly string[]): string | null {
    if (colors.length === 0) return null
    const lower = colors.map(c => c.toLowerCase())
    const hit = COLOR_RAMPS.find(r => {
        const made = rampColors(r.stops, lower.length)
        return made.length === lower.length && made.every((c, i) => c === lower[i])
    })
    return hit ? hit.id : null
}

export function findRamp(id: string): ColorRamp {
    return COLOR_RAMPS.find(r => r.id === id) ?? COLOR_RAMPS[0]
}

/** 소수 자리 상한(toFixed 한계 안). 값 범위가 이보다 좁으면(1e-18 수준) 경계를 만들 수 없다 */
const MAX_BREAK_DECIMALS = 20

/** 경계값 자리 맞춤: 범위가 700이면 정수, 7이면 소수 둘째 자리, 0.07이면 넷째 자리, 8e-7이면 아홉째 자리 */
function roundBreak(v: number, spread: number): number {
    const digits = Math.min(MAX_BREAK_DECIMALS, Math.max(0, 2 - Math.floor(Math.log10(spread))))
    return Number(v.toFixed(digits))
}

/**
 * 안쪽 경계값 k-1개(오름차순). 정렬된 숫자 값에서 계산한다.
 *  · quantile: 같은 개수씩(분위), equal: 같은 간격
 *  · 값이 한 가지뿐이거나 같은 경계가 겹치면 겹치는 것을 버려 k-1개보다 적게 나올 수 있다(호출한 쪽이 equal로 다시 계산하거나 구간 수를 줄인다)
 *  · 첫 구간과 마지막 구간이 비지 않게 최솟값 초과·최댓값 이하만 둔다
 */
export function computeBreaks(sorted: readonly number[], k: number, method: 'quantile' | 'equal'): number[] {
    const n = sorted.length
    if (n === 0 || k < 2) return []
    const min = sorted[0]
    const max = sorted[n - 1]
    const spread = max - min
    if (!(spread > 0)) return []
    const out: number[] = []
    for (let i = 1; i < k; i++) {
        let b: number
        if (method === 'equal') {
            b = min + (spread * i) / k
        } else {
            const pos = ((n - 1) * i) / k
            const lo = Math.floor(pos)
            const hi = Math.min(n - 1, lo + 1)
            b = sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo)
        }
        const r = roundBreak(b, spread)
        // r <= max 이고 max는 숫자로 읽은 값(절댓값 1e15 미만)이라, 반올림이 999999999999999.5를 1e15로 올려도 여기서 걸러진다 → 경계는 항상 1e15 미만
        if (r > min && r <= max && (out.length === 0 || r > out[out.length - 1])) out.push(r)
    }
    return out
}

/** 값이 한 번이라도 다르면 equal은 항상 k-1개가 나온다(spread > 0이고 반올림이 간격보다 작다) — 숫자 값이 이만큼 있어야 구간형을 쓸 수 있다 */
export const MIN_DISTINCT_FOR_GRADUATED = STYLE_MIN_BREAK_CLASSES

// ── 컬럼 요약·범주 집계(불러온 피처에서) ──────────────────────────────────────

/** 피처의 속성 읽기(ol Feature가 구조적으로 맞는다 — 이 파일은 ol을 가져오지 않는다) */
export interface PropertyReader {
    getKeys(): string[]
    get(key: string): unknown
}

/** 서로 다른 값을 세는 상한(이 이상은 distinctCapped) */
const DISTINCT_CAP = 2000
const SAMPLE_COUNT = 3

interface ColumnAcc {
    filled: number
    numeric: number
    tooLarge: number
    min: number
    max: number
    distinct: Set<string>
    capped: boolean
    sample: string[]
}

/** 컬럼 요약(처음 나온 순서). skipKeys = 지오메트리 키 등 속성이 아닌 것. 값이 있는 칸·숫자 판정은 서버 컬럼 통계(ColumnStatsCollector)와 같다 */
export function summarizeColumns(features: readonly PropertyReader[], skipKeys: readonly string[]): MyMapColumnInfo[] {
    const acc = new Map<string, ColumnAcc>()
    for (const f of features) {
        for (const key of f.getKeys()) {
            if (skipKeys.includes(key)) continue
            let a = acc.get(key)
            if (!a) {
                a = { filled: 0, numeric: 0, tooLarge: 0, min: Infinity, max: -Infinity, distinct: new Set(), capped: false, sample: [] }
                acc.set(key, a)
            }
            const raw = f.get(key)
            const k = categoryKey(raw)
            if (k === null) continue
            a.filled++
            const r = readNumberDetail(raw)
            if (r.error === undefined) {
                a.numeric++
                if (r.value < a.min) a.min = r.value
                if (r.value > a.max) a.max = r.value
            } else if (r.error === 'range') {
                a.tooLarge++
            }
            if (!a.capped && !a.distinct.has(k)) {
                if (a.distinct.size >= DISTINCT_CAP) a.capped = true
                else {
                    a.distinct.add(k)
                    if (a.sample.length < SAMPLE_COUNT) a.sample.push(k.length > 40 ? k.slice(0, 40) + '…' : k)
                }
            }
        }
    }
    const out: MyMapColumnInfo[] = []
    acc.forEach((a, name) => {
        // 서버 컬럼 통계와 같은 기준: 값이 있는 칸의 90% 이상(올림)이 숫자
        const isNumber = a.filled > 0 && a.numeric >= Math.ceil(a.filled * 0.9)
        const info: MyMapColumnInfo = {
            name, kind: isNumber ? 'number' : 'text', filled: a.filled, distinct: a.distinct.size, distinctCapped: a.capped, sample: a.sample,
        }
        if (a.tooLarge > 0) info.tooLarge = a.tooLarge
        if (isNumber && Number.isFinite(a.min)) {
            info.min = a.min
            info.max = a.max
        }
        out.push(info)
    })
    return out
}

export interface CategoryCount {
    value: string
    count: number
}

export interface CategoryCounts {
    /** 개수 많은 순(같으면 처음 나온 순) */
    entries: CategoryCount[]
    /** 값이 없는 피처 수 */
    empty: number
    total: number
}

export function categoryCounts(features: readonly PropertyReader[], field: string): CategoryCounts {
    const map = new Map<string, number>()
    let empty = 0
    for (const f of features) {
        const k = categoryKey(f.get(field))
        if (k === null) empty++
        else map.set(k, (map.get(k) ?? 0) + 1)
    }
    const entries = Array.from(map, ([value, count]) => ({ value, count })).sort((a, b) => b.count - a.count)
    return { entries, empty, total: features.length }
}

/** 숫자로 읽히는 값만 오름차순으로 */
export function numericValues(features: readonly PropertyReader[], field: string): number[] {
    const out: number[] = []
    for (const f of features) {
        const n = readNumber(f.get(field))
        if (n !== null) out.push(n)
    }
    return out.sort((a, b) => a - b)
}

// ── 대화상자가 쓰는 만들기 도우미 ─────────────────────────────────────────────

/** 범주형: 많은 값 12개에 색을 준다. 이전 설정에 같은 값이 있으면 그 색을 이어 쓴다 */
export function buildCategorizedStyle(field: string, entries: readonly CategoryCount[], prev: MyMapClassify | null): MyMapCategorizedStyle {
    const prevColors = new Map<string, string>()
    let other = DEFAULT_OTHER_COLOR
    if (prev && prev.type === 'categorical' && prev.field === field) {
        prev.classes.forEach(c => prevColors.set(c.value, c.color))
        other = prev.otherColor
    }
    // 서버가 값 길이를 STYLE_MAX_TEXT자로 막으므로 더 긴 값은 색을 주지 않는다(기타 색)
    const classes = entries.filter(e => e.value.length <= STYLE_MAX_TEXT).slice(0, STYLE_MAX_CATEGORIES).map((e, i) => ({
        value: e.value,
        color: prevColors.get(e.value) ?? CATEGORY_PALETTE[i % CATEGORY_PALETTE.length],
    }))
    return { type: 'categorical', field, classes, otherColor: other }
}

export interface GraduatedRequest {
    field: string
    /** 숫자로 읽힌 값(오름차순) */
    values: readonly number[]
    /** 구간 수(3~7) */
    classes: number
    method: MyMapBreakMethod
    rampId: string
    /** method가 manual일 때 쓸 경계값 */
    manualBreaks?: readonly number[]
    otherColor?: string
}

export interface GraduatedResult {
    style: MyMapGraduatedStyle | null
    /** 분위가 겹쳐 같은 간격으로 바꿨다 */
    fellBack: boolean
    /** 구간을 만들 수 없다 */
    unavailable: boolean
    /** unavailable의 원인: 'few' = 서로 다른 숫자 값이 모자람, 'narrow' = 값은 충분한데 범위가 너무 좁아 경계를 가를 수 없음 */
    reason?: 'few' | 'narrow'
}

/** 구간형 스타일 만들기. quantile이 겹치면 equal로 바꾸고(fellBack), 그래도 안 되면 null(unavailable) */
export function buildGraduatedStyle(req: GraduatedRequest): GraduatedResult {
    const k = Math.min(STYLE_MAX_BREAK_CLASSES, Math.max(STYLE_MIN_BREAK_CLASSES, Math.round(req.classes)))
    const colorsFor = (n: number) => rampColors(findRamp(req.rampId).stops, n)
    const other = req.otherColor ?? DEFAULT_OTHER_COLOR
    let method = req.method
    let breaks: number[]
    let fellBack = false
    if (method === 'manual') {
        const m = (req.manualBreaks ?? []).filter(b => Number.isFinite(b) && Math.abs(b) < BREAK_ABS_LIMIT)
        const ok = m.length === k - 1 && m.every((b, i) => i === 0 || b > m[i - 1])
        if (!ok) return { style: null, fellBack: false, unavailable: false }
        breaks = [...m]
    } else {
        breaks = computeBreaks(req.values, k, method)
        if (breaks.length < k - 1 && method === 'quantile') {
            breaks = computeBreaks(req.values, k, 'equal')
            method = 'equal'
            fellBack = true
        }
        if (breaks.length < k - 1) {
            // 값이 서로 다른데(최솟값 < 최댓값) 경계가 안 나오면 범위가 소수 20자리 안에서 구분되지 않을 만큼 좁은 것. 값이 전부 같으면 값이 모자란 것
            const v = req.values
            return { style: null, fellBack, unavailable: true, reason: v.length > 0 && v[0] < v[v.length - 1] ? 'narrow' : 'few' }
        }
    }
    return { style: { type: 'graduated', field: req.field, method, breaks, colors: colorsFor(k), otherColor: other }, fellBack, unavailable: false }
}

// ── 라벨 안전장치 ────────────────────────────────────────────────────────────

/**
 * 피처가 많을 때 라벨을 그릴 수 있는 가장 낮은 확대 단계. 라벨은 글자 크기를 재고 겹침을 가려내느라 피처 수에 비례해 느려지므로,
 * 설정한 minZoom이 이보다 낮아도 이 값 아래 확대에서는 그리지 않는다(설계 K10).
 */
export function labelFloorZoom(featureCount: number): number {
    if (featureCount > 20000) return 16
    if (featureCount > 5000) return 15
    if (featureCount > 2000) return 14
    if (featureCount > 500) return 12
    return 0
}

export function effectiveLabelMinZoom(minZoom: number, featureCount: number): number {
    return Math.max(minZoom, labelFloorZoom(featureCount))
}

/** 라벨·팝업 글자: 값이 없으면 '', 줄바꿈은 공백으로, 길면 …로 자른다 */
export function displayText(v: unknown, max: number): string {
    const k = categoryKey(v)
    if (k === null) return ''
    const s = k.replace(/\s+/g, ' ')
    return s.length > max ? s.slice(0, max) + '…' : s
}

/** 팝업에 보일 컬럼: 설정이 있으면 그 순서대로(빈 배열 = 팝업 끔), 없으면 피처의 앞 5개 컬럼 */
export function popupFieldsFor(popup: MyMapPopupStyle | null, available: readonly string[]): string[] {
    return popup ? [...popup.fields] : available.slice(0, POPUP_DEFAULT_FIELD_COUNT)
}
