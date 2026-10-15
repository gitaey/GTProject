// 바람 격자 → 풍속 색상 오버레이 이미지(팔레트 PNG data URL + EPSG:4326 범위). React·ol·DOM 없음.
// 이미지 만들기 공통부는 gridOverlayImage(스칼라 변수 오버레이와 공유) — 여기서는 풍속 색과 칸별 번호만 정한다.
//   · 색 = 입자와 같은 windSpeedColor 스케일, 0.1 m/s 간격 팔레트(0 ~ WIND_LEGEND_MAX_SPEED)
//   · 자료 없는 칸(null)·격자 밖은 투명 — 풍속 0(무풍)은 가장 낮은 색으로 칠해 구분된다
import type { WindField } from '../types/wind'
import { windSpeedColor } from './windColorScale'
import { readWindGrid } from './windGrid'
import { WIND_LEGEND_MAX_SPEED } from './windLimits'
import { buildGridOverlayImage } from './gridOverlayImage'
import type { WindOverlayImage } from './gridOverlayImage'

export type { WindOverlayImage } from './gridOverlayImage'

const STEP = 10 // 팔레트 해상도: 1 m/s당 10칸

/** windSpeedColor가 돌려주는 'rgb(r,g,b)'·'#rrggbb'를 [r,g,b]로 */
function parseColor(color: string): [number, number, number] {
    const m = /^rgb\((\d+),\s*(\d+),\s*(\d+)\)$/.exec(color)
    if (m) return [Number(m[1]), Number(m[2]), Number(m[3])]
    const h = /^#([0-9a-f]{6})$/i.exec(color)
    if (h) return [parseInt(h[1].slice(0, 2), 16), parseInt(h[1].slice(2, 4), 16), parseInt(h[1].slice(4, 6), 16)]
    return [255, 255, 255]
}

/** 격자를 오버레이 이미지로. 형식이 틀리면 null */
export function buildWindOverlayImage(field: WindField | null | undefined, maxSpeed: number = WIND_LEGEND_MAX_SPEED): WindOverlayImage | null {
    const g = readWindGrid(field)
    if (!g) return null
    const { us, vs } = g

    const levels = Math.round(maxSpeed * STEP) + 1 // 0.0 ~ maxSpeed
    const palette: Array<[number, number, number]> = []
    for (let k = 0; k < levels; k++) palette.push(parseColor(windSpeedColor(k / STEP)))

    return buildGridOverlayImage(g, palette, cell => {
        const u = us[cell]
        const v = vs[cell]
        if (typeof u === 'number' && typeof v === 'number' && Number.isFinite(u) && Number.isFinite(v)) {
            return Math.min(levels - 1, Math.round(Math.sqrt(u * u + v * v) * STEP))
        }
        return -1
    })
}
