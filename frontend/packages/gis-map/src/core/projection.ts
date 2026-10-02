// 한국 좌표계 proj4 등록. OL의 좌표계 목록은 원래 전역이라, 이미 있는 코드는 건드리지 않고
// 없는 코드만 추가한다(붙이기 모드에서 호스트가 등록한 정의를 덮어쓰지 않기 위해). 여러 번 불러도 안전하다.
// 예외: 좌표계 객체는 있는데 경위도 변환이 없으면(호스트가 new Projection만 만든 경우) 그 코드의 변환만 더한다 — 객체는 그대로 둔다.
import { fromLonLat, get as getProjection } from 'ol/proj'
import { register } from 'ol/proj/proj4'
import proj4 from 'proj4'

/** 기본 등록 좌표계(GRS80 TM). 5186 = 중부원점(상태바 표시용), 5179 = UTM-K(바로e맵) */
export const DEFAULT_PROJ4_DEFS: Readonly<Record<string, string>> = Object.freeze({
    'EPSG:5186': '+proj=tmerc +lat_0=38 +lon_0=127 +k=1 +x_0=200000 +y_0=600000 +ellps=GRS80 +units=m +no_defs',
    'EPSG:5179': '+proj=tmerc +lat_0=38 +lon_0=127.5 +k=0.9996 +x_0=1000000 +y_0=2000000 +ellps=GRS80 +units=m +no_defs',
    'EPSG:5185': '+proj=tmerc +lat_0=38 +lon_0=125 +k=1 +x_0=200000 +y_0=600000 +ellps=GRS80 +units=m +no_defs',
    'EPSG:5187': '+proj=tmerc +lat_0=38 +lon_0=129 +k=1 +x_0=200000 +y_0=600000 +ellps=GRS80 +units=m +no_defs',
    'EPSG:5188': '+proj=tmerc +lat_0=38 +lon_0=131 +k=1 +x_0=200000 +y_0=600000 +ellps=GRS80 +units=m +no_defs',
})

/**
 * code 좌표계가 있고 경위도(EPSG:4326)와 서로 바꿀 수 있는지. OL은 변환이 없으면 좌표를 그대로 돌려주므로(identity) 한 점을 바꿔 본다.
 * 단위가 도(degrees)인 좌표계는 그대로가 맞을 수 있어 true.
 */
export function hasLonLatTransform(code: string): boolean {
    const projection = getProjection(code)
    if (!projection) return false
    if (projection.getUnits() === 'degrees') return true
    const p = fromLonLat([127, 37.5], projection)
    return !(p[0] === 127 && p[1] === 37.5)
}

/**
 * 기본 정의 + extra를 등록한다. OL에 이미 있는 코드는 건너뛴다. extra === false면 아무것도 안 한다.
 * 반환값 = 새로 등록한 코드 목록
 */
export function registerProjections(extra?: Record<string, string> | false): string[] {
    if (extra === false) return []
    const defs: Record<string, string> = { ...DEFAULT_PROJ4_DEFS, ...(extra ?? {}) }
    const added: string[] = []
    for (const code of Object.keys(defs)) {
        if (getProjection(code) && hasLonLatTransform(code)) continue
        proj4.defs(code, defs[code])
        added.push(code)
    }
    // register()는 OL에 이미 있는 좌표계와 변환은 바꾸지 않는다(ol/proj/proj4 구현 확인)
    if (added.length > 0) register(proj4)
    return added
}
