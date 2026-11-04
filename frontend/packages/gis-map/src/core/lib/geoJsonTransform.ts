// GeoJSON 좌표를 다른 좌표계로 바꾼다(원본은 건드리지 않는다). 내보내기처럼 "EPSG:4326 → 5186" 변환이 필요한 어댑터가 쓴다.
// 좌표계는 ol/proj에 등록돼 있어야 한다(엔진 생성 때 registerProjections가 5186·5179 등을 등록). 모르는 코드면 그대로 던진다.
import { transform } from 'ol/proj'
import type { GeoJsonObject } from '../types/geojson'

function mapCoords(coords: unknown, fn: (p: number[]) => number[]): unknown {
    if (!Array.isArray(coords)) return coords
    if (typeof coords[0] === 'number') return fn(coords as number[])
    return coords.map(c => mapCoords(c, fn))
}

function mapGeometry(g: unknown, fn: (p: number[]) => number[]): unknown {
    if (!g || typeof g !== 'object') return g
    const o = g as Record<string, unknown>
    if (o.type === 'GeometryCollection' && Array.isArray(o.geometries)) {
        return { ...o, geometries: o.geometries.map(x => mapGeometry(x, fn)) }
    }
    return { ...o, coordinates: mapCoords(o.coordinates, fn) }
}

/** Feature·FeatureCollection·Geometry의 좌표를 from → to로 변환한 새 객체. 같은 코드면 그대로 돌려준다 */
export function transformGeoJson<T extends GeoJsonObject>(geojson: T, from: string, to: string): T {
    if (from === to) return geojson
    const fn = (p: number[]): number[] => {
        const q = transform([p[0], p[1]], from, to)
        return p.length > 2 ? [q[0], q[1], ...p.slice(2)] : q
    }
    if (geojson.type === 'FeatureCollection' && Array.isArray(geojson.features)) {
        return {
            ...geojson,
            features: (geojson.features as GeoJsonObject[]).map(f => ({ ...f, geometry: mapGeometry(f.geometry, fn) })),
        } as T
    }
    if (geojson.type === 'Feature') return { ...geojson, geometry: mapGeometry(geojson.geometry, fn) } as T
    return mapGeometry(geojson, fn) as T
}
