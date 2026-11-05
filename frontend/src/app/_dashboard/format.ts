const COMPACT = new Intl.NumberFormat('ko-KR', { notation: 'compact', maximumFractionDigits: 1 })

/** 큰 수 줄여 쓰기 — 12400 → '1.2만', 128 → '128' */
export function compactNumber(n: number): string {
    return COMPACT.format(n)
}

const BYTE_UNITS = ['B', 'KB', 'MB', 'GB', 'TB'] as const

/** 용량 표시(1024 단위) — 1.4GB, 12MB. 숫자가 아니거나 0이면 '0B' */
export function formatBytes(bytes: number | null | undefined): string {
    if (bytes === null || bytes === undefined || !Number.isFinite(bytes) || bytes <= 0) return '0B'
    let value = bytes
    let unit = 0
    while (value >= 1024 && unit < BYTE_UNITS.length - 1) {
        value /= 1024
        unit += 1
    }
    const text = value < 10 && unit > 0 ? value.toFixed(1).replace(/\.0$/, '') : String(Math.round(value))
    return `${text}${BYTE_UNITS[unit]}`
}

/** 성공률(%) — 전체가 0건이면 null(0%가 아니라 "기록 없음") */
export function successRatePercent(success: number, total: number): number | null {
    if (total <= 0) return null
    return Math.round((success / total) * 100)
}

export interface LayerCountEntry {
    label: string
    count: number
}

/** 레이어 카드 보조 줄 — '그룹 9 · WMS 28 · WFS 8 · 배경 3 · 기타 3'. 종류별은 많은 순 상위 3개, 나머지는 '기타' */
export function formatLayerBreakdown(groupCount: number, entries: readonly LayerCountEntry[]): string {
    const sorted = [...entries].filter((e) => e.count > 0).sort((a, b) => b.count - a.count)
    const top = sorted.slice(0, 3)
    const rest = sorted.slice(3).reduce((sum, e) => sum + e.count, 0)
    const parts = [`그룹 ${groupCount}`, ...top.map((e) => `${e.label} ${e.count}`)]
    if (rest > 0) parts.push(`기타 ${rest}`)
    return parts.join(' · ')
}
