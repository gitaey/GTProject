// 격자 → 색상 오버레이 이미지(팔레트 PNG data URL + EPSG:4326 범위) 공통부. React·ol·DOM 없음.
//   · 칸 하나 = 이미지 픽셀 하나(격자 점이 칸의 가운데이므로 범위는 가장자리에서 반 칸씩 넓힌다)
//   · 풍속(buildWindOverlayImage)과 스칼라 변수(buildScalarOverlayImage)가 같은 함수를 쓴다 — 칸 → 팔레트 번호만 다르다
//   · 번호 -1(또는 팔레트 밖)·격자 밖은 투명
import type { ScalarGridInfo } from './windGrid'
import { bytesToDataUrl, encodeIndexedPng } from './pngIndexed'
import { wxScaleIndex, wxScalePalette } from './wxColorScales'
import type { WxColorScale } from './wxColorScales'

export interface WindOverlayImage {
    /** "data:image/png;base64,..." */
    dataUrl: string
    /** EPSG:4326 [서, 남, 동, 북] — 칸 가장자리 기준 */
    extent: [number, number, number, number]
    width: number
    height: number
}

/** 이미지를 만들 격자의 기하(windGrid의 WindGridInfo·ScalarGridInfo가 이 모양을 포함한다) */
export interface OverlayGridGeom {
    lo1: number
    la1: number
    dx: number
    dy: number
    nx: number
    ny: number
    northFirst: boolean
}

/** 격자 가장자리 기준 EPSG:4326 범위 [서, 남, 동, 북] — 격자점이 칸의 가운데이므로 가장자리에서 반 칸씩 넓힌다 */
export function gridImageExtent(geom: OverlayGridGeom): [number, number, number, number] {
    const { lo1, la1, dx, dy, nx, ny, northFirst } = geom
    const west = lo1 - dx / 2
    const east = lo1 + (nx - 1) * dx + dx / 2
    const north = (northFirst ? la1 : la1 + (ny - 1) * dy) + dy / 2
    const south = (northFirst ? la1 - (ny - 1) * dy : la1) - dy / 2
    return [west, south, east, north]
}

/**
 * 격자 범위 전체를 한 가지 색(알파 0~1)으로 덮는 1x1 이미지 — 바탕 깔기용. 자료 없는 칸도 덮는다(격자의 사각 범위).
 * rgb는 '#rrggbb'. 팔레트 PNG 인코더를 그대로 써서 새 ol API 없이 ImageStatic으로 올린다
 */
export function buildFlatOverlayImage(geom: OverlayGridGeom, color: string, alpha: number): WindOverlayImage {
    const m = /^#([0-9a-f]{6})$/i.exec(color)
    const rgb = m ? [parseInt(m[1].slice(0, 2), 16), parseInt(m[1].slice(2, 4), 16), parseInt(m[1].slice(4, 6), 16)] : [255, 255, 255]
    const a = Math.round(Math.min(1, Math.max(0, Number.isFinite(alpha) ? alpha : 0)) * 255)
    const png = encodeIndexedPng(1, 1, new Uint8Array([0]), new Uint8Array(rgb), new Uint8Array([a]))
    return { dataUrl: bytesToDataUrl(png, 'image/png'), extent: gridImageExtent(geom), width: 1, height: 1 }
}

/**
 * 격자 기하 + 팔레트로 이미지를 만든다. indexAt(cell)은 격자 칸 번호(행 우선, 격자 원래 행 순서 srcRow*nx+col)의 팔레트 번호, 없으면 -1.
 * 팔레트는 최대 255색(투명 한 칸이 더 필요하다)
 */
export function buildGridOverlayImage(
    geom: OverlayGridGeom,
    palette: ReadonlyArray<readonly [number, number, number]>,
    indexAt: (cell: number) => number,
): WindOverlayImage {
    const { nx, ny, northFirst } = geom
    const levels = palette.length
    const rgb = new Uint8Array((levels + 1) * 3)
    const alpha = new Uint8Array(levels + 1)
    for (let k = 0; k < levels; k++) {
        rgb[k * 3] = palette[k][0]
        rgb[k * 3 + 1] = palette[k][1]
        rgb[k * 3 + 2] = palette[k][2]
        alpha[k] = 255
    }
    const none = levels // 마지막 칸 = 투명(자료 없음)
    alpha[none] = 0

    const indices = new Uint8Array(nx * ny)
    for (let row = 0; row < ny; row++) {
        const srcRow = northFirst ? row : ny - 1 - row // 이미지는 위(북)에서 아래로
        for (let col = 0; col < nx; col++) {
            const k = indexAt(srcRow * nx + col)
            indices[row * nx + col] = k >= 0 && k < levels ? k : none
        }
    }

    const png = encodeIndexedPng(nx, ny, indices, rgb, alpha)
    return { dataUrl: bytesToDataUrl(png, 'image/png'), extent: gridImageExtent(geom), width: nx, height: ny }
}

/** 스칼라 격자를 변수별 색 규칙(wxColorScales)으로 이미지로. 값이 없는 칸(NaN)·transparentBelow 미만(비 없음)은 투명 */
export function buildScalarOverlayImage(grid: ScalarGridInfo, scale: WxColorScale): WindOverlayImage {
    const { values } = grid
    return buildGridOverlayImage(grid, wxScalePalette(scale), cell => wxScaleIndex(scale, values[cell]))
}
