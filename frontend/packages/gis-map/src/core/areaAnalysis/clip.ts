// 잘라낸 면적(영역 ∩ 피처 면적) 계산(순수 함수 — ol 없음, 의존성 없음).
//   방법: 영역을 볼록 조각으로 나누고(spatial.buildAreaModel — 사각형·원·화면은 이미 볼록, 다각형만 귀 자르기),
//   피처의 각 링(바깥·구멍)을 각 조각에 Sutherland–Hodgman으로 자른 뒤, 링 방향을 맞춰(바깥 반시계 +, 구멍 시계 −)
//   부호 있는 구면 면적을 더한다. 볼록 영역에 대한 SH는 피처가 오목해도 결과 링의 부호 있는 면적이 교집합 면적과 같다
//   (경계를 따라 생기는 폭 0 간선은 앞뒤로 같은 길이라 구면 합에서도 정확히 0).
//   면적 공식은 ol/sphere getArea와 같다(Chamberlain–Duquette, 반지름 6,371,008.8 m) — 면적 측정 도구와 값이 맞는다.
import { bboxInside, bboxIntersects, orientRing, polygonWithinArea, ringBBox } from './spatial'
import type { AreaModel, Ring } from './spatial'

export const EARTH_RADIUS_M = 6371008.8

/** 평면 좌표(뷰 좌표계)의 [x,y,x,y,…] 평탄 배열 → 경위도 평탄 배열. 호출자가 ol getTransform(뷰, 'EPSG:4326')로 만든다 */
export type ToLonLat = (flatXY: number[]) => number[]

const rad = (d: number): number => (d * Math.PI) / 180

function flatten(r: Ring): number[] {
    const out = new Array<number>(r.length * 2)
    for (let i = 0; i < r.length; i++) { out[2 * i] = r[i][0]; out[2 * i + 1] = r[i][1] }
    return out
}

/** 경위도 평탄 링의 부호 있는 구면 면적(㎡). 반시계 +, 시계 −. 링은 열려 있어도 닫혀 있어도 된다 */
export function signedSphericalAreaM2(lonLat: number[], radius = EARTH_RADIUS_M): number {
    const n = lonLat.length / 2
    if (n < 3) return 0
    let sum = 0
    let x1 = lonLat[2 * (n - 1)], y1 = lonLat[2 * (n - 1) + 1]
    for (let i = 0; i < n; i++) {
        const x2 = lonLat[2 * i], y2 = lonLat[2 * i + 1]
        sum += rad(x2 - x1) * (2 + Math.sin(rad(y1)) + Math.sin(rad(y2)))
        x1 = x2
        y1 = y2
    }
    return (-sum * radius * radius) / 2
}

/** 면(바깥 − 구멍)의 지상 면적(㎡) — ol/sphere getArea(폴리곤, {projection})과 같은 값 */
export function polygonAreaM2(rings: Ring[], toLonLat: ToLonLat): number {
    let a = Math.abs(signedSphericalAreaM2(toLonLat(flatten(rings[0]))))
    for (let i = 1; i < rings.length; i++) a -= Math.abs(signedSphericalAreaM2(toLonLat(flatten(rings[i]))))
    return a
}

/** 경위도 평탄 폴리선의 길이(m) — ol/sphere getLength와 같은 하버사인 */
export function lineLengthM(lonLat: number[], radius = EARTH_RADIUS_M): number {
    const n = lonLat.length / 2
    let len = 0
    for (let i = 1; i < n; i++) {
        const lat1 = rad(lonLat[2 * (i - 1) + 1]), lat2 = rad(lonLat[2 * i + 1])
        const dLat = (lat2 - lat1) / 2
        const dLon = (rad(lonLat[2 * i]) - rad(lonLat[2 * (i - 1)])) / 2
        const a = Math.sin(dLat) * Math.sin(dLat) + Math.sin(dLon) * Math.sin(dLon) * Math.cos(lat1) * Math.cos(lat2)
        len += 2 * radius * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
    }
    return len
}

/** 볼록 조각(반시계)의 한쪽 반평면으로 피처 링을 자른다(Sutherland–Hodgman 한 단계) */
function clipByEdge(subject: Ring, ax: number, ay: number, bx: number, by: number): Ring {
    const out: Ring = []
    const n = subject.length
    if (n === 0) return out
    let prev = subject[n - 1]
    let prevSide = (bx - ax) * (prev[1] - ay) - (by - ay) * (prev[0] - ax)
    for (let i = 0; i < n; i++) {
        const cur = subject[i]
        const side = (bx - ax) * (cur[1] - ay) - (by - ay) * (cur[0] - ax)
        if (side >= 0) {
            if (prevSide < 0) out.push(cross(prev, cur, prevSide, side))
            out.push(cur)
        } else if (prevSide >= 0) {
            out.push(cross(prev, cur, prevSide, side))
        }
        prev = cur
        prevSide = side
    }
    return out
}

function cross(p: number[], q: number[], sp: number, sq: number): number[] {
    const t = sp / (sp - sq)
    return [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]
}

/** 피처 링(방향 상관없음)을 볼록 조각 하나로 자른 결과 링(부호 있는 면적 계산용). 비면 [] */
export function clipRingToPiece(ring: Ring, piece: Ring): Ring {
    let cur: Ring = ring
    const m = piece.length
    for (let i = 0; i < m && cur.length > 0; i++) {
        const a = piece[i], b = piece[(i + 1) % m]
        cur = clipByEdge(cur, a[0], a[1], b[0], b[1])
    }
    return cur
}

/**
 * 면 하나(바깥+구멍)와 영역의 교집합 면적(㎡).
 * 빠른 길: 범위가 안 겹치면 0, 통째로 안이면 피처 면적. 결과는 0 이상·피처 면적 이하로 맞춘다.
 */
export function clipPolygonAreaM2(rings: Ring[], area: AreaModel, toLonLat: ToLonLat, featureAreaM2?: number): number {
    const outer = rings[0]
    const pb = ringBBox(outer)
    if (!bboxIntersects(pb, area.bbox)) return 0
    const full = featureAreaM2 ?? polygonAreaM2(rings, toLonLat)
    if ((area.rect && bboxInside(pb, area.bbox)) || polygonWithinArea(rings, area)) return full
    const oriented = rings.map((r, i) => orientRing(r, i === 0))
    let total = 0
    for (const piece of area.pieces) {
        for (const r of oriented) {
            const clipped = clipRingToPiece(r, piece)
            if (clipped.length >= 3) total += signedSphericalAreaM2(toLonLat(flatten(clipped)))
        }
    }
    if (!(total > 0)) return 0
    return total > full ? full : total
}
