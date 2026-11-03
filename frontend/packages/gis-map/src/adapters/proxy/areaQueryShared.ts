// 영역 분석 원격 질의 어댑터 공용 조각(순수 함수): 서버에 보낼 영역(WKT) 만들기·꼭짓점 줄이기·좌표 역변환.
// 서버에는 "걸침" 필터로 후보만 받아 오므로, 줄인 영역은 원래 영역을 반드시 덮는(바깥쪽으로만 커지는) 모양이어야 한다 —
// 정확한 판정은 브라우저가 원래 영역으로 다시 한다(코어 analyze).

/** 서버(GET 주소)에 보내는 영역 꼭짓점 상한(닫는 점 포함). 넘으면 볼록 껍질 → 범위 사각형 순으로 줄인다 */
export const MAX_FILTER_VERTICES = 200

function cross(o: number[], a: number[], b: number[]): number {
    return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
}

/** 볼록 껍질(Andrew monotone chain). 반시계, 첫 점을 끝에 되풀이하지 않는다 */
export function convexHull(points: number[][]): number[][] {
    const pts = points.slice().sort((p, q) => p[0] - q[0] || p[1] - q[1])
    if (pts.length < 3) return pts
    const lower: number[][] = []
    for (const p of pts) {
        while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop()
        lower.push(p)
    }
    const upper: number[][] = []
    for (let i = pts.length - 1; i >= 0; i--) {
        const p = pts[i]
        while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop()
        upper.push(p)
    }
    lower.pop()
    upper.pop()
    return lower.concat(upper)
}

/**
 * 영역 링(닫힘 여부 무관)을 서버에 보낼 닫힌 링으로. 꼭짓점이 max 이하면 그대로, 많으면 볼록 껍질(원래 영역을 덮는다),
 * 껍질도 많으면 범위 사각형. 결과는 항상 닫혀 있다(첫 점 = 끝 점)
 */
export function reduceRing(ring: number[][], max: number = MAX_FILTER_VERTICES): number[][] {
    const open = ring.length > 1 && ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1] ? ring.slice(0, -1) : ring.slice()
    if (open.length + 1 <= max) return open.concat([open[0]])
    const hull = convexHull(open)
    if (hull.length >= 3 && hull.length + 1 <= max) return hull.concat([hull[0]])
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    for (const p of open) {
        if (p[0] < minX) minX = p[0]
        if (p[0] > maxX) maxX = p[0]
        if (p[1] < minY) minY = p[1]
        if (p[1] > maxY) maxY = p[1]
    }
    return [[minX, minY], [maxX, minY], [maxX, maxY], [minX, maxY], [minX, minY]]
}

function num(n: number): string {
    return String(Math.round(n * 1e7) / 1e7)
}

/** 닫힌 링 → `POLYGON((경도 위도,…))`(소수 7자리) */
export function ringToWkt(ring: number[][]): string {
    return 'POLYGON((' + ring.map(p => num(p[0]) + ' ' + num(p[1])).join(',') + '))'
}

const R = 6378137

/** 웹 메르카토르(EPSG:3857, m) → 경위도(EPSG:4326, 경도·위도). 닫힌 식이라 정밀도 손실이 없다 */
export function mercatorToLonLat(x: number, y: number): [number, number] {
    const lon = (x / R) * (180 / Math.PI)
    const lat = (2 * Math.atan(Math.exp(y / R)) - Math.PI / 2) * (180 / Math.PI)
    return [lon, lat]
}

/** GeoJSON 좌표(중첩 배열)를 메르카토르 → 경위도로 바꾼 새 배열 */
export function reprojectCoordinates(coords: unknown): unknown {
    if (!Array.isArray(coords)) return coords
    if (coords.length >= 2 && typeof coords[0] === 'number' && typeof coords[1] === 'number') return mercatorToLonLat(coords[0], coords[1])
    return coords.map(reprojectCoordinates)
}
