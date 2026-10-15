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

/**
 * 격자 기하 + 팔레트로 이미지를 만든다. indexAt(cell)은 격자 칸 번호(행 우선, 격자 원래 행 순서 srcRow*nx+col)의 팔레트 번호, 없으면 -1.
 * 팔레트는 최대 255색(투명 한 칸이 더 필요하다)
 */
export function buildGridOverlayImage(
    geom: OverlayGridGeom,
    palette: ReadonlyArray<readonly [number, number, number]>,
    indexAt: (cell: number) => number,
): WindOverlayImage {
    const { lo1, la1, dx, dy, nx, ny, northFirst } = geom
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

    const west = lo1 - dx / 2
    const east = lo1 + (nx - 1) * dx + dx / 2
    const north = (northFirst ? la1 : la1 + (ny - 1) * dy) + dy / 2
    const south = (northFirst ? la1 - (ny - 1) * dy : la1) - dy / 2
    const png = encodeIndexedPng(nx, ny, indices, rgb, alpha)
    return { dataUrl: bytesToDataUrl(png, 'image/png'), extent: [west, south, east, north], width: nx, height: ny }
}

/** 스칼라 격자를 변수별 색 규칙(wxColorScales)으로 이미지로. 값이 없는 칸(NaN)·transparentBelow 미만(비 없음)은 투명 */
export function buildScalarOverlayImage(grid: ScalarGridInfo, scale: WxColorScale): WindOverlayImage {
    const { values } = grid
    return buildGridOverlayImage(grid, wxScalePalette(scale), cell => wxScaleIndex(scale, values[cell]))
}
