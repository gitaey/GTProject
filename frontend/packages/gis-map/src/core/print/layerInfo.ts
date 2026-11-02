// 지도에 켜진 레이어의 "네트워크 정보"(소스 주소·crossOrigin·이름) 읽기 + 오염 원인 추정 + 출처 문구 모으기.
// ol 소스 클래스마다 필드 이름이 달라 덕 타이핑으로 읽는다(TileImage.crossOrigin · ImageWMS.crossOrigin_ · getUrl/getUrls). 못 읽으면 "알 수 없음"으로 둔다.
import type OlMap from 'ol/Map'
import type BaseLayer from 'ol/layer/Base'
import { isVWorldUrl } from '../layers/resolveLayerUrl'

export interface LayerNetInfo {
    name: string
    urls: string[]
    /** 소스의 crossOrigin 값. null·undefined·'' = 없음 */
    crossOrigin: string | null | undefined
}

interface SourceLike {
    getUrl?: () => string | undefined
    getUrls?: () => string[] | null
    getCrossOrigin?: () => string | null | undefined
    crossOrigin?: string | null
    crossOrigin_?: string | null
}

interface LayerLike {
    getVisible(): boolean
    getOpacity(): number
    getSource?: () => SourceLike | null
    get(key: string): unknown
}

function hostOf(url: string): string {
    try {
        return new URL(url).host || url
    } catch {
        return url
    }
}

/** 켜져 있고 불투명도 > 0인 소스 레이어의 정보. 소스가 없는 레이어(그룹 등)는 null */
export function readLayerNetInfo(layer: BaseLayer): LayerNetInfo | null {
    const l = layer as unknown as LayerLike
    if (typeof l.getSource !== 'function' || !l.getVisible() || l.getOpacity() <= 0) return null
    const src = l.getSource()
    if (!src) return null
    const urls: string[] = []
    if (typeof src.getUrls === 'function') {
        for (const u of src.getUrls() ?? []) if (typeof u === 'string') urls.push(u)
    } else if (typeof src.getUrl === 'function') {
        const u = src.getUrl()
        if (typeof u === 'string') urls.push(u)
    }
    const co = typeof src.getCrossOrigin === 'function' ? src.getCrossOrigin() : src.crossOrigin ?? src.crossOrigin_
    const named = l.get('gmLayerName') ?? l.get('name') ?? l.get('title')
    const name = typeof named === 'string' && named !== '' ? named : urls.length > 0 ? hostOf(urls[0]) : '(이름 없는 레이어)'
    return { name, urls, crossOrigin: co }
}

/** 지도 레이어 그룹 안의 모든 켜진 소스 레이어 */
export function collectLayerNetInfos(olMap: OlMap): LayerNetInfo[] {
    const out: LayerNetInfo[] = []
    for (const layer of olMap.getLayerGroup().getLayersArray()) {
        const info = readLayerNetInfo(layer)
        if (info) out.push(info)
    }
    return out
}

/** url이 페이지와 다른 출처인가(data:·blob:·잘못된 주소는 같은 출처로 본다) */
export function isCrossOriginUrl(url: string, pageOrigin: string, baseUrl: string): boolean {
    try {
        const u = new URL(url, baseUrl)
        if (u.protocol === 'data:' || u.protocol === 'blob:') return false
        return u.origin !== pageOrigin
    } catch {
        return false
    }
}

/** 오염 원인 후보: 다른 출처 주소를 쓰는데 crossOrigin이 없는 켜진 레이어 이름(중복 제거) */
export function findTaintSuspects(infos: readonly LayerNetInfo[], pageOrigin: string, baseUrl: string): string[] {
    const names: string[] = []
    for (const info of infos) {
        if (info.crossOrigin) continue
        if (info.urls.some(u => isCrossOriginUrl(u, pageOrigin, baseUrl)) && !names.includes(info.name)) names.push(info.name)
    }
    return names
}

/** 항상 붙일 출처 + (켜진 레이어에 vworld.kr 주소가 있으면) VWorld 문구. 중복·빈 문구 제거 */
export function collectAttributions(
    fixed: readonly string[] | undefined, vworldText: string | false, infos: readonly LayerNetInfo[],
): string[] {
    const out: string[] = []
    const add = (t: string): void => {
        const s = t.trim()
        if (s !== '' && !out.includes(s)) out.push(s)
    }
    if (vworldText !== false && infos.some(i => i.urls.some(isVWorldUrl))) add(vworldText)
    for (const a of fixed ?? []) add(a)
    return out
}
