// 바람 예보 프레임 목록 정리·시각 표시. React·ol 없음.
// 서버가 주는 validTime은 UTC(시간대 표시 없음)다. 화면에는 한국 표준시(KST, UTC+9)로 바꿔 보인다 — 브라우저 시간대와 무관하게(Date의 UTC 메서드만 쓴다).
import type { WindFrameMeta, WindScalarVar, WindStaleKind } from '../types/wind'
import { WIND_STALE_ISSUED_MS, WIND_STALE_PAST_MS } from './windLimits'

/** 한국 표준시 = UTC+9 */
export const KST_OFFSET_HOURS = 9
const HOUR_MS = 3600 * 1000

/**
 * 같은 예보시간(forecastHour) 프레임이 여럿이면(서버 정리 전 중복) id가 가장 큰 것 하나만 쓰고, 예보시간 오름차순으로 돌려준다.
 * 입력은 건드리지 않는다. 형식이 틀린 항목(id·forecastHour가 숫자가 아님)은 버린다
 */
export function normalizeWindFrames(list: readonly WindFrameMeta[] | null | undefined): WindFrameMeta[] {
    const best = new Map<number, WindFrameMeta>()
    for (const f of list ?? []) {
        if (!f || typeof f.id !== 'number' || typeof f.forecastHour !== 'number') continue
        const cur = best.get(f.forecastHour)
        if (!cur || f.id > cur.id) best.set(f.forecastHour, f)
    }
    return Array.from(best.values()).sort((a, b) => a.forecastHour - b.forecastHour)
}

/** 시간대 표시 없는 ISO('2026-10-14T00:00:00')나 [년,월,일,시,분,초] 배열을 UTC로 읽어 epoch ms로. 못 읽으면 null */
export function parseUtcTime(value: unknown): number | null {
    if (Array.isArray(value) && value.length >= 3 && value.every(n => typeof n === 'number')) {
        const [y, mo, d, h = 0, mi = 0, s = 0] = value as number[]
        return Date.UTC(y, mo - 1, d, h, mi, s)
    }
    if (typeof value !== 'string') return null
    // 시간대(Z·±hh:mm)가 적혀 있으면 그대로 따르고, 없으면 UTC로 본다(서버 계약)
    if (/(Z|[+-]\d{2}:?\d{2})$/i.test(value) && /T/.test(value)) {
        const t = Date.parse(value)
        return Number.isNaN(t) ? null : t
    }
    const m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?/.exec(value)
    if (!m) return null
    return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4] ?? 0), Number(m[5] ?? 0), Number(m[6] ?? 0))
}

export interface KstParts {
    month: number
    day: number
    /** 0=일 … 6=토 */
    weekday: number
    hour: number
}

/** epoch ms → 한국 표준시의 월·일·요일·시 */
export function kstParts(ms: number): KstParts {
    const d = new Date(ms + KST_OFFSET_HOURS * HOUR_MS)
    return { month: d.getUTCMonth() + 1, day: d.getUTCDate(), weekday: d.getUTCDay(), hour: d.getUTCHours() }
}

const WEEKDAY_KO = Object.freeze(['일', '월', '화', '수', '목', '금', '토'])

function pad2(n: number): string {
    return n < 10 ? '0' + n : String(n)
}

/** 프레임의 유효시각(UTC epoch ms). validTime을 못 읽으면 null */
export function frameValidMs(frame: WindFrameMeta): number | null {
    return parseUtcTime(frame.validTime)
}

/** 예보시각 표시 — KST '10/14(수) 09시'. 시각을 못 읽으면 '예보 N시간 후' */
export function formatForecastTime(frame: WindFrameMeta): string {
    const ms = frameValidMs(frame)
    if (ms === null) return '+' + frame.forecastHour + '시간'
    const p = kstParts(ms)
    return p.month + '/' + p.day + '(' + WEEKDAY_KO[p.weekday] + ') ' + pad2(p.hour) + '시'
}

/** 슬라이더 눈금용 짧은 시각 — KST '09시' */
export function formatForecastHourShort(frame: WindFrameMeta): string {
    const ms = frameValidMs(frame)
    return ms === null ? '+' + frame.forecastHour : pad2(kstParts(ms).hour) + '시'
}

/**
 * 발표시각 표시 — KST '10/14 09시 발표'. 서버가 준 cycleDate·cycleHour(KST)를 쓰고,
 * 없으면(옛 서버) 유효시각 − 예보시간(= 발표시각)을 KST로 바꿔 쓴다. 둘 다 못 읽으면 null
 */
export function formatIssueTime(frame: WindFrameMeta): string | null {
    if (typeof frame.cycleHour === 'number' && typeof frame.cycleDate === 'string') {
        const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(frame.cycleDate)
        if (m) return Number(m[2]) + '/' + Number(m[3]) + ' ' + pad2(frame.cycleHour) + '시 발표'
    }
    const valid = frameValidMs(frame)
    if (valid === null) return null
    const p = kstParts(valid - frame.forecastHour * HOUR_MS)
    return p.month + '/' + p.day + ' ' + pad2(p.hour) + '시 발표'
}

/** 지금(epoch ms) 이전에 유효한 프레임 중 가장 늦은 것의 index(서버 /latest와 같은 규칙). 없으면 0, 프레임이 없으면 -1 */
export function currentFrameIndex(frames: readonly WindFrameMeta[], nowMs: number): number {
    if (frames.length === 0) return -1
    let best = -1
    let bestMs = Number.NEGATIVE_INFINITY
    frames.forEach((f, i) => {
        const ms = frameValidMs(f)
        if (ms !== null && ms <= nowMs && ms >= bestMs) {
            best = i
            bestMs = ms
        }
    })
    return best >= 0 ? best : 0
}

/**
 * 자료 오래됨 판정. 가장 늦은 예보 유효시각이 지금보다 WIND_STALE_PAST_MS(1시간)를 넘게 과거면 'past'(모든 예보가 지났다 — 서버가 새 발표분을 못 받았다),
 * 아니고 발표시각(유효시각 − 예보시간)이 WIND_STALE_ISSUED_MS(12시간)를 넘게 과거면 'old'. 읽을 수 있는 시각이 없으면 null.
 * ('old'는 예보 범위가 12시간보다 길 때만 'past'보다 먼저 닿는다 — 예보 9시간이면 'past'가 항상 먼저. 범위를 늘릴 때를 위한 안전망)
 */
export function windStaleKind(frames: readonly WindFrameMeta[], nowMs: number): WindStaleKind | null {
    let lastValid = Number.NEGATIVE_INFINITY
    let issued = Number.NaN
    for (const f of frames) {
        const ms = frameValidMs(f)
        if (ms !== null && ms > lastValid) {
            lastValid = ms
            issued = ms - f.forecastHour * HOUR_MS
        }
    }
    if (!Number.isFinite(lastValid)) return null
    if (nowMs - lastValid > WIND_STALE_PAST_MS) return 'past'
    if (Number.isFinite(issued) && nowMs - issued > WIND_STALE_ISSUED_MS) return 'old'
    return null
}

/**
 * 예보 범위 표시 — KST '09~17시 예보'. 첫 프레임부터 마지막 프레임의 유효시각까지(목록은 normalizeWindFrames 결과: 예보시간 오름차순).
 * 날짜가 넘어가면 '21시~다음날 05시 예보', 프레임이 하나면 '09시 예보'. 시각을 못 읽으면 null
 */
export function formatForecastRange(frames: readonly WindFrameMeta[]): string | null {
    if (frames.length === 0) return null
    const first = frameValidMs(frames[0])
    const last = frameValidMs(frames[frames.length - 1])
    if (first === null || last === null) return null
    const a = kstParts(first)
    const b = kstParts(last)
    if (frames.length === 1 || last === first) return pad2(a.hour) + '시 예보'
    const sameDay = a.month === b.month && a.day === b.day
    return sameDay ? pad2(a.hour) + '~' + pad2(b.hour) + '시 예보' : pad2(a.hour) + '시~다음날 ' + pad2(b.hour) + '시 예보'
}

const SCALAR_VAR_ORDER: readonly WindScalarVar[] = Object.freeze(['temp', 'humi', 'rain'] as WindScalarVar[])

/** 프레임 목록 어디에라도 id가 있는 스칼라 변수(temp·humi·rain 순). 서버가 안 주는 변수는 빠진다 */
export function windScalarVarsOf(frames: readonly WindFrameMeta[]): WindScalarVar[] {
    return SCALAR_VAR_ORDER.filter(v => frames.some(f => typeof f.fields?.[v] === 'number'))
}
