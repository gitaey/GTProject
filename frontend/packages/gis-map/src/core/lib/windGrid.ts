// 바람 격자(grib2json: header.lo1/la1/lo2/la2/dx/dy/nx/ny, U·V 성분)에서 한 지점의 풍속·풍향을 구한다. React·ol 없음.
// 값은 ol-wind(wind-core Field)가 입자를 움직일 때 쓰는 것과 같은 방식 — 네 격자점 이중선형 보간 — 이라 화면의 흐름과 표시 값이 어긋나지 않는다.
// 격자 가장자리(마지막 열·행)까지는 값이 있고, 그 밖이거나 네 점 중 하나라도 값이 없으면 null.
import type { WindField, WindSample, WindScalarField } from '../types/wind'

type WindRecord = WindField[number]

/** 동서(U) 성분·남북(V) 성분 기록. wind-core와 같은 기준(parameterCategory,parameterNumber = 1,2·2,2 / 1,3·2,3), 못 찾으면 [0]=U·[1]=V */
function findComponents(field: WindField): { u: WindRecord; v: WindRecord } | null {
    let u: WindRecord | undefined
    let v: WindRecord | undefined
    for (const rec of field) {
        const key = String(rec?.header?.parameterCategory) + ',' + String(rec?.header?.parameterNumber)
        if (key === '1,2' || key === '2,2') u = rec
        else if (key === '1,3' || key === '2,3') v = rec
    }
    u = u ?? field[0]
    v = v ?? field[1]
    return u && v ? { u, v } : null
}

function num(value: unknown): number {
    return typeof value === 'number' ? value : Number.NaN
}

const EPS = 1e-9

/** 읽어 둔 격자 한 장. us·vs는 행 우선(북 → 남 또는 남 → 북), 값이 없는 칸은 null */
export interface WindGridInfo {
    lo1: number
    la1: number
    /** 열·행 간격(도, 양수) */
    dx: number
    dy: number
    nx: number
    ny: number
    /** 첫 행이 북쪽 끝(보통)이면 true */
    northFirst: boolean
    us: ArrayLike<number | null>
    vs: ArrayLike<number | null>
}

/** grib2json 두 기록(U·V)에서 격자 정보를 읽는다. 형식이 틀리면 null */
export function readWindGrid(field: WindField | null | undefined): WindGridInfo | null {
    if (!field || field.length < 2) return null
    const comp = findComponents(field)
    if (!comp) return null
    const h = comp.u.header
    const lo1 = num(h.lo1)
    const la1 = num(h.la1)
    const dx = Math.abs(num(h.dx))
    const dy = Math.abs(num(h.dy))
    const nx = Math.trunc(num(h.nx))
    const ny = Math.trunc(num(h.ny))
    if (!(dx > 0) || !(dy > 0) || !(nx >= 1) || !(ny >= 1) || !Number.isFinite(lo1) || !Number.isFinite(la1)) return null
    const us = comp.u.data
    const vs = comp.v.data
    if (!us || !vs || us.length < nx * ny || vs.length < nx * ny) return null
    // 행 방향: la1이 북쪽 끝(보통)이면 위에서 아래로, 남쪽 끝이면 아래에서 위로 (la2가 있으면 그것으로 판단)
    const la2 = num(h.la2)
    const northFirst = Number.isFinite(la2) ? la1 >= la2 : true
    return { lo1, la1, dx, dy, nx, ny, northFirst, us, vs }
}

/**
 * 위경도(EPSG:4326)의 바람. 오버레이가 칠한 범위와 같게 읽는다: 칸 하나 = 격자점을 가운데로 한 사각형이라
 *   · 격자 가장자리에서 반 칸 바깥까지는 값이 있다(가장자리 칸 값을 그대로),
 *   · 그 점이 속한 칸(가장 가까운 격자점)에 값이 없으면(null) 자료 없음,
 *   · 있으면 둘러싼 네 점을 이중선형 보간하되 값이 없는 점은 빼고 남은 점의 가중치로 다시 나눈다.
 * 격자 밖(반 칸을 넘음)이거나 형식이 틀리면 null. (입자를 움직이는 wind-core는 네 점이 모두 있어야 값이 있다 — 그 가장자리 한 줄은 입자만 사라진다)
 */
export function sampleWind(field: WindField | null | undefined, lon: number, lat: number): WindSample | null {
    if (!Number.isFinite(lon) || !Number.isFinite(lat)) return null
    const g = readWindGrid(field)
    if (!g) return null
    const { lo1, la1, dx, dy, nx, ny, northFirst, us, vs } = g
    const fi = (lon - lo1) / dx
    const fj = northFirst ? (la1 - lat) / dy : (lat - la1) / dy
    const edge = 0.5 + EPS
    if (fi < -edge || fi > nx - 1 + edge || fj < -edge || fj > ny - 1 + edge) return null

    const clamp = (v: number, max: number) => Math.min(Math.max(v, 0), max)
    const valid = (x: number | null | undefined): x is number => typeof x === 'number' && Number.isFinite(x)
    const at = (arr: ArrayLike<number | null>, i: number, j: number): number | null => arr[j * nx + i]

    // 이 점이 속한 칸(오버레이의 한 픽셀)에 값이 없으면 자료 없음
    const ni = Math.min(Math.max(Math.round(fi), 0), nx - 1)
    const nj = Math.min(Math.max(Math.round(fj), 0), ny - 1)
    if (!valid(at(us, ni, nj)) || !valid(at(vs, ni, nj))) return null

    // 가장자리 반 칸 바깥은 가장자리 격자점으로 붙여서 보간한다
    const ci = clamp(fi, nx - 1)
    const cj = clamp(fj, ny - 1)
    const i0 = Math.min(Math.floor(ci), nx - 1)
    const j0 = Math.min(Math.floor(cj), ny - 1)
    const i1 = Math.min(i0 + 1, nx - 1)
    const j1 = Math.min(j0 + 1, ny - 1)
    const tx = Math.min(Math.max(ci - i0, 0), 1)
    const ty = Math.min(Math.max(cj - j0, 0), 1)
    const idx: Array<[number, number, number]> = [
        [i0, j0, (1 - tx) * (1 - ty)], [i1, j0, tx * (1 - ty)], [i0, j1, (1 - tx) * ty], [i1, j1, tx * ty],
    ]
    let u = 0
    let v = 0
    let sw = 0
    for (const [i, j, w] of idx) {
        const uu = at(us, i, j)
        const vv = at(vs, i, j)
        if (w <= 0 || !valid(uu) || !valid(vv)) continue
        u += uu * w
        v += vv * w
        sw += w
    }
    if (sw <= 0) return null
    return windVectorToSample(u / sw, v / sw)
}

/** U·V(m/s) → 풍속·기상학적 풍향. 풍향 = (270 − atan2(v, u)·180/π) mod 360 (바람이 불어오는 쪽, 북=0 시계방향) */
export function windVectorToSample(u: number, v: number): WindSample {
    const speed = Math.sqrt(u * u + v * v)
    const raw = 270 - (Math.atan2(v, u) * 180) / Math.PI
    const directionDeg = ((raw % 360) + 360) % 360
    return { speed, directionDeg, u, v }
}

const COMPASS_16 = Object.freeze([
    '북', '북북동', '북동', '동북동', '동', '동남동', '남동', '남남동',
    '남', '남남서', '남서', '서남서', '서', '서북서', '북서', '북북서',
])

/** 풍향(도) → 16방위 한글 이름(0=북, 90=동, 315=북서) */
export function windDirectionName(directionDeg: number): string {
    const norm = ((directionDeg % 360) + 360) % 360
    return COMPASS_16[Math.round(norm / 22.5) % 16]
}

/** 화면 표시 글: '풍속 12.3 m/s · 풍향 북서(315°)'. 풍속이 소수 1자리로 0.0이면 풍향은 의미가 없어 '무풍' */
export function formatWindSample(sample: WindSample): string {
    const speedText = '풍속 ' + sample.speed.toFixed(1) + ' m/s'
    if (sample.speed < 0.05) return speedText + ' · 풍향 없음(무풍)'
    const deg = Math.round(sample.directionDeg) % 360
    return speedText + ' · 풍향 ' + windDirectionName(sample.directionDeg) + '(' + deg + '°)'
}

// ── 스칼라 변수(기온·습도·강수량) 격자 ──

/** 읽어 둔 스칼라 격자 한 장. values는 행 우선, 값이 없는 칸은 NaN(Float32Array — 장당 약 0.57MB) */
export interface ScalarGridInfo {
    lo1: number
    la1: number
    dx: number
    dy: number
    nx: number
    ny: number
    northFirst: boolean
    values: ArrayLike<number>
}

/**
 * 스칼라 한 장(WindScalarField: header + 정수 data)을 격자로 읽는다. 값 = data × header.scale(없으면 1), null·숫자가 아닌 칸은 NaN.
 * 격자 머리글 해석은 바람(readWindGrid)과 같다. 형식이 틀리면 null
 */
export function readScalarGrid(field: WindScalarField | null | undefined): ScalarGridInfo | null {
    if (!field || !field.header || !Array.isArray(field.data)) return null
    const h = field.header
    const lo1 = num(h.lo1)
    const la1 = num(h.la1)
    const dx = Math.abs(num(h.dx))
    const dy = Math.abs(num(h.dy))
    const nx = Math.trunc(num(h.nx))
    const ny = Math.trunc(num(h.ny))
    if (!(dx > 0) || !(dy > 0) || !(nx >= 1) || !(ny >= 1) || !Number.isFinite(lo1) || !Number.isFinite(la1)) return null
    const data = field.data
    if (data.length < nx * ny) return null
    const rawScale = num(h.scale)
    const scale = Number.isFinite(rawScale) && rawScale > 0 ? rawScale : 1
    const la2 = num(h.la2)
    const northFirst = Number.isFinite(la2) ? la1 >= la2 : true
    const values = new Float32Array(nx * ny)
    for (let i = 0; i < values.length; i++) {
        const v = data[i]
        values[i] = typeof v === 'number' && Number.isFinite(v) ? v * scale : Number.NaN
    }
    return { lo1, la1, dx, dy, nx, ny, northFirst, values }
}

/**
 * 위경도(EPSG:4326)의 스칼라 값 — sampleWind와 같은 규칙: 가장자리 반 칸 바깥까지 값이 있고, 그 점이 속한 칸에 값이 없으면 null,
 * 있으면 둘러싼 네 점을 이중선형 보간하되 값이 없는 점은 빼고 남은 점의 가중치로 다시 나눈다. 격자 밖이거나 형식이 틀리면 null
 */
export function sampleGrid(grid: ScalarGridInfo | null | undefined, lon: number, lat: number): number | null {
    if (!grid || !Number.isFinite(lon) || !Number.isFinite(lat)) return null
    const { lo1, la1, dx, dy, nx, ny, northFirst, values } = grid
    const fi = (lon - lo1) / dx
    const fj = northFirst ? (la1 - lat) / dy : (lat - la1) / dy
    const edge = 0.5 + EPS
    if (fi < -edge || fi > nx - 1 + edge || fj < -edge || fj > ny - 1 + edge) return null

    const clamp = (v: number, max: number) => Math.min(Math.max(v, 0), max)
    const at = (i: number, j: number): number => values[j * nx + i]

    const ni = Math.min(Math.max(Math.round(fi), 0), nx - 1)
    const nj = Math.min(Math.max(Math.round(fj), 0), ny - 1)
    if (!Number.isFinite(at(ni, nj))) return null

    const ci = clamp(fi, nx - 1)
    const cj = clamp(fj, ny - 1)
    const i0 = Math.min(Math.floor(ci), nx - 1)
    const j0 = Math.min(Math.floor(cj), ny - 1)
    const i1 = Math.min(i0 + 1, nx - 1)
    const j1 = Math.min(j0 + 1, ny - 1)
    const tx = Math.min(Math.max(ci - i0, 0), 1)
    const ty = Math.min(Math.max(cj - j0, 0), 1)
    const idx: Array<[number, number, number]> = [
        [i0, j0, (1 - tx) * (1 - ty)], [i1, j0, tx * (1 - ty)], [i0, j1, (1 - tx) * ty], [i1, j1, tx * ty],
    ]
    let sum = 0
    let sw = 0
    for (const [i, j, w] of idx) {
        const x = at(i, j)
        if (w <= 0 || !Number.isFinite(x)) continue
        sum += x * w
        sw += w
    }
    return sw > 0 ? sum / sw : null
}
