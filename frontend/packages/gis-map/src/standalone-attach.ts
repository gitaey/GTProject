// UMD (b) 엔트리 — 업무 페이지가 전역 ol(공식 full build `ol.js`)로 이미 만든 ol.Map에 엔진을 붙인다.
// vite build --mode attach → dist/gis-map.attach.umd.js(전역 GisMap) + gis-map.attach.css.
// ol은 번들에 넣지 않는다(external). `ol/layer/Vector` 같은 import는 빌드가 전역 `ol.layer.Vector`로 잇는다(vite.config.ts globals).
// proj4·ol-wind 코드는 번들에 들어간다. React 계열 import 0, window 쓰기 0(대입은 Vite UMD 래퍼가 한다).
// CSS는 JS가 주입하지 않는다 — gis-map.attach.css(ol.css 없음, 엔진 DOM에만 걸리는 규칙)를 페이지가 <link>로 불러온다.
import './styles/gis-map.css'
import * as olGlobal from 'ol'
import type OlMap from 'ol/Map'
import { attachGisMap, checkOlCompat, GisOlCompatError, GIS_MAP_VERSION } from './core'
import type { GisMap, GisMapAttachOptions, OlCompatReport } from './core'
import { createWindPlugin } from './core/wind'
import { restSources } from './adapters/rest'
import { proxySources } from './adapters/proxy'

/** 패키지 버전(core GIS_MAP_VERSION) */
export const version = GIS_MAP_VERSION

/**
 * 페이지의 전역 `ol`. UMD 래퍼가 넘긴 값을 빌드(interop)가 namespace로 감싸므로 원본은 default에 있다(전역 ol이 없으면 undefined).
 * 읽기만 한다.
 */
function hostOl(): unknown {
    const ns = olGlobal as unknown as Record<string, unknown>
    return 'default' in ns ? ns.default : ns
}

/** 페이지의 전역 ol이 엔진이 쓰는 API를 다 가졌는지 검사(도입 전 점검용). 붙이기 전에 불러 봐도 된다 */
export function checkOl(): OlCompatReport {
    return checkOlCompat(hostOl())
}

/**
 * 이미 만든 ol.Map에 엔진을 붙인다. 먼저 checkOl()을 돌려 문제가 있으면 GisOlCompatError(없는 API 목록 포함)를 던진다.
 * 호스트의 레이어·interaction·control·overlay·View·target은 건드리지 않고, destroy()는 엔진이 붙인 것만 뗀다.
 */
export function attach(olMap: OlMap, options?: GisMapAttachOptions): GisMap {
    const report = checkOl()
    if (!report.ok) throw new GisOlCompatError(report)
    return attachGisMap(olMap, options)
}

/** ESM 이름과 같은 별칭 */
export { attach as attachGisMap }

/** 플러그인: gis.use(GisMap.plugins.wind()) — 전역 ol에 renderer.canvas.Layer 등이 있어야 한다(checkOl이 함께 검사) */
export const plugins = Object.freeze({ wind: createWindPlugin })

/** 데이터 소스 어댑터: sources: [GisMap.adapters.rest(), GisMap.adapters.proxy()] */
export const adapters = Object.freeze({ rest: restSources, proxy: proxySources })

/** 호환 검사 오류 클래스(instanceof 확인용) */
export { GisOlCompatError }
