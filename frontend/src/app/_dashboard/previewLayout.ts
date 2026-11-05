// 미리보기 지도의 "보이는 곳 가운데" 계산(순수 함수, import 없음 — 노드로 단위 확인).
// lg 이상에서는 글자 판이 지도 위 왼쪽 아래를 덮는다. 시점 중심(세종)이 판 뒤에 숨지 않게, 판이 안 덮는 영역 가운데로 중심을 옮긴다.

/** 지도 칸 왼쪽 위를 (0, 0)으로 한 픽셀 상자 */
export interface PixelBox {
    left: number
    top: number
    right: number
    bottom: number
}

export interface PixelSize {
    width: number
    height: number
}

export interface PixelPoint {
    x: number
    y: number
}

/** 판 둘레에 남길 여백(px) — 판 바로 옆에 붙은 곳은 "보이는 곳"으로 치지 않는다 */
const COVER_MARGIN_PX = 12

/**
 * 판(cover)이 안 덮는 곳 가운데 점. 판을 뺀 직사각형 후보 4개(왼·오른·위·아래) 중
 * 짧은 변이 가장 긴 것(넉넉한 정사각형에 가까운 곳)을 골라 그 가운데를 돌려준다. 같으면 넓은 쪽.
 * 판이 없거나(lg 미만 — 지도 위를 안 덮음) 후보가 하나도 없으면 칸 가운데.
 */
export function freeAreaCenter(size: PixelSize, cover: PixelBox | null): PixelPoint {
    const middle: PixelPoint = { x: size.width / 2, y: size.height / 2 }
    if (!cover || size.width <= 0 || size.height <= 0) return middle
    const c: PixelBox = {
        left: Math.max(0, cover.left - COVER_MARGIN_PX),
        top: Math.max(0, cover.top - COVER_MARGIN_PX),
        right: Math.min(size.width, cover.right + COVER_MARGIN_PX),
        bottom: Math.min(size.height, cover.bottom + COVER_MARGIN_PX),
    }
    if (c.right <= c.left || c.bottom <= c.top) return middle // 판이 칸 밖 — 안 덮는 것과 같다
    const candidates: PixelBox[] = [
        { left: 0, top: 0, right: c.left, bottom: size.height },
        { left: c.right, top: 0, right: size.width, bottom: size.height },
        { left: 0, top: 0, right: size.width, bottom: c.top },
        { left: 0, top: c.bottom, right: size.width, bottom: size.height },
    ]
    let best: PixelBox | null = null
    let bestShort = 0
    let bestArea = 0
    for (const r of candidates) {
        const w = r.right - r.left
        const h = r.bottom - r.top
        if (w <= 0 || h <= 0) continue
        const short = Math.min(w, h)
        const area = w * h
        if (short > bestShort || (short === bestShort && area > bestArea)) {
            best = r
            bestShort = short
            bestArea = area
        }
    }
    if (!best) return middle
    return { x: (best.left + best.right) / 2, y: (best.top + best.bottom) / 2 }
}

/**
 * 기준 중심(base, 뷰 좌표)이 화면의 point에 오게 하는 뷰 중심. resolution = 뷰 단위/픽셀, 화면 y는 아래로 늘고 지도 y는 위로 는다.
 * 회전 0, 칸 크기 size 기준(칸 가운데가 뷰 중심).
 */
export function centerForScreenPoint(
    base: readonly [number, number],
    resolution: number,
    size: PixelSize,
    point: PixelPoint,
): [number, number] {
    return [base[0] - (point.x - size.width / 2) * resolution, base[1] + (point.y - size.height / 2) * resolution]
}
