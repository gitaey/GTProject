// 나만의지도 격자 묶음(클러스터). 화면 안 피처가 너무 많으면 본 레이어 대신 "원 + 숫자"로 묶어 그린다.
//   · 본 VectorLayer·VectorSource는 건드리지 않는다 — 묶음 레이어(작은 VectorSource)를 따로 덧붙이고 본 레이어만 숨긴다(스타일 대화상자·속성 표·범위 이동·출력 그대로)
//   · 묶는 법: 현재 줌의 격자(칸 = cellPx × 그 줌 해상도). 피처 위치 = 도형 범위 한가운데. 줌별 결과(typed array)는 레이어 인스턴스가 최근 3개만 기억한다
//   · 이 파일은 순수 함수(설정 해석·종류 세기·격자·가시 칸·대표 색·글자)와 OL를 만지는 MyMapClusterView 하나. 모듈 전역 상태 없음
import Feature from 'ol/Feature'
import Point from 'ol/geom/Point'
import VectorLayer from 'ol/layer/Vector'
import VectorSource from 'ol/source/Vector'
import type Geometry from 'ol/geom/Geometry'
import type { Extent } from 'ol/extent'
import type { StyleLike } from 'ol/style/Style'

/** 묶음 설정(모든 값 선택). 없는 값은 기본값 */
export interface GisMapMyMapClusterConfig {
    /** 레이어 피처 수가 이 값 이하면 묶음을 검토하지 않는다. 기본 5000 */
    minFeatures?: number
    /** 화면 안 점이 이 값을 넘으면 묶는다. 기본 5000 */
    pointViewLimit?: number
    /** 화면 안 면이 이 값을 넘으면 묶는다. 기본 20000. null이면 면은 묶지 않는다 */
    areaViewLimit?: number | null
    /** 격자 한 칸의 화면 크기(px). 기본 60 */
    cellPx?: number
    /** 이 줌 이상에서는 항상 원래 모양. 기본 17 */
    maxZoom?: number
}

/** 나만의지도 엔진 설정(`config.myMap`) */
export interface GisMapMyMapConfig {
    /** false면 묶음을 끈다 */
    cluster?: false | GisMapMyMapClusterConfig
    /** GeoJSON 피처 변환을 한 번에 이 시간(ms)만 하고 화면에 양보한다. 기본 12 */
    loadChunkMs?: number
}

export interface ResolvedMyMapClusterConfig {
    minFeatures: number
    pointViewLimit: number
    areaViewLimit: number | null
    cellPx: number
    maxZoom: number
}

export const DEFAULT_MYMAP_CLUSTER: Readonly<ResolvedMyMapClusterConfig> = Object.freeze({
    minFeatures: 5000, pointViewLimit: 5000, areaViewLimit: 20000, cellPx: 60, maxZoom: 17,
})
export const DEFAULT_MYMAP_LOAD_CHUNK_MS = 12
/** 켜진 묶음을 끄는 기준 = 기준값의 이 비율(깜빡임 방지) */
export const CLUSTER_OFF_RATIO = 0.8
/** 줌별 격자 결과를 기억하는 개수 */
const GRID_CACHE_MAX = 3

function num(v: unknown, fallback: number, min: number, max = Number.POSITIVE_INFINITY): number {
    return typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max ? v : fallback
}

/** 설정 → 기본값을 채운 묶음 설정. 끄면 null. 잘못된 값(음수·NaN·문자)은 그 항목만 기본값 */
export function resolveMyMapCluster(cfg?: GisMapMyMapConfig): ResolvedMyMapClusterConfig | null {
    const c = cfg?.cluster
    if (c === false) return null
    const d = DEFAULT_MYMAP_CLUSTER
    return {
        minFeatures: num(c?.minFeatures, d.minFeatures, 0),
        pointViewLimit: num(c?.pointViewLimit, d.pointViewLimit, 1),
        areaViewLimit: c?.areaViewLimit === null ? null : num(c?.areaViewLimit, d.areaViewLimit as number, 1),
        cellPx: num(c?.cellPx, d.cellPx, 10, 400),
        maxZoom: num(c?.maxZoom, d.maxZoom, 0, 40),
    }
}

export function resolveLoadChunkMs(cfg?: GisMapMyMapConfig): number {
    return num(cfg?.loadChunkMs, DEFAULT_MYMAP_LOAD_CHUNK_MS, 1)
}

// ── 종류·세기 ─────────────────────────────────────────────────────────────

export type GeomKind = 'point' | 'area' | 'other'

export interface KindCounts {
    point: number
    area: number
    other: number
}

/** 점·멀티점 = point, 면·멀티면 = area, 선·모음 = other, 모양 없음 = null */
export function geomKindOf(g: Geometry | null | undefined): GeomKind | null {
    if (!g) return null
    switch (g.getType()) {
        case 'Point':
        case 'MultiPoint':
            return 'point'
        case 'Polygon':
        case 'MultiPolygon':
            return 'area'
        default:
            return 'other'
    }
}

export function emptyKindCounts(): KindCounts {
    return { point: 0, area: 0, other: 0 }
}

/** 이 레이어를 묶을 수 있는가: 선·모음이 하나도 없고, 면은 (점으로 표시 중이거나 면 기준이 켜져 있을 때만) */
export function isClusterable(k: Readonly<KindCounts>, cfg: ResolvedMyMapClusterConfig, areaAsPoint: boolean): boolean {
    if (k.other > 0 || k.point + k.area === 0) return false
    if (k.area > 0 && !areaAsPoint && cfg.areaViewLimit === null) return false
    return true
}

/**
 * 화면 범위 안 피처 수가 기준을 넘는가(넘는 순간 세기를 멈춘다). factor 1 = 켤 때, 0.8 = 켜진 것을 유지할 때.
 * 점(과 "점으로 표시" 중인 면)은 pointViewLimit, 면은 areaViewLimit
 */
export function viewCountExceeds(
    source: VectorSource<Feature<Geometry>>, extent: Extent, cfg: ResolvedMyMapClusterConfig, areaAsPoint: boolean, factor: number,
): boolean {
    const pointLimit = Math.floor(cfg.pointViewLimit * factor)
    const areaLimit = cfg.areaViewLimit === null ? Number.POSITIVE_INFINITY : Math.floor(cfg.areaViewLimit * factor)
    let points = 0
    let areas = 0
    const hit = source.forEachFeatureInExtent(extent, f => {
        const kind = geomKindOf(f.getGeometry())
        if (kind === 'point' || (kind === 'area' && areaAsPoint)) {
            if (++points > pointLimit) return true
        } else if (kind === 'area') {
            if (++areas > areaLimit) return true
        }
        return undefined
    })
    return hit === true
}

// ── 격자 ──────────────────────────────────────────────────────────────────

/** 피처 순서대로의 대표 위치(도형 범위 한가운데). 모양이 없거나 좌표가 깨졌으면 NaN */
export interface Centers {
    xs: Float64Array
    ys: Float64Array
}

export function centersOf(features: readonly Feature<Geometry>[]): Centers {
    const n = features.length
    const xs = new Float64Array(n)
    const ys = new Float64Array(n)
    for (let i = 0; i < n; i++) {
        const g = features[i].getGeometry()
        if (!g) {
            xs[i] = NaN
            ys[i] = NaN
            continue
        }
        const e = g.getExtent()
        const x = (e[0] + e[2]) / 2
        const y = (e[1] + e[3]) / 2
        if (Number.isFinite(x) && Number.isFinite(y)) {
            xs[i] = x
            ys[i] = y
        } else {
            xs[i] = NaN
            ys[i] = NaN
        }
    }
    return { xs, ys }
}

/** 칸마다 개수·평균 위치·범위(멤버 위치의 범위)와 멤버 목록(order[start[c]..start[c+1]) = 피처 번호) */
export interface GridResult {
    cellSize: number
    cells: number
    order: Int32Array
    start: Int32Array
    cx: Float64Array
    cy: Float64Array
    minX: Float64Array
    minY: Float64Array
    maxX: Float64Array
    maxY: Float64Array
}

const CELL_OFFSET = 33554432 // 2^25
const CELL_STRIDE = 67108864 // 2^26

function cellCoord(v: number, cellSize: number): number {
    const c = Math.floor(v / cellSize)
    return c < -CELL_OFFSET ? -CELL_OFFSET : c >= CELL_OFFSET ? CELL_OFFSET - 1 : c
}

/** 위치(NaN 제외)를 cellSize 격자에 담는다. 한 번 훑고(O(n)) 칸별로 모은다 */
export function gridCluster(centers: Centers, cellSize: number): GridResult {
    const { xs, ys } = centers
    const n = xs.length
    const ids = new Map<number, number>()
    const cellOf = new Int32Array(n)
    const cnt = new Int32Array(n)
    const sx = new Float64Array(n)
    const sy = new Float64Array(n)
    const mnx = new Float64Array(n)
    const mny = new Float64Array(n)
    const mxx = new Float64Array(n)
    const mxy = new Float64Array(n)
    let cells = 0
    let members = 0
    for (let i = 0; i < n; i++) {
        const x = xs[i]
        const y = ys[i]
        if (x !== x || y !== y) {
            cellOf[i] = -1
            continue
        }
        const key = (cellCoord(x, cellSize) + CELL_OFFSET) * CELL_STRIDE + (cellCoord(y, cellSize) + CELL_OFFSET)
        let c = ids.get(key)
        if (c === undefined) {
            c = cells++
            ids.set(key, c)
            mnx[c] = x
            mxx[c] = x
            mny[c] = y
            mxy[c] = y
        } else {
            if (x < mnx[c]) mnx[c] = x
            else if (x > mxx[c]) mxx[c] = x
            if (y < mny[c]) mny[c] = y
            else if (y > mxy[c]) mxy[c] = y
        }
        cellOf[i] = c
        cnt[c]++
        sx[c] += x
        sy[c] += y
        members++
    }
    const start = new Int32Array(cells + 1)
    for (let c = 0; c < cells; c++) start[c + 1] = start[c] + cnt[c]
    const fill = start.slice(0, cells)
    const order = new Int32Array(members)
    for (let i = 0; i < n; i++) {
        const c = cellOf[i]
        if (c >= 0) order[fill[c]++] = i
    }
    const cx = new Float64Array(cells)
    const cy = new Float64Array(cells)
    for (let c = 0; c < cells; c++) {
        cx[c] = sx[c] / cnt[c]
        cy[c] = sy[c] / cnt[c]
    }
    return {
        cellSize, cells, order, start, cx, cy,
        minX: mnx.slice(0, cells), minY: mny.slice(0, cells), maxX: mxx.slice(0, cells), maxY: mxy.slice(0, cells),
    }
}

/** 평균 위치가 (extent를 한 칸만큼 넓힌 범위) 안에 있는 칸 번호들 — 가장자리에 걸친 원도 그려지게 */
export function visibleCells(g: GridResult, extent: Extent): number[] {
    const pad = g.cellSize
    const x0 = extent[0] - pad
    const y0 = extent[1] - pad
    const x1 = extent[2] + pad
    const y1 = extent[3] + pad
    const out: number[] = []
    for (let c = 0; c < g.cells; c++) {
        const x = g.cx[c]
        const y = g.cy[c]
        if (x >= x0 && x <= x1 && y >= y0 && y <= y1) out.push(c)
    }
    return out
}

export interface DominantColor {
    color: string
    /** 칸 안에 색이 둘 이상 섞여 있다 */
    mixed: boolean
}

/** 칸 멤버들의 색 중 가장 많은 것(같은 수면 먼저 나온 것). 색이 하나뿐이면 mixed false */
export function dominantColor(order: Int32Array, from: number, to: number, colorOf: (index: number) => string): DominantColor {
    const first = colorOf(order[from])
    let same = 1
    let tally: Map<string, number> | null = null
    for (let k = from + 1; k < to; k++) {
        const c = colorOf(order[k])
        if (!tally) {
            if (c === first) {
                same++
                continue
            }
            tally = new Map<string, number>([[first, same]])
        }
        tally.set(c, (tally.get(c) ?? 0) + 1)
    }
    if (!tally) return { color: first, mixed: false }
    let best = first
    let bestN = -1
    tally.forEach((n, c) => {
        if (n > bestN) {
            best = c
            bestN = n
        }
    })
    return { color: best, mixed: true }
}

// ── 줌 단계 ───────────────────────────────────────────────────────────────

/** 줌(= 해상도)을 정수 단계로 맞춘 격자 키. 같은 키면 같은 격자 */
export interface ClusterScale {
    key: number
    resolution: number
}

// ── OL 묶음 레이어 ────────────────────────────────────────────────────────

export interface ClusterViewOptions {
    features: readonly Feature<Geometry>[]
    cfg: ResolvedMyMapClusterConfig
    zIndex: number
    className: string
    style: StyleLike
}

/** 묶음 원 피처의 속성 이름(스타일 함수가 읽는다) */
export const CLUSTER_PROP = Object.freeze({ count: 'count', color: 'color', mixed: 'mixed', extent: 'extent', orig: 'orig' })

/** 한 레이어의 묶음 레이어(OL 레이어 + 줌별 격자 기억). 인스턴스 필드만 쓴다 */
export class MyMapClusterView {
    readonly layer: VectorLayer<Feature<Geometry>>
    private readonly source: VectorSource<Feature<Geometry>>
    private readonly features: readonly Feature<Geometry>[]
    private readonly cfg: ResolvedMyMapClusterConfig
    private centers: Centers | null = null
    private readonly grids = new Map<number, GridResult>()

    constructor(o: ClusterViewOptions) {
        this.features = o.features
        this.cfg = o.cfg
        this.source = new VectorSource<Feature<Geometry>>()
        this.layer = new VectorLayer<Feature<Geometry>>({ source: this.source, zIndex: o.zIndex, className: o.className, style: o.style, visible: false })
    }

    setStyle(style: StyleLike): void {
        this.layer.setStyle(style)
    }

    private gridFor(scale: ClusterScale): GridResult {
        const hit = this.grids.get(scale.key)
        if (hit) return hit
        if (!this.centers) this.centers = centersOf(this.features)
        const grid = gridCluster(this.centers, this.cfg.cellPx * scale.resolution)
        this.grids.set(scale.key, grid)
        while (this.grids.size > GRID_CACHE_MAX) {
            const oldest = this.grids.keys().next().value
            if (oldest === undefined) break
            this.grids.delete(oldest)
        }
        return grid
    }

    /**
     * 화면 범위의 묶음 원을 다시 만든다. colorOf가 있으면(범주·구간 스타일) 칸마다 가장 많은 색을 정하고 섞임을 표시한다.
     * 돌려주는 값 = 만든 원 개수
     */
    update(extent: Extent, scale: ClusterScale, colorOf: ((feature: Feature<Geometry>) => string) | null): number {
        const grid = this.gridFor(scale)
        const cells = visibleCells(grid, extent)
        const out: Array<Feature<Geometry>> = []
        for (const c of cells) {
            const from = grid.start[c]
            const to = grid.start[c + 1]
            const count = to - from
            const props: Record<string, unknown> = {
                geometry: new Point([grid.cx[c], grid.cy[c]]),
                [CLUSTER_PROP.count]: count,
                [CLUSTER_PROP.extent]: [grid.minX[c], grid.minY[c], grid.maxX[c], grid.maxY[c]],
            }
            if (count === 1) {
                const orig = this.features[grid.order[from]]
                props[CLUSTER_PROP.orig] = orig
                if (colorOf) props[CLUSTER_PROP.color] = colorOf(orig)
            } else if (colorOf) {
                const d = dominantColor(grid.order, from, to, i => colorOf(this.features[i]))
                props[CLUSTER_PROP.color] = d.color
                props[CLUSTER_PROP.mixed] = d.mixed
            }
            out.push(new Feature<Geometry>(props))
        }
        this.source.clear(true)
        this.source.addFeatures(out)
        return out.length
    }

    clear(): void {
        this.source.clear(true)
    }

    /** 기억하고 있는 줌별 격자 수(최대 3) — 메모리 상한 확인용 */
    cachedGridCount(): number {
        return this.grids.size
    }

    /** 줌별 격자 기억을 비운다(레이어를 끄거나 엔진을 없앨 때) */
    dispose(): void {
        this.source.clear(true)
        this.grids.clear()
        this.centers = null
    }
}
