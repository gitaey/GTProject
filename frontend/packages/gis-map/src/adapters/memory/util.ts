// 메모리 어댑터 공용 순수 함수: 시드 고정 난수, 점·면 판정. 모듈 전역 상태 없음(난수기는 호출마다 새로 만든 클로저).
import type { GeoJsonObject } from '../../core'

/** mulberry32. 같은 시드 → 같은 수열(브라우저·Node·ES5 정적 페이지 어디서나 같다). 반환 함수가 0 이상 1 미만 수를 준다 */
export function createRng(seed: number): () => number {
    let a = seed >>> 0
    return () => {
        a = (a + 0x6d2b79f5) >>> 0
        let t = a
        t = Math.imul(t ^ (t >>> 15), t | 1)
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
}

/** 정수 두 개를 섞어 0 이상 1 미만 수 하나로(격자 꼭짓점 흔들기처럼 "칸마다 정해진 값"이 필요할 때) */
export function hash01(seed: number, a: number, b: number): number {
    let h = (seed ^ Math.imul(a + 1, 0x9e3779b1) ^ Math.imul(b + 1, 0x85ebca6b)) >>> 0
    h = Math.imul(h ^ (h >>> 16), 0x7feb352d)
    h = Math.imul(h ^ (h >>> 15), 0x846ca68b)
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}

export type Bbox = [number, number, number, number]

export function ringBbox(ring: ReadonlyArray<ReadonlyArray<number>>): Bbox {
    let minX = Infinity
    let minY = Infinity
    let maxX = -Infinity
    let maxY = -Infinity
    for (const p of ring) {
        if (p[0] < minX) minX = p[0]
        if (p[0] > maxX) maxX = p[0]
        if (p[1] < minY) minY = p[1]
        if (p[1] > maxY) maxY = p[1]
    }
    return [minX, minY, maxX, maxY]
}

export function bboxIntersects(a: Bbox, b: Bbox): boolean {
    return a[0] <= b[2] && a[2] >= b[0] && a[1] <= b[3] && a[3] >= b[1]
}

/** 점이 링(닫힌 좌표열) 안에 있나(짝홀 규칙) */
export function pointInRing(x: number, y: number, ring: ReadonlyArray<ReadonlyArray<number>>): boolean {
    let inside = false
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const xi = ring[i][0]
        const yi = ring[i][1]
        const xj = ring[j][0]
        const yj = ring[j][1]
        if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside
    }
    return inside
}

/** Polygon·MultiPolygon의 바깥 링들(구멍은 다루지 않는다 — 샘플 데이터에 없다) */
export function outerRings(geometry: GeoJsonObject | null | undefined): number[][][] {
    if (!geometry) return []
    const c = geometry.coordinates as unknown
    if (geometry.type === 'Polygon' && Array.isArray(c)) return [(c as number[][][])[0]]
    if (geometry.type === 'MultiPolygon' && Array.isArray(c)) return (c as number[][][][]).map(p => p[0])
    return []
}

/** Feature 하나의 geometry */
export function geometryOf(feature: GeoJsonObject): GeoJsonObject | null {
    if (feature.type === 'Feature') return (feature.geometry as GeoJsonObject | null) ?? null
    return feature
}

/** 모든 좌표를 훑어 범위를 구한다 */
export function geometryBbox(geometry: GeoJsonObject | null | undefined): Bbox | null {
    if (!geometry) return null
    let minX = Infinity
    let minY = Infinity
    let maxX = -Infinity
    let maxY = -Infinity
    const walk = (c: unknown): void => {
        if (!Array.isArray(c)) return
        if (typeof c[0] === 'number') {
            const p = c as number[]
            if (p[0] < minX) minX = p[0]
            if (p[0] > maxX) maxX = p[0]
            if (p[1] < minY) minY = p[1]
            if (p[1] > maxY) maxY = p[1]
            return
        }
        for (const x of c) walk(x)
    }
    walk(geometry.coordinates)
    return Number.isFinite(minX) ? [minX, minY, maxX, maxY] : null
}

/** 날짜시각을 UTC 'YYYY-MM-DDTHH:00:00'(시간대 표시 없음 — 바람 프레임 계약)로 */
export function utcHourIso(ms: number): string {
    const d = new Date(ms)
    const p = (n: number): string => (n < 10 ? '0' : '') + n
    return d.getUTCFullYear() + '-' + p(d.getUTCMonth() + 1) + '-' + p(d.getUTCDate()) + 'T' + p(d.getUTCHours()) + ':00:00'
}
