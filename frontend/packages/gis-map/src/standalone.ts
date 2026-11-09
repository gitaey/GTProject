// UMD (a) 엔트리 — JSP·jQuery처럼 React가 없는 페이지용. vite build(기본 모드) → dist/gis-map.umd.js(전역 GisMap) + gis-map.es.js + gis-map.css.
// ol·proj4·ol-wind는 번들에 들어간다(번들 전용 사본 — 전역 ol에 새지 않고, 페이지의 전역 ol로 만든 지도와 섞을 수 없다. 그럴 때는 attach 번들).
// React 계열은 import하지 않는다(감사 4번 standalone↛React). window 대입은 Vite UMD 래퍼가 한다(소스에는 window 쓰기 없음).
// CSS는 JS가 주입하지 않는다 — 빌드가 dist/gis-map.css(.gm-root 안으로 한정한 ol.css + styles/gis-map.css)로 따로 뽑으므로 페이지에서 <link>로 불러온다.
import 'ol/ol.css'
import './styles/gis-map.css'
import ScaleLine from 'ol/control/ScaleLine'
import type { Options as ScaleLineOptions } from 'ol/control/ScaleLine'
import { createGisMap, GIS_MAP_VERSION } from './core'
import type { GisMap } from './core'
import { createWindPlugin } from './core/wind'
import { restSources } from './adapters/rest'
import { proxySources } from './adapters/proxy'
import { memorySources, demoSources, browserStartViewSource } from './adapters/memory'

/** 패키지 버전(core GIS_MAP_VERSION) */
export const version = GIS_MAP_VERSION

/** 엔진이 ol.Map을 만든다. 설계 8절의 이름 */
export const create = createGisMap
/** ESM에서 쓰기 쉬운 같은 함수의 원래 이름 */
export { createGisMap }

/** 플러그인: map.use(GisMap.plugins.wind()) — 바람장 소스(host 또는 options.source)가 있어야 그린다 */
export const plugins = Object.freeze({ wind: createWindPlugin })

/**
 * 데이터 소스 어댑터: sources: [GisMap.adapters.rest(), GisMap.adapters.proxy()].
 * startView(key) = 브라우저 저장소에 시작 화면을 저장하는 소스: sources: [..., { startView: GisMap.adapters.startView('my-key') }] — rest()의 계정 저장 대신 쓴다(둘을 섞지 않는다).
 * memory(data) = 이미 가진 데이터(GeoJSON·목록)로 서버 없이 소스를 만든다. demo(opts) = 합성 샘플 데이터 + 배경지도 설정 한 벌({ sources, config, view, notice }) — 정적 예제 gis-demo가 쓴다.
 */
export const adapters = Object.freeze({ rest: restSources, proxy: proxySources, memory: memorySources, demo: demoSources, startView: browserStartViewSource })

/**
 * 축척 막대(OL ScaleLine)를 붙인다. 번들 안의 ol 사본으로 만들어야 하므로(페이지의 전역 ol로 만든 컨트롤은 섞을 수 없다) 여기서 제공한다.
 * 기본값은 GTProject 상태바와 같다(미터법·막대 아님·최소 80px). 모양은 gis-map.css의 .gm-root .ol-scale-line — 지도 요소(또는 조상)에 class "gm-root"가 있어야 한다.
 * 반환값 = 떼기. map.destroy() 때도 저절로 뗀다.
 */
function scaleLine(map: GisMap, options?: ScaleLineOptions): () => void {
    const control = new ScaleLine({ units: 'metric', bar: false, minWidth: 80, ...options })
    map.olMap.addControl(control)
    let attached = true
    const detach = (): void => {
        if (!attached) return
        attached = false
        offDestroy()
        map.olMap.removeControl(control)
    }
    const offDestroy = map.on('destroy', detach)
    return detach
}

/** 엔진 밖 OL 컨트롤 도우미(번들 ol 사본으로 만든다) */
export const controls = Object.freeze({ scaleLine })

/** 출력(map.print.exportPng/exportPdf)이 돌려준 Blob을 파일로 저장: GisMap.saveBlob(blob, '위치도.pdf'). 출력 오류 클래스(code: TAINTED·BUSY·TOO_LARGE·NO_MAP_SIZE·DESTROYED) */
export { saveBlob, GisPrintError } from './core'

/** 필지 정보(gis.parcelInfo) 지목 부호 → 정식 명칭: GisMap.jimokName('도') → '도로' */
export { jimokName } from './core'

/** 지도 여러 개의 이동·확대 연동: var link = GisMap.linkViews([mapA, mapB]); link.destroy() (분할 화면 UI는 React 위젯이라 UMD에는 없다) */
export { linkViews } from './core'

/** 시작 화면(저장·복원): GisMap.captureStartView([map], { count: 1, sync: false, activeIndex: 0 }) → 저장할 JSON, GisMap.applyViewState(map, view.panes[0]), GisMap.parseStartView(json) → 검사한 값 또는 null. 붙이기(attach)는 열 때 자동 적용하지 않는다 */
export { buildStartView as captureStartView, applyViewState, parseStartView } from './core'
