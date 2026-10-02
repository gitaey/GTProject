// 코어·ol-wind가 쓰는 ol API 목록(전역 full build `ol.js` 기준 경로)과 호환 검사.
// 목록은 코어의 값 import와 1:1이다(FE-6c 시험이 번들의 전역 참조와 대조). 버전 결과: packages/gis-map/COMPATIBILITY.md

/** 없으면 붙이기(attach)가 동작하지 않는 API(전역 경로). 하나라도 없으면 attach 번들은 붙지 않는다.
 *  View는 createGisMap만 쓰므로(호스트 지도는 자기 View가 있다) 목록에 없다 */
export const REQUIRED_OL_API: readonly string[] = Object.freeze([
    // 클래스
    'Map', 'Feature', 'Overlay',
    'layer.Tile', 'layer.Vector', 'layer.Image',
    'source.Vector', 'source.XYZ', 'source.ImageWMS',
    'format.GeoJSON',
    'interaction.Draw', 'interaction.Modify', 'interaction.Select',
    'geom.Point', 'geom.LineString', 'geom.Polygon',
    'geom.Polygon.fromCircle', 'geom.Polygon.circular',
    'style.Style', 'style.Fill', 'style.Stroke', 'style.Circle', 'style.Icon', 'style.Text',
    // 함수
    'interaction.Draw.createBox',
    'proj.fromLonLat', 'proj.toLonLat', 'proj.transform', 'proj.transformExtent', 'proj.get',
    'proj.proj4.register',
    'sphere.getArea', 'sphere.getLength',
    'extent.getCenter',
    'loadingstrategy.bbox',
    'events.condition.click',
    // ol-wind(core/wind). attach 번들은 ol-wind를 함께 싣고, ol-wind는 불러오는 순간 renderer.canvas.Layer를 상속하므로 항상 검사한다
    'layer.Layer', 'renderer.canvas.Layer',
    'proj.fromUserExtent', 'proj.fromUserCoordinate', 'proj.toUserCoordinate',
    'transform.create', 'transform.compose', 'transform.makeInverse', 'transform.toString', 'transform.apply',
    'extent.getIntersection', 'extent.isEmpty', 'extent.intersects', 'extent.containsExtent', 'extent.containsCoordinate',
])

/** 있으면 쓰고 없어도 동작하는 API */
export const OPTIONAL_OL_API: readonly string[] = Object.freeze(['util.VERSION'])

/** 이보다 낮은 ol은 붙이지 않는다(호환 매트릭스 결과 — COMPATIBILITY.md) */
export const MIN_OL_VERSION = '7.1.0'

/**
 * 호환 매트릭스(공식 full build 7.1.0·7.5.2·8.2.0·9.2.4·10.10.0)에서 통과한 버전대의 위 끝(major.minor). 아래 끝은 MIN_OL_VERSION.
 * 7.1.0 공식 빌드는 ol.util.VERSION이 'latest'라 버전을 알 수 없다 → testedRange false(붙이기는 된다)
 */
export const TESTED_OL_MAX = '10.10'

export interface OlCompatReport {
    /** 붙일 수 있는지(missing이 비었고, 버전을 알면 MIN_OL_VERSION 이상) */
    ok: boolean
    /** ol.util.VERSION (없으면 null) */
    version: string | null
    /** 없는 API 경로 */
    missing: string[]
    /** 호환 매트릭스에서 통과한 버전대(MIN_OL_VERSION ~ TESTED_OL_MAX.x) 안인지. 버전을 모르면 false */
    testedRange: boolean
    /** 지원 최소 버전 */
    minVersion: string
    /** 버전을 알고, 그 버전이 minVersion보다 낮음 */
    belowMinimum: boolean
}

export class GisOlCompatError extends Error {
    readonly report: OlCompatReport

    constructor(report: OlCompatReport) {
        const reasons: string[] = []
        const nothing = report.version === null && report.missing.length === REQUIRED_OL_API.length
        if (nothing) reasons.push('전역 ol을 찾지 못했다 — 공식 full build(ol.js)를 이 번들보다 먼저 불러온다')
        else if (report.belowMinimum) reasons.push('ol ' + report.minVersion + ' 이상이 필요하다(현재 ' + report.version + ')')
        if (!nothing && report.missing.length > 0) reasons.push('이 ol(' + (report.version ?? '버전 모름') + ')에 없는 API: ' + report.missing.join(', '))
        super('[gis-map] ' + (reasons.join(' / ') || '호환 검사 실패'))
        this.name = 'GisOlCompatError'
        this.report = report
    }
}

/** Object·Function 기본 멤버(toString 등)는 ol이 준 것이 아니다 — 네임스페이스에 없어도 상속으로 보이므로 없는 것으로 친다 */
const INHERITED = [Object.prototype, Function.prototype] as unknown as Array<Record<string, unknown>>

function resolvePath(root: unknown, path: string): unknown {
    let cur: unknown = root
    for (const key of path.split('.')) {
        if (cur == null || (typeof cur !== 'object' && typeof cur !== 'function')) return undefined
        const next = (cur as Record<string, unknown>)[key]
        if (next !== undefined && INHERITED.some(p => p[key] === next)) return undefined
        cur = next
    }
    return cur
}

/** 'v9.2.4' · '10.0.0-dev.1' → [9, 2, 4]. 숫자가 아니면 null */
function parseVersion(v: string): [number, number, number] | null {
    const m = /^v?(\d+)\.(\d+)(?:\.(\d+))?/.exec(v)
    return m ? [Number(m[1]), Number(m[2]), Number(m[3] ?? 0)] : null
}

function lowerThan(a: [number, number, number], b: [number, number, number]): boolean {
    for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] < b[i]
    return false
}

/** 전역 ol 네임스페이스(full build)를 경로별로 따라가 없는 API를 모은다 */
export function checkOlCompat(ol: unknown): OlCompatReport {
    const missing = REQUIRED_OL_API.filter(p => resolvePath(ol, p) === undefined)
    const v = resolvePath(ol, 'util.VERSION')
    const version = typeof v === 'string' && v !== '' ? v : null
    const parsed = version ? parseVersion(version) : null
    const min = parseVersion(MIN_OL_VERSION) as [number, number, number]
    const belowMinimum = parsed !== null && lowerThan(parsed, min)
    const max = parseVersion(TESTED_OL_MAX) as [number, number, number]
    const aboveTested = parsed !== null && (parsed[0] > max[0] || (parsed[0] === max[0] && parsed[1] > max[1]))
    return {
        ok: missing.length === 0 && !belowMinimum,
        version,
        missing,
        testedRange: parsed !== null && !belowMinimum && !aboveTested,
        minVersion: MIN_OL_VERSION,
        belowMinimum,
    }
}
