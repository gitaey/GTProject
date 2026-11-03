// 영역 분석의 공간 판정(순수 함수 — ol·DOM 없음). 좌표는 전부 "뷰 좌표계 평면"(화면에 그려진 모양 그대로)에서 다룬다.
//   · 영역 모델: 닫힌 링(반시계) + 볼록 조각(귀 자르기) + 사각형 여부
//   · 판정: 걸침(intersects) · 중심점(center) · 완전히 안(within)
// 링 = [[x, y], …](닫혀 있어도 열려 있어도 됨, 3번째 값 이후는 무시). 구멍 있는 면 = [바깥, 구멍…]

export type Ring = number[][]
export type Extent4 = [number, number, number, number]
export type SelectMode = 'intersects' | 'center' | 'within'

/** 영역(비볼록) 꼭짓점 상한 — 꼬임 검사·귀 자르기가 O(n²)이라 */
export const MAX_AREA_VERTICES = 5000

// ── 기본 기하 ────────────────────────────────────────────────────────────────

/** 평면 부호 있는 넓이(반시계 +) */
export function ringSignedArea(r: Ring): number {
    let s = 0
    for (let i = 0, j = r.length - 1; i < r.length; j = i++) s += (r[j][0] - r[i][0]) * (r[j][1] + r[i][1])
    return s / 2
}

export function ringBBox(r: Ring): Extent4 {
    let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity
    for (let i = 0; i < r.length; i++) {
        const x = r[i][0], y = r[i][1]
        if (x < a) a = x
        if (x > c) c = x
        if (y < b) b = y
        if (y > d) d = y
    }
    return [a, b, c, d]
}

export function bboxIntersects(a: Extent4, b: Extent4): boolean {
    return a[0] <= b[2] && a[2] >= b[0] && a[1] <= b[3] && a[3] >= b[1]
}

/** a가 b 안에 통째로(경계 포함) */
export function bboxInside(a: Extent4, b: Extent4): boolean {
    return a[0] >= b[0] && a[2] <= b[2] && a[1] >= b[1] && a[3] <= b[3]
}

/** 점이 링 안(짝홀 규칙). 경계 위는 정해지지 않는다 */
export function pointInRing(x: number, y: number, ring: Ring): boolean {
    let inside = false
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const xi = ring[i][0], yi = ring[i][1], xj = ring[j][0], yj = ring[j][1]
        if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside
    }
    return inside
}

/** 점이 면(바깥 링 안, 구멍 밖) 안 */
export function pointInPolygon(x: number, y: number, rings: Ring[]): boolean {
    if (!pointInRing(x, y, rings[0])) return false
    for (let i = 1; i < rings.length; i++) if (pointInRing(x, y, rings[i])) return false
    return true
}

function orient(ax: number, ay: number, bx: number, by: number, cx: number, cy: number): number {
    return (bx - ax) * (cy - ay) - (by - ay) * (cx - ax)
}

function onSegment(ax: number, ay: number, bx: number, by: number, px: number, py: number): boolean {
    return Math.min(ax, bx) <= px && px <= Math.max(ax, bx) && Math.min(ay, by) <= py && py <= Math.max(ay, by)
}

/** 선분 ab와 cd가 만나는가. proper = true면 서로 가로지르는 경우만(끝점이 닿기만 하면 아님) */
export function segmentsIntersect(
    ax: number, ay: number, bx: number, by: number, cx: number, cy: number, dx: number, dy: number, proper = false,
): boolean {
    const d1 = orient(cx, cy, dx, dy, ax, ay)
    const d2 = orient(cx, cy, dx, dy, bx, by)
    const d3 = orient(ax, ay, bx, by, cx, cy)
    const d4 = orient(ax, ay, bx, by, dx, dy)
    if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) return true
    if (proper) return false
    if (d1 === 0 && onSegment(cx, cy, dx, dy, ax, ay)) return true
    if (d2 === 0 && onSegment(cx, cy, dx, dy, bx, by)) return true
    if (d3 === 0 && onSegment(ax, ay, bx, by, cx, cy)) return true
    if (d4 === 0 && onSegment(ax, ay, bx, by, dx, dy)) return true
    return false
}

/** 폴리선(closed면 마지막→처음 변도)이 링의 어느 변과 만나는가. 선분 범위가 링 범위 밖이면 건너뛴다 */
export function pathCrossesRing(path: Ring, closed: boolean, ring: Ring, ringBox: Extent4, proper = false): boolean {
    const n = path.length
    const last = closed ? n : n - 1
    for (let i = 0; i < last; i++) {
        const a = path[i], b = path[(i + 1) % n]
        const ax = a[0], ay = a[1], bx = b[0], by = b[1]
        if (Math.max(ax, bx) < ringBox[0] || Math.min(ax, bx) > ringBox[2] || Math.max(ay, by) < ringBox[1] || Math.min(ay, by) > ringBox[3]) continue
        for (let j = 0, k = ring.length - 1; j < ring.length; k = j++) {
            const c = ring[k], d = ring[j]
            if (segmentsIntersect(ax, ay, bx, by, c[0], c[1], d[0], d[1], proper)) return true
        }
    }
    return false
}

/** 연속으로 겹친 점·닫는 점을 없앤 열린 링 */
export function openRing(r: Ring): Ring {
    const out: Ring = []
    for (const p of r) {
        const q = out[out.length - 1]
        if (q && q[0] === p[0] && q[1] === p[1]) continue
        out.push([p[0], p[1]])
    }
    while (out.length > 1 && out[0][0] === out[out.length - 1][0] && out[0][1] === out[out.length - 1][1]) out.pop()
    return out
}

export function closeRing(r: Ring): Ring {
    if (r.length === 0) return r
    const f = r[0], l = r[r.length - 1]
    return f[0] === l[0] && f[1] === l[1] ? r : [...r, [f[0], f[1]]]
}

/** 꼭짓점 순서를 원하는 방향으로(이미 맞으면 그대로) — ccw = 반시계 */
export function orientRing(r: Ring, ccw: boolean): Ring {
    const s = ringSignedArea(r)
    if (s === 0 || (s > 0) === ccw) return r
    return r.slice().reverse()
}

function isSimpleOpenRing(r: Ring): boolean {
    const n = r.length
    for (let i = 0; i < n; i++) {
        const a = r[i], b = r[(i + 1) % n]
        // 바로 이웃한 변이 같은 선 위에서 되돌아오는 뾰족한 모양
        const c = r[(i + 2) % n]
        if (orient(a[0], a[1], b[0], b[1], c[0], c[1]) === 0 && (b[0] - a[0]) * (c[0] - b[0]) + (b[1] - a[1]) * (c[1] - b[1]) < 0) return false
        for (let j = i + 2; j < n; j++) {
            if (i === 0 && j === n - 1) continue
            const d = r[j], e = r[(j + 1) % n]
            if (segmentsIntersect(a[0], a[1], b[0], b[1], d[0], d[1], e[0], e[1])) return false
        }
    }
    return true
}

function allCollinear(r: Ring): boolean {
    for (let i = 2; i < r.length; i++) if (orient(r[0][0], r[0][1], r[1][0], r[1][1], r[i][0], r[i][1]) !== 0) return false
    return true
}

function isConvexCcw(r: Ring): boolean {
    const n = r.length
    for (let i = 0; i < n; i++) {
        const a = r[i], b = r[(i + 1) % n], c = r[(i + 2) % n]
        if (orient(a[0], a[1], b[0], b[1], c[0], c[1]) < 0) return false
    }
    return true
}

function pointInTriangleInclusive(p: number[], a: number[], b: number[], c: number[]): boolean {
    const d1 = orient(a[0], a[1], b[0], b[1], p[0], p[1])
    const d2 = orient(b[0], b[1], c[0], c[1], p[0], p[1])
    const d3 = orient(c[0], c[1], a[0], a[1], p[0], p[1])
    return d1 >= 0 && d2 >= 0 && d3 >= 0
}

const samePoint = (p: number[], q: number[]): boolean => p[0] === q[0] && p[1] === q[1]

/** 귀 자르기 삼각 분할(열린·반시계·꼬이지 않은 링). 실패하면 null */
export function earClip(ring: Ring): Ring[] | null {
    const idx: number[] = ring.map((_, i) => i)
    const tris: Ring[] = []
    let k = 0
    while (idx.length > 3) {
        const m = idx.length
        let found = false
        for (let step = 0; step < m; step++, k++) {
            if (k >= idx.length) k = 0
            const ia = idx[(k + idx.length - 1) % idx.length], ib = idx[k], ic = idx[(k + 1) % idx.length]
            const a = ring[ia], b = ring[ib], c = ring[ic]
            const cr = orient(a[0], a[1], b[0], b[1], c[0], c[1])
            if (cr === 0) {
                // 일직선 위의 꼭짓점은 모양을 바꾸지 않고 뺀다
                idx.splice(k, 1)
                found = true
                break
            }
            if (cr < 0) continue
            let ear = true
            for (let t = 0; t < idx.length; t++) {
                const ip = idx[t]
                if (ip === ia || ip === ib || ip === ic) continue
                const p = ring[ip]
                if (samePoint(p, a) || samePoint(p, b) || samePoint(p, c)) continue
                if (pointInTriangleInclusive(p, a, b, c)) { ear = false; break }
            }
            if (!ear) continue
            tris.push([a, b, c])
            idx.splice(k, 1)
            found = true
            break
        }
        if (!found) return null
    }
    if (idx.length === 3) {
        const a = ring[idx[0]], b = ring[idx[1]], c = ring[idx[2]]
        if (orient(a[0], a[1], b[0], b[1], c[0], c[1]) > 0) tris.push([a, b, c])
    }
    return tris
}

// ── 영역 모델 ────────────────────────────────────────────────────────────────

export interface AreaModel {
    /** 닫힌 링(반시계) */
    ring: Ring
    bbox: Extent4
    /** 볼록 조각들(반시계, 열린 링). 볼록 영역이면 영역 자신 하나 */
    pieces: Ring[]
    convex: boolean
    /** 축에 나란한 사각형(점 판정이 범위 비교로 끝난다) */
    rect: boolean
    vertices: number
}

export type AreaCheck =
    | { ok: true; model: AreaModel }
    | { ok: false; reason: 'BAD' | 'FEW' | 'ZERO' | 'SELF' | 'MANY' }

export const AREA_REASON_TEXT: Readonly<Record<string, string>> = Object.freeze({
    BAD: '좌표를 읽을 수 없습니다.',
    FEW: '꼭짓점이 3개 이상이어야 합니다.',
    ZERO: '넓이가 없는 영역입니다.',
    SELF: '선이 서로 꼬여 있습니다. 선이 겹치지 않게 다시 그려 주세요.',
    MANY: '꼭짓점이 너무 많습니다(최대 ' + MAX_AREA_VERTICES + '개).',
})

export function buildAreaModel(input: Ring): AreaCheck {
    for (const p of input) {
        if (!p || !Number.isFinite(p[0]) || !Number.isFinite(p[1])) return { ok: false, reason: 'BAD' }
    }
    const open = openRing(input)
    if (open.length < 3) return { ok: false, reason: 'FEW' }
    if (open.length > MAX_AREA_VERTICES) return { ok: false, reason: 'MANY' }
    const s = ringSignedArea(open)
    const ccw = orientRing(open, true)
    // 나비넥타이처럼 꼬이면 부호 있는 넓이가 0이 될 수도 있으므로 꼬임을 먼저 본다(한 줄 위의 점들은 '넓이 없음')
    if (!isSimpleOpenRing(ccw)) return { ok: false, reason: allCollinear(open) ? 'ZERO' : 'SELF' }
    const bb = ringBBox(open)
    // 넓이 없음 판정은 범위 대비 비율로(뷰 좌표계가 미터든 도(°)든 같게)
    if (!(Math.abs(s) > 1e-12 * (bb[2] - bb[0]) * (bb[3] - bb[1]))) return { ok: false, reason: 'ZERO' }
    const convex = isConvexCcw(ccw)
    let pieces: Ring[]
    if (convex) pieces = [ccw]
    else {
        const tris = earClip(ccw)
        if (!tris || tris.length === 0) return { ok: false, reason: 'SELF' }
        pieces = tris
    }
    const bbox = ringBBox(ccw)
    let rect = false
    if (ccw.length === 4) {
        rect = ccw.every(p => (p[0] === bbox[0] || p[0] === bbox[2]) && (p[1] === bbox[1] || p[1] === bbox[3])) &&
            new Set(ccw.map(p => p[0] + ',' + p[1])).size === 4
    }
    return { ok: true, model: { ring: closeRing(ccw), bbox, pieces, convex, rect, vertices: ccw.length } }
}

/** 점이 영역 안 */
export function inArea(area: AreaModel, x: number, y: number): boolean {
    const b = area.bbox
    if (x < b[0] || x > b[2] || y < b[1] || y > b[3]) return false
    return area.rect ? true : pointInRing(x, y, area.ring)
}

// ── 피처 모양 읽기 ───────────────────────────────────────────────────────────

/** ol 지오메트리가 구조적으로 맞는 최소 모양(이 파일은 ol을 가져오지 않는다) */
export interface GeomLike {
    getType(): string
    getCoordinates?(): unknown
    getGeometries?(): GeomLike[]
}

export interface GeomParts {
    /** 면 = [바깥, 구멍…] */
    polygons: Ring[][]
    lines: Ring[]
    points: number[][]
    bbox: Extent4 | null
}

const EMPTY_PARTS: GeomParts = Object.freeze({ polygons: [], lines: [], points: [], bbox: null }) as GeomParts

function extendBox(box: Extent4 | null, x: number, y: number): Extent4 {
    if (!box) return [x, y, x, y]
    if (x < box[0]) box[0] = x
    if (x > box[2]) box[2] = x
    if (y < box[1]) box[1] = y
    if (y > box[3]) box[3] = y
    return box
}

function collect(g: GeomLike, parts: GeomParts, depth: number): void {
    const t = g.getType()
    if (t === 'GeometryCollection') {
        if (depth < 4 && g.getGeometries) for (const c of g.getGeometries()) collect(c, parts, depth + 1)
        return
    }
    const coords = g.getCoordinates ? g.getCoordinates() : null
    if (!Array.isArray(coords)) return
    const eat = (r: number[][]): void => { for (const p of r) parts.bbox = extendBox(parts.bbox, p[0], p[1]) }
    switch (t) {
        case 'Point': {
            const p = coords as number[]
            if (p.length >= 2) { parts.points.push(p); parts.bbox = extendBox(parts.bbox, p[0], p[1]) }
            break
        }
        case 'MultiPoint':
            for (const p of coords as number[][]) { parts.points.push(p); parts.bbox = extendBox(parts.bbox, p[0], p[1]) }
            break
        case 'LineString':
        case 'LinearRing':
            if ((coords as number[][]).length > 0) { parts.lines.push(coords as number[][]); eat(coords as number[][]) }
            break
        case 'MultiLineString':
            for (const l of coords as number[][][]) if (l.length > 0) { parts.lines.push(l); eat(l) }
            break
        case 'Polygon': {
            const rings = coords as number[][][]
            if (rings.length > 0 && rings[0].length > 0) { parts.polygons.push(rings); eat(rings[0]) }
            break
        }
        case 'MultiPolygon':
            for (const rings of coords as number[][][][]) if (rings.length > 0 && rings[0].length > 0) { parts.polygons.push(rings); eat(rings[0]) }
            break
        default:
            break
    }
}

/** 지오메트리를 면·선·점 조각으로 나눈다(없거나 못 읽으면 빈 조각) */
export function geomParts(g: GeomLike | null | undefined): GeomParts {
    if (!g) return EMPTY_PARTS
    const parts: GeomParts = { polygons: [], lines: [], points: [], bbox: null }
    collect(g, parts, 0)
    return parts.bbox ? parts : EMPTY_PARTS
}

export function partsKind(p: GeomParts): 'polygon' | 'line' | 'point' | 'empty' {
    return p.polygons.length > 0 ? 'polygon' : p.lines.length > 0 ? 'line' : p.points.length > 0 ? 'point' : 'empty'
}

// ── 판정 ─────────────────────────────────────────────────────────────────────

/** 면의 바깥 링이 영역 안에 통째로 있는가(경계에 닿는 것은 안) */
export function polygonWithinArea(rings: Ring[], area: AreaModel): boolean {
    const outer = rings[0]
    if (area.rect) return bboxInside(ringBBox(outer), area.bbox)
    for (let i = 0; i < outer.length; i++) if (!inArea(area, outer[i][0], outer[i][1])) return false
    return area.convex || !pathCrossesRing(outer, true, area.ring, area.bbox, true)
}

function polygonIntersectsArea(rings: Ring[], area: AreaModel): boolean {
    const outer = rings[0]
    const pb = ringBBox(outer)
    if (!bboxIntersects(pb, area.bbox)) return false
    if (area.rect && bboxInside(pb, area.bbox)) return true
    for (let i = 0; i < outer.length; i++) if (inArea(area, outer[i][0], outer[i][1])) return true
    for (const r of rings) if (pathCrossesRing(r, true, area.ring, area.bbox)) return true
    const v = area.ring[0]
    return pointInPolygon(v[0], v[1], rings)
}

function lineIntersectsArea(line: Ring, area: AreaModel): boolean {
    for (let i = 0; i < line.length; i++) if (inArea(area, line[i][0], line[i][1])) return true
    return pathCrossesRing(line, false, area.ring, area.bbox)
}

function lineWithinArea(line: Ring, area: AreaModel): boolean {
    for (let i = 0; i < line.length; i++) if (!inArea(area, line[i][0], line[i][1])) return false
    return area.convex || !pathCrossesRing(line, false, area.ring, area.bbox, true)
}

/** 걸침: 피처의 어느 한 조각이라도 영역과 만난다 */
export function partsIntersect(p: GeomParts, area: AreaModel): boolean {
    if (!p.bbox || !bboxIntersects(p.bbox, area.bbox)) return false
    for (const pt of p.points) if (inArea(area, pt[0], pt[1])) return true
    for (const l of p.lines) if (lineIntersectsArea(l, area)) return true
    for (const poly of p.polygons) if (polygonIntersectsArea(poly, area)) return true
    return false
}

/** 완전히 안: 모든 조각이 영역 안에 있다(조각이 하나도 없으면 false) */
export function partsWithin(p: GeomParts, area: AreaModel): boolean {
    if (!p.bbox) return false
    if (area.rect) return bboxInside(p.bbox, area.bbox)
    if (!bboxInside(p.bbox, area.bbox)) return false
    for (const pt of p.points) if (!inArea(area, pt[0], pt[1])) return false
    for (const l of p.lines) if (!lineWithinArea(l, area)) return false
    for (const poly of p.polygons) if (!polygonWithinArea(poly, area)) return false
    return true
}

/** 면 바깥 링의 무게중심(평면) */
function ringCentroid(r: Ring): number[] {
    // 첫 꼭짓점을 원점으로 옮겨 계산한다(뷰 좌표가 1e7대라 그대로 곱하면 자릿수 상쇄로 무게중심이 수 m 어긋난다)
    const ox = r[0][0], oy = r[0][1]
    let a = 0, cx = 0, cy = 0
    for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
        const xj = r[j][0] - ox, yj = r[j][1] - oy, xi = r[i][0] - ox, yi = r[i][1] - oy
        const f = xj * yi - xi * yj
        a += f
        cx += (xj + xi) * f
        cy += (yj + yi) * f
    }
    if (a === 0) return [ox, oy]
    return [ox + cx / (3 * a), oy + cy / (3 * a)]
}

/** 면 안쪽의 점: 무게중심이 면 안이면 그 점, 오목해서 밖이면 같은 높이에서 가장 넓은 안쪽 구간의 가운데 */
export function interiorPoint(rings: Ring[]): number[] {
    const c = ringCentroid(rings[0])
    if (pointInPolygon(c[0], c[1], rings)) return c
    const y = c[1]
    const xs: number[] = []
    for (const r of rings) {
        for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
            const yi = r[i][1], yj = r[j][1]
            if ((yi > y) !== (yj > y)) xs.push(((r[j][0] - r[i][0]) * (y - yi)) / (yj - yi) + r[i][0])
        }
    }
    xs.sort((p, q) => p - q)
    let best = -1, bx = rings[0][0][0]
    for (let i = 0; i + 1 < xs.length; i += 2) {
        if (xs[i + 1] - xs[i] > best) { best = xs[i + 1] - xs[i]; bx = (xs[i] + xs[i + 1]) / 2 }
    }
    return [bx, y]
}

function lineMidpoint(line: Ring): number[] {
    let total = 0
    for (let i = 1; i < line.length; i++) total += Math.hypot(line[i][0] - line[i - 1][0], line[i][1] - line[i - 1][1])
    if (total === 0) return [line[0][0], line[0][1]]
    let half = total / 2
    for (let i = 1; i < line.length; i++) {
        const d = Math.hypot(line[i][0] - line[i - 1][0], line[i][1] - line[i - 1][1])
        if (half <= d && d > 0) {
            const t = half / d
            return [line[i - 1][0] + (line[i][0] - line[i - 1][0]) * t, line[i - 1][1] + (line[i][1] - line[i - 1][1]) * t]
        }
        half -= d
    }
    const l = line[line.length - 1]
    return [l[0], l[1]]
}

/** 중심점 기준에 쓰는 대표점: 가장 넓은 면의 안쪽 점 → 가장 긴 선의 가운데 → 첫 점 */
export function representativePoint(p: GeomParts): number[] | null {
    if (p.polygons.length > 0) {
        let best = p.polygons[0], bestA = -1
        for (const poly of p.polygons) {
            const a = Math.abs(ringSignedArea(poly[0]))
            if (a > bestA) { bestA = a; best = poly }
        }
        return interiorPoint(best)
    }
    if (p.lines.length > 0) {
        let best = p.lines[0], bestL = -1
        for (const l of p.lines) {
            let len = 0
            for (let i = 1; i < l.length; i++) len += Math.hypot(l[i][0] - l[i - 1][0], l[i][1] - l[i - 1][1])
            if (len > bestL) { bestL = len; best = l }
        }
        return lineMidpoint(best)
    }
    if (p.points.length > 0) return p.points[0]
    return null
}

export function partsCenterIn(p: GeomParts, area: AreaModel): boolean {
    const c = representativePoint(p)
    return !!c && inArea(area, c[0], c[1])
}

export function selectParts(p: GeomParts, area: AreaModel, mode: SelectMode): boolean {
    if (!p.bbox) return false
    if (mode === 'within') return partsWithin(p, area)
    if (mode === 'center') return partsCenterIn(p, area)
    return partsIntersect(p, area)
}
