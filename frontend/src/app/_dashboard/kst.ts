// 한국(서울) 시각 계산. 브라우저 시간대와 상관없이 서버·봇이 쓰는 "한국 날짜·시각"에 맞춘다.
// (toISOString()은 UTC 날짜라 한국 0~8시 59분에는 어제 날짜가 나가는 버그가 있었다)

const KST_OFFSET_MS = 9 * 60 * 60 * 1000
const HOUR_MS = 60 * 60 * 1000

/** 서버(WindDataService)는 발표 직후 자료가 늦게 올라오므로 발표 시각과 상관없이 매시 30분마다 수집을 시도한다 */
const WIND_ATTEMPT_MINUTE = 30
/** 최신 발표가 이 시간보다 오래되면 "갱신 지연" */
const WIND_STALE_HOURS = 9

const SEOUL_DATE = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
})

/** 지금(또는 now)의 한국 날짜 'YYYY-MM-DD' */
export function kstDateString(now: Date = new Date()): string {
    const parts = SEOUL_DATE.formatToParts(now)
    const pick = (type: string): string => parts.find((p) => p.type === type)?.value ?? ''
    return `${pick('year')}-${pick('month')}-${pick('day')}`
}

function pad2(n: number): string {
    return String(n).padStart(2, '0')
}

/** 발표 시각 표시 — 예: ('2026-11-05', 9) → '11월 5일 09시' */
export function formatCycle(cycleDate: string, cycleHour: number): string {
    const [, month, day] = cycleDate.split('-')
    return `${Number(month)}월 ${Number(day)}일 ${pad2(cycleHour)}시`
}

/** 발표(cycleDate·cycleHour는 한국 시각)의 실제 시점(ms) */
function cycleEpochMs(cycleDate: string, cycleHour: number): number {
    const [y, m, d] = cycleDate.split('-').map(Number)
    return Date.UTC(y, m - 1, d, cycleHour) - KST_OFFSET_MS
}

/** 최신 발표가 지금보다 9시간 넘게 지났는가 */
export function isWindStale(cycleDate: string, cycleHour: number, now: Date = new Date()): boolean {
    return now.getTime() - cycleEpochMs(cycleDate, cycleHour) > WIND_STALE_HOURS * HOUR_MS
}

/** 다음 수집 시도 시각(한국) 'HH:mm' — 매시 30분(지금이 정각~29분이면 이번 시각, 30분 이후면 다음 시각) */
export function nextWindAttemptLabel(now: Date = new Date()): string {
    const kst = new Date(now.getTime() + KST_OFFSET_MS)
    const hour = kst.getUTCHours()
    const nextHour = kst.getUTCMinutes() < WIND_ATTEMPT_MINUTE ? hour : (hour + 1) % 24
    return `${pad2(nextHour)}:${pad2(WIND_ATTEMPT_MINUTE)}`
}
