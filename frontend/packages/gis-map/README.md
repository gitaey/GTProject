# @gtp/gis-map — OpenLayers 지도 엔진 + React 위젯 + 데이터 소스 어댑터

GTProject의 지도 기능을 **다른 프로젝트로 그대로 가져다 쓰기 위한** 이식 단위다. 이 폴더(`packages/gis-map/`) 하나가 전부이고,
안에서는 상대 경로로만 서로 import한다. 쓰는 방법은 세 가지다.

| 쓰는 곳 | 방법 | 들어가는 것 |
|---|---|---|
| React 앱(Next.js·Vite 등) | 폴더 복사 → `<GisMapProvider>` + `<MapShell>`(또는 위젯 골라 조립) | core + react + ui + adapters |
| JSP·jQuery 등 React 없는 페이지 | `dist/gis-map.umd.js` `<script>` 한 줄 → `GisMap.create(...)` | core + adapters + ol(번들 안) |
| 이미 `new ol.Map`을 쓰는 업무 화면 | `dist/gis-map.attach.umd.js` → `GisMap.attach(기존지도, ...)` | core + adapters(ol은 페이지 것) |

React 위젯(툴바·패널)의 JSP 번들은 없다 — React 없는 페이지는 화면을 직접 만들고 버튼에서 엔진 API를 부른다.

## 폴더 구조

```
packages/gis-map/
├── src/
│   ├── core/        지도 엔진(React 없음). import는 ol·proj4·core 안 상대 경로만. createGisMap / attachGisMap,
│   │                도구(그리기·거리·면적·반경), 레이어 트리, GeoTIFF·나만의지도 오버레이, 필지 강조, 지역명, ol 호환 검사
│   │   └── wind/    바람길 플러그인(ol-wind는 여기서만)
│   ├── react/       GisMapProvider · GisMapView · 훅(useGisMap, useStoreValue …)
│   ├── ui/          선택형 위젯(MapShell, MapHeader, SearchBar, MapToolbar, LayerPanel, ImagePanel, MyMapPanel, MapStatusBar …)
│   ├── adapters/
│   │   ├── rest/    짝 Spring 백엔드({ success, message, data }) — 레이어 트리·개인 레이어 설정·나만의지도·GeoTIFF·바람길
│   │   ├── proxy/   호스트 프록시 규약 — VWorld 주소 검색·필지·지역명·범례, WFS, GeoServer 범례 이미지
│   │   └── memory/  서버 없는 데이터 공급원 — 이미 가진 GeoJSON·목록으로 소스를 만든다(`memory(data)`), 합성 샘플 한 벌(`demo(opts)`, 시드 고정·가상 PNU). 정적 예제 gis-demo·공개 웹 데모가 같은 코드를 쓴다
│   ├── styles/      gis-map.css(리셋·--gm-* 변수·코어 DOM) · gis-map-ui.css(위젯). 클래스는 전부 gm- 접두사, Tailwind 없음
│   ├── standalone.ts         UMD (a) 진입점(ol 포함)
│   └── standalone-attach.ts  UMD (b) 진입점(ol 제외, 전역 ol 사용)
├── examples/        standalone.html(개발 서버) · jsp/{map,attach}.jsp(서버 연동 틀) + jsp/README.md(JSP 상세 안내) · gis-demo/(서버 없이 열리는 정적 예제 폴더: index·create·attach.html, demo-data.js, README.txt — 빌드가 lib/·map.jsp를 더해 dist/gis-demo/를 만든다)
├── vite.config.ts   UMD 빌드·개발 서버 설정 (Next 빌드와 무관)
├── COMPATIBILITY.md attach 번들의 ol 버전 호환 표
└── THIRD-PARTY-NOTICES.md  번들에 들어가는 서드파티 라이선스 원문(저장소용 사본)
```

의존 방향은 `ui → react → core`, `adapters → core`이고 core는 아무것도 모른다. 패키지 안에는 앱 import, `process.env`·`import.meta.env`,
모듈 전역 가변 상태, `window`/`globalThis` 쓰기, Tailwind 클래스, 호스트 경로 하드코딩(`/api/…`·`/proxy/…`는 `adapters/`만)이 없다.
GTProject에서는 `bash .claude/skills/map-module-export/scripts/audit-portability.sh`가 이 규칙을 검사한다.

## 1. React 앱에서 — `MapShell`

필요한 것: `ol@^9.2`, `proj4@^2.20`, `react>=18`, `react-dom`, `lucide-react`(위젯을 쓸 때), `ol-wind@^1.1`(바람길을 쓸 때).

1. 이 폴더를 대상 프로젝트에 복사하고, 경로 별칭 6개를 잡는다(GTProject는 `frontend/tsconfig.json` `paths`):
   `@gtp/gis-map/core`, `/core/wind`, `/react`, `/ui`, `/adapters/rest`, `/adapters/proxy`, `/adapters/memory` → 각 `src/.../index.ts`. 앱은 이 7개만 import한다.
2. 전역 CSS에 순서대로: `ol/ol.css` → `src/styles/gis-map.css` → `src/styles/gis-map-ui.css`.
3. 조립:

```tsx
'use client'
import { GisMapProvider } from '@gtp/gis-map/react'
import { MapShell, defaultPanels } from '@gtp/gis-map/ui'
import { restSources } from '@gtp/gis-map/adapters/rest'
import { proxySources } from '@gtp/gis-map/adapters/proxy'
import { createWindPlugin } from '@gtp/gis-map/core/wind'

// 모듈 상수로 둔다 — Provider config는 처음 한 번만 읽고, 렌더마다 새 객체를 만들 이유가 없다
const CONFIG = {
    view: { center: [127.0, 37.5] as [number, number], zoom: 12 },
    theme: { primary: '#1d4ed8' },
    sources: [restSources(), proxySources()],
}
const setup = (map: import('@gtp/gis-map/core').GisMap) => { map.use(createWindPlugin()) }

export default function MapPage() {
    const host = useMyHost()   // 아래 "호스트 주입". 값이 바뀔 때만 새 객체(useMemo)
    return (
        <div style={{ width: '100%', height: '100vh' }}>
            <GisMapProvider host={host} config={CONFIG} setup={setup}>
                <MapShell brand={{ title: '업무 지도' }} panels={defaultPanels} />
            </GisMapProvider>
        </div>
    )
}
```

- 설정 패널(`settings`, 기본 켬 — 화면 테마·시작 화면·데이터 기준 정보): **`settings={false}`는 UI만 끈다.** 시작 화면 자동 적용(저장한 위치로 열기)을 끄려면 `config.startView.autoApply:false`를 따로 준다.
- `MapShell` 주요 props: `brand`(false면 숨김), `panels`(기본 레이어·TIFF·나만의지도, 호스트 패널을 더함), `defaultPanel`·`onPanelChange`,
  `show*`(Header·Search·BasemapSwitcher·User·NavRail·Toolbar·RegionBadge·MobileLayerButton·WindLegend·StatusBar), `statusBarProjection`(기본 EPSG:5186).
- **머리줄 사용자 메뉴** `userMenuItems`(옵션): `{ id, label, icon?: ReactNode, onSelect }[]`를 주면 머리줄의 사용자 표시(원·이름·역할)가 단추가 되어 누르면 드롭다운으로 항목을 보여 준다
  (바깥 클릭·Esc·Tab·항목 선택으로 닫힘, 단추에서 ↓로 열고 ↑↓·Home·End로 이동, 768px 미만에서는 원 모양만 남아 모바일에서도 쓸 수 있다). 대시보드 이동·로그아웃처럼 패키지가 모르는 동작은 전부 호스트의 `onSelect`다
  (패키지는 라우터·로그아웃 방식을 모른다 — `GisMapHost`는 건드리지 않는다). 없거나 빈 배열이면 사용자 표시는 옛 모양 그대로. `host.getCurrentUser()`가 사용자를 줄 때만 보이고 `headerRight`·`showUser={false}`면 쓰이지 않는다.
  GTProject 예: `_gtp/useGtpUserMenu.ts`(훅) + `_gtp/gtpUserMenu.tsx`(항목 — `MAP_USER`는 `/`가 `/map`으로 되돌려지므로 대시보드 항목을 뺀다).
  `MapHeader`도 같은 prop(`userMenuItems`).
- 위젯을 따로 조립할 때는 `<MapRoot>`(또는 class `gm-root`) 안에 두고, 지도 div는 `<GisMapView>`로 만든다. 위젯은 가장 가까운 Provider의 엔진만 본다
  → 한 화면에 Provider 둘이면 지도 둘이 서로 독립이다.
- 이미 만든 `ol.Map`에 붙이려면 `<GisMapProvider attachTo={olMap}>`(이때 `<GisMapView>`는 필요 없다). 앱과 패키지가 **같은 ol 사본**을 써야 한다.
- GTProject 연결부 예시: `frontend/src/app/map/page.tsx`, `frontend/src/app/map/_gtp/`(호스트·설정·앱 기억). 이 파일들은 이식 대상이 아니다.

### 화면 분할 — 2·3·4분할, 지도마다 레이어 따로 (`MapShell split`)

한 화면에 지도 2~4개를 나란히 놓고 지도마다 레이어·투명도·배경지도를 따로 조정한다. **기본은 꺼짐**이라 `split`을 안 주면 지금과 똑같이 동작한다.

```tsx
<GisMapProvider host={host} config={CONFIG} setup={setup}>
    <MapShell split={{ defaultSync: true }} panels={defaultPanels} />   {/* split / split={true}도 된다 */}
</GisMapProvider>

// setup은 지도 하나를 만들 때마다 불린다(분할로 지도가 늘어도). 두 번째 인자 info.pane이 지도 번호(0 = 첫 지도)다.
// 바람길처럼 지도마다 켜면 안 되는 것(운영 서버 요청이 지도 수만큼 늘어난다)과 페이지 이동 간 기억 복원은 pane 0에서만 한다.
const setup = (map: GisMap, info: GisMapSetupInfo) => {
    if (info.pane !== 0) return
    map.use(createWindPlugin())
}
```

- 머리줄에 분할 셀렉트(분할 없음·2·3·4분할)와 "화면 연동" 단추가 생긴다. 3분할은 같은 크기 세로 3칸, 칸이 좁으면 번호 칩·지역명 배지가 줄고, 아주 좁으면 가로 띠로 쌓인다. 768px 미만(모바일)에서는 활성 칸 하나만 보인다.
- **활성 지도**: 칸을 누르거나 레이어 패널 위쪽 "대상 지도" 탭을 누르면 바뀐다. 레이어 패널·배경지도 단추·도구 모음·검색·상태바·출력·필지 정보·영역 분석은 모두 **활성 지도에만** 적용된다(도구는 활성 지도를 바꾸면 이전 지도에서 꺼진다). 바람지도는 `setup`이 설치한 지도(보통 0번)에서만 보인다.
- `split` 옵션: `defaultCount`(1~4)·`onCountChange`·`defaultSync`(기본 켬)·`initialPaneState`. 지도를 늘릴 때 새 지도의 처음 상태는 `'view-basemap'`(기본 — 활성 지도의 시점·배경지도만 복사, 주제 레이어는 기본값) · `'clone-layers'`(레이어·투명도까지 복제) · `'default'`. 줄이면 뒤 번호 지도부터 닫히고 상태는 버려진다.
- 레이어 목록(트리)은 한 번만 받아 모든 지도가 나눠 쓴다(분할해도 목록 요청이 늘지 않는다). 나만의지도·GeoTIFF를 지울 때는 다른 지도에서도 사라진다.
- 위젯을 따로 조립한다면 바깥에 `<GisMapSplitProvider>`를 두고 칸마다 `<GisMapPane index={i}>`, 상태는 `useGisMapSplit()`(`count`·`activeIndex`·`panes`)로 읽는다. 투어·패널 때문에 셸이 다시 마운트되는 화면(GTProject `/demo`)은 이 방식으로 지도를 셸 밖에서 소유한다.
- 한계: `<GisMapProvider attachTo={olMap}>`(기존 지도에 붙이기)는 보조 지도를 만들 수 없어 분할을 지원하지 않는다. UMD(`GisMap.create`·`attach`)에는 분할 화면 UI가 없고 이동·확대 연동 도우미만 있다 — 아래 2·3절 참고.

## 2. JSP에서 — UMD (a) `GisMap.create`

```html
<link rel="stylesheet" href="…/gis-map/0.1.0/gis-map.css">
<div id="map" class="gm-root" style="height:600px"></div>   <!-- gm-root 필수 -->
<script src="…/gis-map/0.1.0/gis-map.umd.js"></script>
<script>
  var map = GisMap.create({
    target: 'map',
    host: { endpoints: { apiBaseUrl: ctx, proxyBaseUrl: ctx + '/gis/proxy' }, keys: { vworld: vworldKey } },
    sources: [GisMap.adapters.rest(), GisMap.adapters.proxy()],
    view: { center: [127.0, 37.5], zoom: 12 }
  });
  document.getElementById('btnArea').onclick = function () { map.tools.activate('measure-area'); };
</script>
```

서버 값(키·주소·CSRF 토큰)을 넘기는 법, `<c:url>`을 쓰지 않는 이유, bfcache·AMD 로더 대응은 **`examples/jsp/README.md`**에 있다.

**지도 여러 개의 이동·확대 연동**: 지도를 `div` 둘에 따로 만들고 `var link = GisMap.linkViews([mapA, mapB]); … link.destroy();`(둘 이상이어도 된다. `link.add(map)`·`link.remove(map)`). 한쪽을 움직이면 나머지가 같은 중심·해상도·회전으로 따라간다. 지도마다 레이어는 따로 조정하며(분할 화면 셀렉트·패널은 React 위젯이라 UMD에는 없다), attach 번들도 같은 `GisMap.linkViews`를 쓴다. 뷰 좌표계가 같은 지도끼리만 묶인다.

**서버 없이 시험·시연(`adapters/memory`)**: `sources: [GisMap.adapters.memory(data)]` — `data`(레이어 트리·나만의지도 레이어 GeoJSON·필지+건물·장소·지역·영역 분석 레이어·바람 프레임·공유 상대)에 넣은 항목의 소스만 만든다(없는 항목은 그 기능이 꺼짐). 저장소(나만의지도 수정·삭제·공유)는 호출마다 새로 만든 객체라 소스를 다시 만들면 처음 상태다. `GisMap.adapters.demo({ basemap: 'osm' | 'vworld' | 'both' | 'none', vworldKey, bigCounts })`은 합성 샘플 한 벌(세종 인근 가상 필지 300개·건물·시설·노선·큰 점 데이터·바람 9프레임, 시드 고정, 가상 PNU는 `3611099900` + 본번 9000번대)과 배경지도 설정을 `{ sources, config, view, notice, data }`로 돌려준다. 서버 호출 0 — 업로드 계열은 안내 문구로 reject한다. 이 어댑터로 만든 정적 예제는 `examples/gis-demo/`.

## 3. 기존 지도에 붙이기 — UMD (b) `GisMap.attach`

```html
<script src="…/ol/ol.js"></script>                       <!-- 업무 화면이 원래 쓰던 ol(7.1 이상) — 먼저 -->
<link rel="stylesheet" href="…/gis-map/0.1.0/gis-map.attach.css">   <!-- ol.css 없음 -->
<script src="…/gis-map/0.1.0/gis-map.attach.umd.js"></script>
<script>
  if (GisMap.checkOl().ok) {
    var gis = GisMap.attach(workMap, { sources: [GisMap.adapters.proxy()], zIndex: { tools: 900, parcel: 950 } });
  }
  // gis.destroy() → 엔진이 붙인 레이어·interaction·overlay·리스너만 떼고 업무 지도는 그대로
</script>
```

엔진은 업무 지도의 target·View·기존 레이어를 건드리지 않는다. 버전별 결과는 **`COMPATIBILITY.md`**, 붙이기 규칙·좌표계 주의는 `examples/jsp/README.md` 6절.
ES 모듈 ol만 쓰는 업무 화면(webpack·vite)은 attach UMD 대신 패키지 소스의 `attachGisMap`을 번들러로 쓴다.

## 영역 분석 — 영역 안 개수·면적·열별 집계 (`map.areaAnalysis`)

영역(다각형·사각형·원·현재 화면)을 정하고 분석할 레이어를 고르면 레이어마다 **개수 · 걸친 면적 합 · 영역으로 잘라낸 면적 합 · 선 길이 합 · 숫자 열 통계(합계·평균·최소·최대) · 범주 열별 집계표**를 계산한다.
엔진 인스턴스의 `areaAnalysis` 컨트롤러(React 없음)가 기본이고, React 위젯 `AreaAnalysisPanel`(도구 모음 "영역 분석" 단추)은 그 위의 선택형 화면이다.
**대상은 레이어 트리의 GeoServer(WFS)·VWorld(Data API) 레이어**다(나만의지도는 대상이 아니다). 서버가 "영역에 걸친 피처"만 걸러 주고(`sources.areaQuery`), 선택 기준·잘라낸 면적·집계는 브라우저가 한다.

```js
// React: MapShell 도구 모음에 "영역 분석" 단추가 기본으로 있다(showAreaAnalysis={false}로 끔, 메뉴 권한 'map.tool.area-analysis'로 숨김)

// 직접 쓰기(React·UMD (a)·UMD (b) 공통): 엔진 인스턴스의 areaAnalysis
const A = gis.areaAnalysis
A.store.getState().layers                                  // 분석할 수 있는 레이어 목록(종류·켜짐·질의 가능·회색 사유). 트리가 올라오면 채워진다
A.refreshLayers()                                          // 패널을 열 때처럼: 아직 모르는 레이어의 질의 가능 여부를 레이어당 1번 판정(캐시)
A.setArea(sigungu4326)                                     // 경위도 GeoJSON Polygon(구멍·꼬인 선은 Error). 또는 startDrawing('polygon'|'box'|'circle') · useViewExtent()
A.setPicked([{ kind: 'tree', layerId: 21 }])               // 분석할 레이어(쉼표로 묶인 VWorld 이름은 { kind:'tree', layerId, part:'lt_c_uq111' })
A.setMode('intersects')                                    // 걸침(기본) · 'center' 중심점 · 'within' 완전히 안
const [r] = await A.run()                                  // ①질의 가능·예상 건수 → ②사전 확인 → ③쪽으로 받기 → ④브라우저에서 계산. cancel()로 멈춤(요청도 끊는다)
r.status                                                   // 'done' | 'partial'(일부만) | 'error' | 'cancelled'
r.count; r.total; r.received; r.clipAreaM2; r.sumAreaM2; r.numeric; r.category   // 개수 · 서버가 센 전체 건수 · 집계한 건수 · 잘라낸 면적 · 걸친 면적 합 · 숫자 열 · 범주표
A.setCategory(r.ref, 'jimok')                              // 범주 열 바꾸기(재질의 없이)
A.answerConfirm('limit')                                   // 사전 확인(state.confirm이 있을 때): 'limit' 상한까지만 · 'skip-over' 넘는 레이어 빼기 · 'cancel'
GisMap.saveBlob(A.exportResult(r.ref, 'csv'), 'result.csv')   // 'geojson'도. CSV는 UTF-8 BOM·수식 주입 방지. A.resultRecords(ref)는 결과 목록용 행
A.clear()                                                  // 영역·결과·강조 지움(map.clearAll()도 함께 지운다)
```

- **질의 수단(`sources.areaQuery`)**: `describe(layer, part)`(질의 가능 여부·열 정보, 코어가 레이어당 1번만 부르고 캐시) · `count?(layer, part, ring4326)`(걸친 건수만, 가능할 때) · `query(layer, part, ring4326, page)`(걸친 피처 한 쪽 — GeoJSON 4326 경도·위도 순). `GisMap.adapters.proxy()`(`proxySources()`)가 VWorld·GeoServer용을 만든다. 없으면 레이어 목록이 비어 "분석할 수 있는 레이어가 없습니다"만 보인다.
- **호스트가 갖춰야 할 것**: **VWorld** — `{proxyBaseUrl}/vworld/data` 프록시(키를 서버가 붙인다). 열린 프록시로 두지 말고 `data` 레이어 이름 허용 목록·`size` ≤ 1000·허용 파라미터만 넘기고, 업스트림 오류는 오류 상태로 돌려준다(GTProject 예: `app/proxy/vworld/data/route.ts`). VWorld 키는 도메인에 묶여 있어 이식처 도메인 키가 필요하다. **GeoServer** — 브라우저가 WFS를 **직접** 부르므로 그 서버가 **CORS**(`Access-Control-Allow-Origin`)를 허용해야 한다(같은 출처 프록시 뒤에 두고 레이어 주소를 그쪽으로 해도 된다). 우리 로그인 토큰은 GeoServer로 보내지 않는다(`http.fetchExternal` — 헤더·쿠키 없음, 401이어도 로그아웃하지 않는다).
- **어떤 트리 레이어가 대상인가**: VWorld WMS(주소에 `vworld.kr`, 레이어 이름을 대문자로 올려 Data API 이름으로 쓴다 — 쉼표로 묶인 이름은 나눠서) · `sourceType === 'GEOSERVER'`인 WMS/WFS(WFS 주소는 레이어 WMS 주소의 `/wms`·`/ows` → `/wfs`, 안 되면 `host.endpoints.geoserverUrl + '/wfs'`; `DescribeFeatureType` 성공 = 발행됨). 그 밖(그림 레이어·다른 서버 WMS)은 목록에 회색 + 사유로 보이고 분석할 수 없다. 모르는 VWorld 이름은 첫 질의 결과로 판정하고(안 되면 회색, 캐시) 호스트가 `proxySources({ areaQuery: { vworldDataName: n => … } })`로 이름표를 덮어쓸 수 있다.
- **GeoServer 실측 사항(2026-11-02)**: 영역 필터는 `cql_filter=INTERSECTS(<geom>, SRID=4326;POLYGON(…))` — EPSG 표기가 없으면 레이어 원본 좌표계(예: 5179)로 읽혀 0건이 된다. 결과는 `srsName=EPSG:3857`로 받아 4326으로 역변환한다(4326로 받으면 소수 4자리로 잘려 온다). 쪽 넘김은 `startIndex`+`count`+`sortBy`. 건수는 `resultType=hits`.
- **VWorld 실측 사항**: 필수 `service=data&version=2.0&request=GetFeature`. 전체 건수는 `response.record.total`(`page.total`은 쪽 수), 쪽당 최대 1000, 결과 없음은 `status: NOT_FOUND`, 오류는 프록시가 200으로 줘도 본문 `status: ERROR` + `error.code`. 지목은 따로 없어 `jibun` 끝 글자("708 대" → 대)를 파생 열로 만들고, 단가 `jiga`는 합계를 숨긴다(평균·최소·최대만). 서버에 보내는 영역은 꼭짓점 200개까지(넘으면 볼록 껍질 → 범위 사각형으로 키워 보내고, 정확한 판정은 브라우저가 원래 영역으로 다시 한다).
- **상한·확인(조용히 틀린 통계 금지)**: 원격 레이어당 최대 5,000건(`areaAnalysis.maxFeaturesPerLayer`)까지만 집계하고 넘으면 카드에 "전체 12,400건 중 5,000건만 집계"(상태 `partial`). 예상 건수(GeoServer hits·VWorld 1쪽 total)가 상한을 넘거나 영역이 25 ㎢(`areaWarnKm2`)를 넘으면 받기 전에 묻는다(`state.confirm` → `answerConfirm`). 레이어 단위 동시 요청 2개(`maxConcurrent`). 패널을 열기만 해서는 질의가 없고(레이어당 describe 1번만) **분석** 단추를 눌러야 서버에 간다.
- 선택 기준: 걸침(서버 필터와 같음) · 중심점(피처 중심이 영역 안 — 경계에 걸친 피처가 한쪽에만 셈) · 완전히 안. 서버는 걸침 후보만 주므로 기준을 바꿔도 **다시 받지 않고** 받아 둔 피처로 다시 센다.
- 면적: 걸친 면적 합 = 선택된 면 피처 **전체** 면적, 잘라낸 면적 = **영역 안쪽만**. 둘 다 `ol/sphere getArea`와 같은 구면 공식(측정 도구와 값이 맞는다). 영역이 오목해도(다각형) 정확하다.
- 지도 강조: 선택된 피처를 별도 레이어(`theme.selection` 청록, 가리키는 피처 `active` 빨강)로 그린다 — 레이어당 5,000개까지(`areaAnalysis.highlightMax`). 레이어가 지도에서 꺼지면 그 강조를 빼고 카드에 "지도에서 꺼짐". 강조 레이어는 `className`을 따로 준다(OL이 같은 className 레이어를 한 캔버스에 겹쳐 그려, CORS 없는 레이어로 오염된 캔버스에 섞이지 않게). 결과 목록(React "목록" 단추): 행을 누르면 지도가 그 피처로 이동하고 빨간 강조.
- 엔진 설정 `areaAnalysis`(`GisMapAreaAnalysisConfig`): `highlightMax`(5000)·`categoryTop`(범주표 값 수, 8)·`chunkMs`(12)·`maxFeaturesPerLayer`(5000)·`areaWarnKm2`(25)·`maxConcurrent`(2). 새 ol API: `proj.getTransform`(COMPATIBILITY.md).
- 한계: 영역 꼭짓점 5,000개까지(꼬임 검사·삼각 분할이 O(n²)). 서버 필터는 경위도 직선, 브라우저 판정은 뷰 좌표계 직선이라 대각선 변에서 수십 cm 어긋날 수 있다(경계에 겨우 닿는 피처 누락 가능). 쪼갠 변이 경위도에서 곡선이라 같은 피처를 격자로 잘라 더한 값과 원래 면적이 ppm 단위로 다르다(ol getArea도 같은 성질).

## 필지 정보 — 필지를 눌러 속성·건물 보기 (`map.parcelInfo`)

도구 모음의 **"필지 정보"** 도구를 켜고 필지를 누르면 PNU·지번 주소·지목(약어 + 정식 명칭 28종)·면적·공시지가·고시년월과 **그 필지의 건물 목록**(도로명주소별 묶음·건물명·동·공동주택·기초구역번호)이 카드로 뜬다. 필지 경계는 지도에 강조된다(핀 없음).
엔진의 `parcelInfo` 컨트롤러(React 없음)가 기본이고, React 위젯 `ParcelInfoCard`(도구 모음 단추 — 출력·영역 분석 패널과 같은 자리의 카드, 모바일은 아래 시트)는 그 위의 선택형 화면이다.

```js
// React: MapShell 도구 모음에 "필지 정보" 단추가 기본으로 있다(showParcelInfo={false}로 끔, 메뉴 권한 'map.tool.parcel-info'로 숨김,
//        sources.parcel.infoAt이 없으면 단추 자체가 없다)

// 직접 쓰기(React·UMD (a)·UMD (b) 공통): 엔진 인스턴스의 parcelInfo
gis.tools.activate('parcel-info')              // 켜져 있는 동안만 지도 클릭을 듣는다(토글). 다른 도구(그리기·측정·반경·영역 분석)와 서로 배타
const P = gis.parcelInfo
P.available                                    // sources.parcel.infoAt이 있다
P.store.subscribe(state => render(state))      // { open, point, parcel:{status,info,areaM2,error}, buildings:{status,result,error,loadingAll} }
await P.lookupAt(lon, lat)                     // 클릭과 같은 동작(도구 없이도). 같은 필지 안이면 요청하지 않는다
P.retry()                                      // 필지 오류면 다시 조회, 건물 오류·준비 중이면 건물만 다시
P.loadAllBuildings()                           // 잘린 목록(truncated)을 limit 1000으로 다시 받는다
P.close()                                      // 카드·강조·진행 중 요청을 지운다(도구는 켜진 채). map.clearAll()도 함께 지운다
GisMap.jimokName('도')                         // → '도로'  (UMD. ESM은 core의 jimokName)
```

- **소스 둘**: 필지 속성·경계 = `sources.parcel.infoAt(lon, lat, signal)`(오류는 throw — 키·한도·네트워크 문구가 카드에 그대로 보인다. `proxySources()`의 VWorld 점 질의 `LP_PA_CBND_BUBUN`, 호스트 프록시 `/vworld/data` — 기존 프록시 그대로, 수정 없음) · 건물 = `sources.parcelBuildings.byPnu(pnu, { limit, signal })`(`restSources()` = 짝 백엔드 `GET /api/mymap/ref/parcels/{pnu}/buildings?limit=`, 로그인 필요, query-spec **U25**). `parcelBuildings`가 없으면 카드에 건물 칸이 없고, 서버가 404면(이식처에 U25가 없음) 이후 건물 조회를 끈다. 403은 "로그인이 필요합니다", 503은 "자료 준비 중".
- **조회 흐름**: 클릭 → 필지 1건(VWorld 1번) → 경계 강조·면적 → 건물 목록(PNU별로 최근 30건·5분 캐시). 연속 클릭은 앞 요청을 취소하고 늦게 온 응답은 버린다. 같은 필지 안을 다시 누르면 요청 0.
- **면적**은 받은 경계로 면적 측정 도구와 같은 구면 공식(`ol/sphere getArea`, 뷰 좌표계)으로 잰 "지도 도형 기준" 값이다 — 토지대장 면적과 다를 수 있다(카드에 그렇게 표시).
- **건물은 대표지번 기준**이다: 건물DB는 건물마다 대표지번이 하나뿐이라 여러 필지에 걸친 단지는 대표 필지에서만 보인다. 백엔드에 관련지번 색인(`ix_ti_scco_mvmn_jibun`)이 있으면 나머지 필지에서도 "관련지번"으로 보인다. 건물DB에는 층수·주용도·사용승인일이 없다(후속: VWorld `LT_C_SPBD`·건축물대장). 소유자는 개인정보라 다루지 않는다.
- **호스트가 갖춰야 할 것**: VWorld 점 질의 프록시(`/vworld/data`, 영역 분석과 같음) + (건물 칸을 쓰면) 백엔드 U25와 건물DB 표·**지번 색인 `ix_ti_spbd_buld_jibun`(필수 — 없으면 503, 조회 안 함)** — `.claude/skills/map-module-export/references/{ddl,query-spec}.md`.
- **UMD**: 1차는 코어 상태 API만 있다(카드 DOM은 React 위젯 — JSP 예제는 `store.subscribe`로 간단 DOM 출력). 새 ol API 0, 새 npm 0.
- 한계: 건물 칸은 필지 속성과 기준월이 다를 수 있다(분할·합병 직후 0건 가능). 필지 정보 도구가 켜진 동안에는 나만의지도 팝업·영역 분석 선택이 동작하지 않는다(도구가 하나만 켜지므로).

## 지도 출력 — PNG · PDF · 인쇄 (`map.print`)

지금 보이는 지도를 제목·범례·축척 막대·방위표·출력일·출처가 들어간 A4/A3 한 장으로 내보낸다. 엔진 인스턴스의 `print` 컨트롤러(React 없음)가 기본이고,
React 위젯 `PrintPanel`(도구 모음 "출력" 단추)은 그 위의 선택형 화면이다. 지도를 캔버스로 합성하므로 **호스트 책임이 하나 있다 — 아래 "crossOrigin·CORS"**.

```ts
// React: MapShell 도구 모음에 "출력" 단추가 기본으로 있다(showPrint={false}로 끔, 메뉴 권한 'map.tool.print'로 숨김)
<MapShell /* … */ showPrint />
// 직접 쓰기(React·UMD (a)·UMD (b) 공통): 엔진 인스턴스의 print
gis.print.showFrame({ paper: 'A4', orientation: 'landscape' })   // 지도 위 용지 비율 틀(지도는 계속 움직일 수 있다)
gis.print.setScale(5000)                                          // 용지에서 1:5,000이 되도록 틀 크기(필요하면 줌 한 단계씩)를 맞춘다. null = 화면 그대로
const blob = await gis.print.exportPdf({ title: '민원 위치도' })   // exportPng 도 같다. 오염되면 GisPrintError('TAINTED')
saveBlob(blob, '위치도.pdf')                                       // UMD: GisMap.saveBlob(blob, '위치도.pdf')
await gis.print.print({ title: '현황도' })                         // 브라우저 인쇄 창(숨은 iframe). 인쇄 창이 닫히면 resolve. 오염돼도 된다
const page = await gis.print.render({ dpi: 72 })                  // 파일로 내보내지 않고 캔버스만(미리보기·직접 처리) — page.tainted·taintSuspects·warnings
```

- 옵션(`PrintOptions`): `paper`(A4·A3)·`orientation`·`dpi`(72~200, 기본 150)·`title`·`subtitle`(생략 = 지도 중심 지역명, `null`·`''` = 없음)·`show`(legend·scaleBar·northArrow·date·attribution·logo).
- 엔진 설정 `print`(`PrintLayoutConfig`): `organization`(기관명)·`logo`(URL·data URI)·`attributions`(항상 붙일 출처)·`vworldAttribution`(켜진 레이어에 vworld.kr이 있으면 자동으로 붙는 문구, 기본 "배경지도: 브이월드(국토교통부)", `false` = 끔)·`fontFamily`·`defaultDpi`·`scales`·`renderTimeoutMs`.
  UMD: `GisMap.attach(map, { print: { organization: 'OO시' } })`.
- PDF는 의존성 없는 최소 PDF(그림 1장 임베드)라 글자는 그림이다(선택·검색 안 됨). 지도 그림 해상도는 **화면에 그려진 픽셀 그대로**(기기 픽셀 배율 포함)라 틀이 작으면 낮다(패널이 "지도 해상도 약 N dpi"를 보여 준다). 300dpi 고해상도는 후속.
- 안 찍히는 것: 나만의지도 팝업·호스트 HTML 오버레이·지역명 배지·바람 범례(측정값 툴팁은 상자로 다시 그린다). 바람 입자는 그 순간 정지 화면.
- 축척은 지도 중심 기준(웹 메르카토르는 위아래가 다르다). 용지 축척은 PDF를 "실제 크기(100%)"로 인쇄해야 맞다. 방위표는 뷰 회전만 반영한다.
- 새 ol API: `proj.getPointResolution`(COMPATIBILITY.md). 그 밖은 DOM·Canvas API.

### crossOrigin·CORS — 호스트 책임

브라우저는 CORS 허락 없이 다른 출처에서 받은 그림이 섞인 캔버스를 "오염(tainted)"으로 막아 **PNG·PDF 저장이 `GisPrintError('TAINTED')`로 실패**한다(화면 표시·인쇄 창은 무관).
`PrintPage.taintSuspects`가 원인 후보 레이어 이름(다른 출처 주소 + crossOrigin 없음)을 알려 준다. 인쇄 창에서 "PDF로 저장"은 오염과 상관없이 된다.

- 기본(`defaultLayerCrossOrigin`): **VWorld 타일(XYZ) 배경지도에만 `crossOrigin: 'anonymous'`**(VWorld가 `Access-Control-Allow-Origin: *`를 준다). VWorld가 CORS를 내리면 배경지도가 안 보이게 되므로 `layers: { crossOrigin: () => null }`로 끌 수 있다(옛 동작).
- WMS(VWorld WMS·GeoServer)는 서버 CORS를 모르므로 **기본 끔** — 서버가 CORS를 안 주는데 켜면 그 레이어가 아예 안 보인다. CORS를 켠 서버만 호스트가 지정한다:
  `layers: { crossOrigin: (layer, url) => url.indexOf('https://geo.example.com/') === 0 ? 'anonymous' : defaultLayerCrossOrigin(layer, url) }`
  (`layer` = LayerDef, `url` = resolveUrl이 끝난 요청 주소.) GeoServer는 기본으로 CORS가 꺼져 있다 — CORS 필터를 켜거나(web.xml) 같은 출처 경로(nginx)로 내보낸다.
- 로고·범례 이미지는 `crossOrigin='anonymous'`로 읽는다. CORS가 없으면 그 그림만 빼고 경고(`LOGO_SKIPPED`·`LEGEND_IMAGE_SKIPPED`)가 나온다(캔버스는 오염되지 않는다).
- attach 호스트의 자기 레이어(`ol.source.*`)는 호스트가 소스를 만들 때 `crossOrigin`을 준다. 엔진은 호스트 레이어를 바꾸지 않는다(오염 후보로만 알려 준다).

## 호스트 주입 — `GisMapHost` 요약

지도 패키지는 인증·주소·키·권한을 스스로 읽지 않고 호스트에게 받는다. 일부만 넘기면 나머지는 기본값(`DEFAULT_HOST`)이다.

| 필드 | 뜻 | 기본 |
|---|---|---|
| `http.getHeaders()` | 모든 요청에 붙일 헤더(Bearer 토큰, CSRF 헤더). 요청마다 다시 부른다 | `() => ({})` |
| `http.credentials` / `http.onUnauthorized` | fetch credentials / 401일 때 호출 | `'same-origin'` / 없음 |
| `endpoints.apiBaseUrl` | 짝 백엔드 REST base(`''` = 상대 경로) | `''` |
| `endpoints.proxyBaseUrl` | API 키를 숨기는 호스트 프록시 base | `'/proxy'` |
| `endpoints.geoserverUrl` | GeoServer base(이미지 범례). `''`면 끔 | `''` |
| `keys.vworld` | VWorld 키(레이어 URL의 `{VWORLD_KEY}` 치환) | `''` |
| `getCurrentUser()` | 현재 사용자(`userId`, `role` …) — 함수라 React 밖에서도 최신값 | `() => null` |
| `isFeatureAllowed(id)` / `permissionsReady` | 기능 ID(`map.panel.*`, `map.tool.*`)별 표시 여부 / 권한 로딩 완료 | `() => true` / `true` |

React에서는 `<GisMapProvider host={…}>`가 바뀔 때마다 `map.setHost`로 넣는다(엔진은 유지). host 객체는 값이 바뀔 때만 새로 만든다.

## 데이터 소스 — `GisMapSources` 요약

코어와 위젯은 아래 인터페이스만 안다. 없는 소스의 기능은 조용히 꺼진다(폐쇄망에서 VWorld 없이도 동작).
`sources`에는 객체, 팩토리(`ctx => ({ … })`), 그 배열(왼쪽→오른쪽 병합)을 줄 수 있다.

| 소스 | 하는 일 | 기본 구현 |
|---|---|---|
| `layerTree` (+ `userSelection`) | 그릴 레이어 트리 / 개인 레이어 선택 저장 | `restSources()` |
| `myMap` · `geoTiff` · `wind` | 나만의지도(목록·업로드·결과 보고서·샘플·스타일 저장·공유) · GeoTIFF 타일 · 바람장 | `restSources()` |
| `shareDirectory` | 공유 상대 검색(사용자)·공유 가능한 그룹(역할·세부권한) 목록 — 자원 공통 | `restSources()` |
| `addressSearch` · `parcel` · `regionName` · `legend` · `wfs` | 주소 검색 · 필지 폴리곤(+ 필지 정보 카드의 `parcel.infoAt` 속성·경계) · 지역명 · 범례 · WFS URL | `proxySources()` |
| `parcelBuildings` | 필지 정보 카드의 건물 칸: PNU → 그 필지의 건물 목록(도로명주소별 묶음) | `restSources()` |

짝 백엔드 응답 형식이 다르면 해당 소스만 직접 구현해 배열 뒤쪽에 넣는다. 백엔드(Spring·MyBatis)로 옮길 때의 테이블 DDL·쿼리 명세는
GTProject 저장소의 `.claude/skills/map-module-export/references/`에 있다.
### 나만의지도 (`GisMapSources.myMap`)

`MyMapSource`의 `list`·`status`·`geojson`·`remove`만 필수이고 나머지는 전부 선택이다. **없는 메서드의 화면 요소는 조용히 빠진다**(옛 소스는 옛 화면 그대로).

| 메서드 | 하는 일 | 없으면 |
|---|---|---|
| `list()` · `status(id)` · `geojson(id)` · `remove(id)` | 목록 · 처리 상태 폴링 · GeoJSON(EPSG:4326, 지도에 올릴 때와 `속성 테이블`이 같이 씀) · 삭제 | 나만의지도 기능 없음 |
| `uploadShp?` · `previewExcel?` · `confirmExcel?` | SHP·엑셀 업로드 | 해당 업로드가 안 됨 |
| `shareTarget?` | 공유 저장소(이름·상태가 붙은 현재 공유 · 일괄 더하기/빼기) — 아래 "공유" 절 | `getShare`·`setShare`로 단일 공유만(일괄 단추 없음) |
| `getShare?` · `setShare?` | 옛 공유 입출력(아이디·코드 배열). `shareTarget`이 없을 때만 쓴다 | 공유 칸이 비어 있음 |
| `quota?()` | `{ownedLayers, maxLayers, maxRows:{pnu,address,coord}, maxShpFeatures, maxExcelMb, maxShpMb, coverage}` — `coverage`는 아래 | 패널의 `내 레이어 n/20`과 한도·지적도 기준월 문구가 빠진다(패널을 열 때 1번만 받는다) |
| `downloadSample?(kind)` | `'pnu'` · `'address'` · `'coord'` 중 하나, 샘플 xlsx **바이트(Blob)**. 저장은 위젯이 `<a download>`로 한다 | 업로드 창의 "샘플 받기"가 없다 |
| `importReport?(id, {page, size, reason})` | 소유자 전용 결과 보고서 `{total, matched, failed, byReason, rows:[{rowNo, reason, message, input, candidates}], page, size, totalRows}` | 항목의 빨간 `실패 N`이 링크 대신 글자, ⋯ 메뉴에 `업로드 결과`가 없다 |
| `downloadImportFailures?(id)` | 실패 행 xlsx 바이트 | 보고서에 "실패 행 엑셀 받기"가 없다 |
| `update?(id, {name?, description?, styleConfig?})` | 부분 수정(PATCH, **등록자만** — 아니면 서버가 403 + message로 reject). 빠진 키는 그대로, `styleConfig: ''`는 지움 | 항목 ⋯ 메뉴에 `스타일·라벨`이 없다 — 스타일은 읽기만 한다 |
| `convertExcel?(input)` | 주소 변환(엑셀로만 받기). `{uploadId, addressColumn, include:{pnu, roadAddress, jibunAddress, lonLat, area}, srid}` → `{total, matched, failed, fileName, file: Blob, preview:{columns, rows}}`. 레이어를 만들지 않고 파일만 돌려준다 | 업로드 창에 `결과 받는 방법`(`엑셀로만 받기`)이 없다 — 주소 모드도 옛 화면 그대로 |
| `exportLayer?(id, {format, srid, includeFailed?})` | 레이어 내보내기. `format`은 `'xlsx' | 'geojson'`, `srid`는 EPSG 번호(4326·5186·5179·3857). `{blob, fileName, failedSkipped}` — `failedSkipped`면 보관 기간이 지나 실패 행을 못 담았다 | ⋯ 메뉴에 `내보내기…`가 없다 |

- `confirmExcel(input)`은 `{ id }`를 돌려줄 수 있다(처리는 비동기 — 패널이 목록 폴링으로 진행률을 본다). 옛 소스처럼 아무것도 안 돌려줘도 된다. 입력의 `mode`(`'PNU' | 'ADDRESS' | 'COORD'`)·`pnuColumn`·`addressColumn`은 선택이고
  없으면 좌표(`latColumn`·`lonColumn`·`sourceSrid`)다. 업로드 창은 PNU·주소·좌표 세 방식을 보여 주고, 주소 모드의 후보(`AMBIGUOUS`)는 보고서의 `candidates`로 나온다.
- `previewExcel`의 응답에 `suggestions`가 있으면 모드·컬럼을 미리 고르고, **없으면 옛 서버로 보고 좌표(위도·경도) 하나뿐인 옛 흐름**으로 동작한다. `totalRows`·`limits`·`warnings`
  (`NUMERIC_PNU_CELLS`·`DUPLICATE_FILE`·`OVER_LIMIT`)가 있으면 경고 배너와 행 한도 검사(모드별 `limits`, 없으면 `quota.maxRows`)를 한다. 모르는 경고 코드도 `message`를 그대로 보여 준다.
- 목록 항목의 새 필드(전부 선택): `ownerId`·`ownerName`(공유받은 항목의 "보낸 사람" — 줄 끝에 이름만, 툴팁은 `이름(아이디)`)·`shareCount`(내 항목의 공유 대상 수 — 0보다 크면 사람 아이콘+숫자)·`sourceKind`(`SHP|EXCEL_COORD|EXCEL_PNU|EXCEL_ADDRESS` — 있으면 종류 색 칩)·`progressTotal`/`progressDone`(처리 중 `처리 중 n/m` + 항목 아래 얇은 막대)·
  `matchedCount`/`failedCount`(툴팁 `매칭 N · 실패 M · 지적도 YYYY-MM`, 실패가 있으면 줄 끝 빨간 `실패 N`)·`parcelVersion`·`errorMessage`. `status(id)` 응답에도 같은 진행률·건수 필드를 실을 수 있고, 있으면 처리 중에도 목록에 반영한다(없으면 옛 동작 — 끝났을 때만).
- `quota().coverage`(= `MyMapCoverage`): `{ sidoCodes, parcelVersion, loaded?, nationwide?, restrictedSidoCodes? }`. **`nationwide`가 있는 새 서버**에서는 `sidoCodes` = 실제 적재된 시도(지역 제한이 있으면 그 교집합), `parcelVersion` = 그 중 가장 이른 기준월,
  `loaded` = 시도별 기준월, `nationwide` = 전국 기준 시도(서버 설정, 기본 현행 16개)가 전부 적재되고 제한이 없을 때만 true, `restrictedSidoCodes` = 지역 제한 설정값. **빈 `sidoCodes`는 전국이 아니다.** 업로드 창 문구:
  `nationwide` → "지적도 기준월 2026-10(전국)" / 일부 → "제공 지역: 세종 · 기준월 2026-10"(시도 4개 이상은 "제공 지역: 일부 시도(n/16) · 기준월 …", 시도별 기준월은 마우스를 올리면) + "적재된 시도 밖의 PNU는 실패합니다" 안내 / 비어 있으면 "지적도 자료 준비 중입니다"(PNU 확정은 서버가 503).
  **`nationwide`가 없는 옛 서버**에서는 `sidoCodes`를 지역 제한 설정값으로 보고(비면 "(전국)", 있으면 "(제공 지역: …)") 옛 문구를 그대로 쓴다. 시도 이름표는 `ui/mymap/format.ts`의 `SIDO_NAMES`(12 전남광주·42·45 포함).
- 목록 항목 `errorMessage`(실패한 레이어의 이유)는 패널에 그대로 보이고, `status(id)` 응답의 `parcelVersion`·`geomType`은 끝났을 때 목록에 합친다(목록을 다시 받지 않아도 "지적도 YYYY-MM"이 나온다).
- `confirmExcel`의 반환 `MyMapConfirmResult { id, parcelVersion? }`: PNU 모드의 "예정" 기준월이면 패널이 처리 중인 동안 툴팁 "지적도 2026-10 예정"으로 보이고, 끝나면 상태·목록의 확정값으로 바뀐다. `importReport`의 `duplicatePnuCount`(같은 PNU가 여러 행이라 피처가 겹친 수)가 0보다 크면 보고서에 "중복 PNU N건" 한 줄.
- 서버가 거절하면(5,001행부터 미리보기 400, 미리보기·확정·shp 동시 실행 429 등) 서버 `message`를 업로드 창에 그대로 보여 준다. 파일 고르는 단계에는 "수식은 값으로 붙여넣은 파일" 안내 한 줄이 있다(서버가 수식 셀을 엑셀이 저장한 계산값으로 읽는다).
- **주소 변환(엑셀로만 받기)** — 업로드 마법사 2단계에서 **주소 모드이고 소스에 `convertExcel`이 있을 때만** 주소 컬럼 아래에 `결과 받는 방법: 지도에 올리기 / 엑셀로만 받기`가 나온다(없는 호스트는 지금 화면 그대로, 하위 호환). `엑셀로만 받기`를 고르면 `지도 이름` 칸이 사라지고 `결과 엑셀에 붙일 열`(PNU·법정동코드 / 표준 도로명주소·지번주소 / 경도·위도(필지 안쪽 대표점) 기본 켜짐, 필지 면적(㎡) 기본 꺼짐)과 `좌표계`(4326 기본·5186·5179·3857)가 보이며 제출 단추는 `변환하고 엑셀 받기`다. 끝나면 같은 모달이 **결과 화면**(전체·성공·실패 카드, 미리보기 앞 5행 — 붙은 열 주황 머리글·`매칭상태`가 `실패`인 행 연한 빨강, `엑셀 다시 받기` = 메모리의 Blob을 다시 저장하고 서버를 다시 부르지 않음)으로 바뀌고 파일은 **자동으로 한 번 내려받아진다**. `고친 행만 다시 올리기`는 마법사 처음으로 돌아간다. 변환 요청이 도는 동안에는 모드·주소 컬럼·좌표계·붙일 열·`결과 받는 방법`·`다른 파일`·`이전`·제출 단추가 모두 잠긴다(닫기 X·Esc·바깥 클릭은 가능 — 닫으면 응답을 버린다). 오류는 모달에 문구로 보이고 **같은 `uploadId`로 다시 시도**할 수 있다(503·413·500·429 등). 단 소스가 `GisHttpError(404)`로 reject하면(올린 파일이 없거나 만료) "올린 파일을 다시 선택해 주세요" 안내와 함께 파일 고르기 단계로 되돌아간다(`adapters/rest`는 변환 응답 404를 그렇게 던진다). 모드·컬럼·옵션을 바꾸면 이전 결과는 버린다. 붙은 열은 `preview.columns`에서 마지막 `매칭상태` 또는 `매칭상태 (숫자)`(원본에 같은 이름의 열이 있으면 서버가 번호를 붙인다) 열부터 끝까지로 본다(없으면 강조 없음).
- **내보내기** — ⋯ 메뉴 `내보내기…`(소유자는 `속성 테이블` 아래·`삭제` 위, 공유받은 항목은 `속성 테이블` 아래; 처리 중·실패 항목에는 없음). 대화상자에서 형식(엑셀·GeoJSON)·좌표계(기본 4326)·`매칭 실패 행도 포함`(엑셀만, 기본 꺼짐)을 골라 `exportLayer`를 부르고 받은 파일을 저장한다. 진행 중에는 `내려받기`만 잠기고, 오류는 대화상자 안에 보인다. 대화상자를 닫으면 진행 중 요청을 `AbortSignal`로 취소한다(`exportLayer(id, opts, signal?)` — 어댑터는 `ctx.http.fetch`에 그대로 넘기고, 취소된 요청은 오류 문구를 띄우지 않는다). `failedSkipped`면 파일은 내려받되 "보관 기간이 지나 실패 행은 포함하지 못했습니다" 안내를 보여 주고 창을 닫지 않는다.
- 파일 저장(샘플·실패 행 엑셀)은 `<a download>`를 클릭하고 **30초 뒤에** `URL.revokeObjectURL`한다(Firefox가 클릭 직후 해제를 취소로 처리하는 것을 피함). 실패 행이 보관 기간(30일)이 지나 지워진 레이어는 보고서가 안내만 보여 준다.
- `adapters/rest`: 응답 본문이 JSON이 아니면(프록시의 413·502 HTML 등) "Unexpected token" 대신 호출부의 기본 문구, 413은 "파일이 너무 큽니다(서버 한도)"로 던진다.
- 엔진: `map.vector.openCatalog()`의 상태(`MyMapCatalogState`)에 `quota: MyMapQuota | null`이 늘었다. 훅은 새로 만들지 않았다(`useMyMapCatalog()`로 같은 상태). 패널은 내 레이어 / 공유받은 레이어 두 묶음으로 나눠 그린다
  (공유받은 항목이 있을 때만 묶음 제목이 나온다).
- 패널 항목은 **두 줄**이다: 1줄 이름(체크 켜짐이면 굵게, 실패는 빨강), 2줄 `종류 칩 · N개 · (공유 수) · (처리 중 n/m | 처리 실패 · 오류 메시지) · (실패 N) · (보낸 사람)`.
  결과 줄(매칭·실패·기준월)은 평소 숨기고 1·2줄의 `title` 툴팁으로만 보인다. 오른쪽 단추는 `위치로 이동`과 `⋯`(더보기) 둘뿐이다(선택 모드에서는 둘 다 숨김).
  `⋯` 메뉴(소유자): `스타일·라벨`(`update` + 완료) / `업로드 결과`(`importReport` + 건수가 있거나 끝난 엑셀 — **실패 0이어도** 요약이 열린다) / `속성 테이블`(완료) / `내보내기…`(`exportLayer` + 완료) / `삭제`(확인창을 거침).
  처리 중·실패 항목은 해당되는 것만(삭제는 항상), 공유받은 항목은 `속성 테이블`(+ `exportLayer`가 있으면 `내보내기…`)(없으면 `⋯` 자체가 없다). 공유는 `⋯` 메뉴에 없고 패널 상단 `공유`(선택 모드) 하나로만 한다 — 상단 `공유`는 **항상 보이고**(내 레이어가 0개면 비활성), 일괄 공유(`shareTarget.bulk`)가 없는 옛 소스(`getShare/setShare`)에서는 한 번에 1개만 고르고(전체 선택 없음, 안내문 없음) 단일 공유 창이 열린다.
  메뉴는 `position: fixed` + 단추 좌표로 놓아(`ui/mymap/menuPosition.ts`) 패널 스크롤 영역에 잘리지 않고, 아래가 모자라면 위로 뜬다. 닫기: 바깥 클릭·Esc(단추로 포커스 복귀)·Tab·스크롤·창 크기 변경·항목 선택, 한 번에 하나만. 키보드는 `ui/menuNav.ts`(UserMenu와 공용).
- 속성 테이블(`ui/mymap/MyMapTableDialog`): 소스의 `geojson(id)`를 한 번 받아 `features[].properties`를 표로 — 열 = 모든 피처 속성 키 합집합(처음 나온 순서, 최대 200열) + 맨 앞 `#`(원래 행 번호), 값은 null→빈 칸·객체→JSON·긴 값→말줄임+`title`, 숫자는 오른쪽 정렬.
  큰 레이어(shp 최대 10만 피처)에서도 멈추지 않게 현재 쪽 100행만 그리고, 필터(전체 열·대소문자 무시, 입력 250ms 뒤 적용)·열 머리글 정렬(오름 → 내림 → 원래, 숫자/글자 구분, 빈 값은 항상 뒤)은 행 번호 배열만 만든다(`ui/mymap/tableModel.ts`).
  숫자 정렬은 값이 모두 숫자(또는 `007`·19자리 PNU가 아닌 숫자 글자)인 열만, 그 밖은 대소문자 무시 글자 순서(로캘 비의존). 공유받은 레이어도 열 수 있다(서버가 권한을 판단, 실패하면 오류 문구). 새 소스·서버 변경 없음.
- 어댑터: `restSources()`의 `myMap`이 위 메서드를 `/api/mymap/{quota, samples/{kind}, {id}/import-report(.xlsx)}`로 구현한다. 파일 응답은 봉투가 없고, 오류 본문의 `message`가 있으면 그 글을 `Error`로 던진다.
  `convertExcel`은 `POST /api/mymap/upload/excel/convert`(JSON 봉투 `data`의 `fileBase64`를 `atob`+`Uint8Array` 청크 변환으로 Blob — 새 의존성 없음), `exportLayer`는 `GET /api/mymap/{id}/export?format&srid&includeFailed`(파일 이름은 `Content-Disposition`의 `filename*` 우선, 없으면 `나만의지도_{id}.xlsx|geojson`; 응답 헤더 `X-Export-Failed-Skipped: true` → `failedSkipped`). **다른 출처**(`apiBaseUrl`이 화면과 다른 주소 — GTProject도 `NEXT_PUBLIC_API_URL`로 8080을 직접 부른다)이면 서버가 `Access-Control-Expose-Headers: Content-Disposition, X-Export-Failed-Skipped`를 줘야 파일 이름·`failedSkipped` 안내가 읽힌다(없으면 기본 이름·안내 없음).

### 공유 (`MyMapSource.shareTarget` · `GisMapSources.shareDirectory`)

공유는 "자원 무관 화면 + 공유 상대 디렉터리 + 자원별 저장소" 세 조각이다. 공유받은 쪽은 **보기만** 한다(권한 등급 없음). 전부 선택 — 없는 조각의 기능은 조용히 줄어든다.

| 조각 | 계약 | 없으면 |
|---|---|---|
| `sources.shareDirectory` (`ShareDirectorySource`) | `searchUsers(query, {limit?})` → `{userId, name, groupLabel?}[]`(2글자 이상일 때만 부름) · `listGroups()` → `{code, label, parentCode?}[]`(역할은 `code`, 세부권한은 `역할:세부` 코드 + `parentCode`) | 아이디·역할 코드를 직접 입력(칩으로 쌓음). 두 메서드가 `GisHttpError` 404·405를 던져도(경로가 없는 서버) 해당 입력만 자동으로 직접 입력으로 바뀐다 |
| `myMap.shareTarget` (`ShareTargetSource`) | `get(id)` → `{users:[{userId,name,state}], roles:[{code,label,state}]}`(`state`: `ACTIVE`·`INACTIVE`·`MISSING`) · `set(id, {userIds, roleCodes})`(통째로 바꾸기) · `getMany?(ids)` · `bulk?(ids, 'ADD'|'REMOVE', change)` → `{succeededIds, failed:[{id, reason:'NOT_AVAILABLE'|'LIMIT_EXCEEDED'}]}` | 옛 `getShare/setShare`를 `legacyShareTarget`이 감싸 단일 공유만(이름 없음). `bulk`가 없으면 패널의 "공유" 단추가 없다. `getMany`가 없으면 "대상 빼기"도 검색·체크로 뺄 대상을 고른다 |

- 단일 공유(`ui/share/ShareDialog`, 레이어 하나): 열면 현재 공유가 이름 칩·역할 체크로 보이고, 저장 = `set`(통째로 바꾸기). **서버 오류는 창을 닫지 않고 하단에 `message`로 보인다**(옛 화면은 무시하고 닫았다 — 의도된 변경).
  현재 공유를 못 받으면 저장 단추가 없다(빈 칸에서 저장하면 기존 공유가 지워진다). 비활성·없는 사용자는 회색 칩("비활성"·"없는 사용자")으로 남아 지울 수 있고, 저장은 그대로 보낸다(서버는 새로 추가되는 대상만 존재 검사).
- 사용자 검색: 250ms 디바운스·요청 순번으로 늦게 온 옛 결과 버림·↑↓ Enter Esc(Esc는 목록만 닫음)·한글 조합 중 Enter는 글자 확정. 본인(`host.getCurrentUser().userId`)은 결과·직접 입력에서 빠진다. 빈 결과·서버 오류(서버 `message` + 다시 시도)를 보여 준다.
- 역할 체크 목록: 역할 아래 세부권한(부서)을 들여쓴다 — **체크는 서로 독립**(역할 전체 ≠ 세부권한). 8개를 넘으면 걸러보기. 목록에 없는 저장값은 "목록에 없는 역할" 칩. 코드는 회색 작은 글씨.
- 일괄 공유(레이어 2개 이상, `shareTarget.bulk` 필요): **[대상 추가 | 대상 빼기]만 있다(덮어쓰기 없음)**. 빼기는 `getMany`로 모은 현재 공유 대상(`2/3개 레이어`)에서 눌러 고른다. 저장 → 결과 화면 `성공 n · 실패 m`(실패 레이어 이름·사유).
  한 번에 레이어 50개·대상(사용자+그룹) 100개까지(화면이 먼저 막고 서버도 검사). `shareTarget.getMany`·`bulk`는 50개 단위 한도를 어댑터·화면이 지킨다.
- 나만의지도 패널: `shareTarget.bulk`가 있으면 머리줄에 "공유" 단추(업로드 옆) → 선택 모드(내 레이어 줄 전체가 선택 대상, 줄 단추 숨김, 공유받은 레이어는 흐리게, 하단 `n개 선택 · 전체 선택 · 공유하기 · 취소`).
  **내 레이어가 1개만 있어도** 단추가 눌린다(1개만 골라도 단일 공유 창 + 안내 한 줄). 내 레이어가 0개(공유받은 것만·빈 목록)이면 단추는 보이되 비활성(title "공유할 내 레이어가 없습니다").
  선택 모드에서 연 공유가 끝나면(1개만 골랐어도) 선택 모드를 닫고 목록을 다시 받는다(`shareCount` 갱신). 공유받은 쪽 화면에는 다음 목록 조회(패널 열기) 때 반영된다.
- React 호스트가 자기 자원에 쓰려면 `@gtp/gis-map/ui`의 `ShareDialog`(`target`·`directory`·`items`·`resourceNoun`·`note`·`selfUserId`·`onClose`·`onDone`)와 `legacyShareTarget`을 쓴다. UMD에는 없다(React 위젯).
- 어댑터: `restSources()`가 `shareDirectory`(`/api/gis/share-directory/{users,groups}`)를 더하고 `myMap.shareTarget`을 `/api/mymap/{id}/share`·`/api/mymap/shares?ids=`·`/api/mymap/shares/bulk`로 구현한다.
  `get` 응답에 `users`·`roles`가 없는 옛 서버는 `userIds`·`roleCodes`로 채운다(이름 null·ACTIVE).

### 나만의지도 스타일·라벨·팝업 (3단계)

레이어마다 **기본 스타일**(면/점·채우기 색·투명도·선 색·두께·점 크기·색·테두리), **값별(범주)·구간별(숫자) 색 나누기**, **라벨**, **클릭 팝업**을 정한다. 서버는 `styleConfig`를 문자열(JSON 객체, 16KB 이하)로 저장하고
저장 전에 아래 v1 스키마를 검사한다. 읽어서 그리는 쪽은 이 패키지다(`core/lib/mymapStyleConfig.ts`). 목록 항목의 `styleConfig`가 없거나 깨졌거나 `v`가 1이 아니면 **옛 고정 스타일 그대로**다(옛 서버·옛 소스 하위 호환).

```jsonc
{ "v": 1,
  "display": "polygon | point",              // 면(필지 그대로) | 점(폴리곤 안쪽 대표점)
  "fill": "#f26722", "fillOpacity": 0.2,      // 0~1
  "stroke": "#f26722", "strokeWidth": 2,      // 0~20 (0이면 선 없음)
  "pointRadius": 5,                           // 1~50
  // 점 색·점 테두리: 기본값(점 색 = 선 색을 따름·흰색·1px)이면 JSON에 키를 넣지 않는다
  "pointColor": "#ff00ff", "pointStroke": "#ffffff", "pointStrokeWidth": 1,   // 테두리 두께 0~10
  "classify": null
    | { "type": "categorical", "field": "구분", "classes": [{ "value": "청사", "color": "#2563eb" }], "otherColor": "#9ca3af" }   // 최대 12 + 기타
    | { "type": "graduated", "field": "직원수", "method": "quantile | equal | manual", "breaks": [950, 1050, 1150, 1300],
        "colors": ["#fee5d9", "#fcae91", "#fb6a4a", "#de2d26", "#a50f15"], "otherColor": "#9ca3af" },   // 3~7구간, breaks = colors.length - 1개
  "label": null | { "field": "이름", "size": 12, "color": "#111827", "halo": "#ffffff", "minZoom": 15 },   // size 8~40, minZoom 0~28(정수)
  "popup": null | { "fields": ["이름", "직원수"] } }   // null = 기본(앞 5개 컬럼), 1~30개 = 그 컬럼, [] = 이 레이어는 팝업 끔
```

- 짝 백엔드(`StyleConfigValidator`)가 저장 전에 같은 v1 스키마를 검사한다: **모르는 키는 거절**, 색은 `#rrggbb[aa]`(**구간 색은 알파 없는 `#rrggbb`만**), 범주 1~12개·구간 3~7개·팝업 0~30개(0개 = 끔), 컬럼 이름·범주 값은 200자 이하, 컬럼은 그 레이어에 있어야 하고 구간형은 숫자 컬럼이어야 한다(전체 16KB 이하).
  **값 범위는 서버와 같다**(선 두께 0~20, 점 반지름 1~50, 점 테두리 두께 0~10, 라벨 크기 8~40, 줌 0~28 — `STYLE_*` 상수). 그래서 서버가 받은 값은 줄지 않고 그대로 그려지고, 대화상자를 다시 열어도 같다(선택지에 없는 글자 크기·줌도 선택지에 끼워 넣어 보여 준다). 범위를 넘는 값(서버는 거절하는 값)과 `fill`·`stroke`·범주 색의 알파(`#rrggbbaa` — 알파는 읽을 때 버린다, 투명도는 `fillOpacity`)만 읽을 때 달라진다.
- 읽을 때 절대 throw하지 않는다: 못 읽는 부분은 기본값으로 채우고(색은 `#rrggbb`·`#rgb`, 서버가 허용하는 `#rrggbbaa`는 알파를 버리고 읽는다. 숫자는 범위로 자름), 못 읽는 `classify`·`label`은 null로, 설정 전체가 못 읽히면 옛 스타일. 위 키·범위는 `parseMyMapStyle`·`serializeMyMapStyle`(`@gtp/gis-map/core`)이 정한다.
- **구간의 경계**는 안쪽 경계값이다: 값 < breaks[0] → 첫 색, breaks[i-1] ≤ 값 < breaks[i] → i번째 색, 값 ≥ 마지막 경계 → 마지막 색. 속성값은 서버에 문자열("1100", "1,100")이라 `readNumber`로 숫자로 읽고, 읽을 수 없으면 `otherColor`(값 없음).
  분위(같은 개수)가 같은 값 때문에 겹치면 같은 간격으로 바꾼다. 숫자 판정은 **서버의 컬럼 통계(`NumericText`)와 같은 규칙**이다(`readNumber`): 앞뒤 공백(전각·NBSP)을 떼고 NFKC로 정리한 뒤 `12`·`-3.5`·`.5`·`5.`·`1.5E+3`과 올바르게 묶은 쉼표 숫자(`1,234`)만 숫자, 앞이 0인 코드(`007`)·16자리 이상 정수(PNU)·`12%`·`1,5`·**절댓값이 1e15 이상인 값(`1e15`·`9e15`·`1.5E+16`)** 은 아니다(서버가 숫자 판정과 구간 경계에 같은 "1e15 미만"을 쓰므로 분위·같은 간격 경계가 그 안에 든다. `readNumberDetail`은 못 읽은 이유를 `format`/`range`로 함께 준다).
  한쪽만 고치는 일을 막으려고 서버 시험과 프론트 시험이 같은 표(GTProject `backend/src/test/resources/mymap/numeric-cases.json`, 138건 — `[입력, 기대 숫자|null]`)를 읽는다.
  숫자 컬럼 = 값이 있는 칸의 90% 이상(올림)이 숫자. 서버는 구간형의 컬럼이 자기 통계로 숫자 컬럼일 때만 받으므로 둘이 어긋나면 저장이 거절된다.
- **작은 면은 점 기호로**: 면(Polygon·MultiPolygon)의 화면 크기(범위 긴 변 ÷ resolution)가 6px 미만이면 그 도형 대신 중심점에 점 기호(반지름 5 이상·점 색·테두리 설정을 따름, 설정 없는 옛 스타일은 같은 색·흰 테두리)를 그린다. 확대해서 6px 이상이 되면 원래 면으로 돌아온다(전국 줌에서 작은 필지가 안 보이는 문제). 점·선과 표시 방식 "점" 레이어는 그대로, 라벨·클릭 팝업도 그대로다.
- **라벨**은 본 레이어와 **같은 `VectorSource`를 쓰는 별도 `VectorLayer`**(`declutter` 켬 — 겹치는 라벨은 자동으로 숨김, `minZoom` = 설정한 줌, zIndex = 본 레이어 + 0.1)다. 본 레이어의 점·선이 겹침 제거로 사라지지 않게 나눴다.
  위치는 폴리곤 안쪽 대표점(오목한 모양도 도형 안), 점이거나 표시 방식이 "점"이면 점 위쪽. 한글 글꼴(맑은 고딕·Noto Sans KR·Apple SD Gothic Neo…)을 앞에 둔 글꼴 목록을 쓴다(웹폰트는 싣지 않는다).
  **안전장치**: 피처가 많으면 설정한 줌이 낮아도 그 아래 확대에서는 라벨을 그리지 않는다(`labelFloorZoom`: 500개 초과 12 · 2,000 초과 14 · 5,000 초과 15 · 20,000 초과 16). 스타일 대화상자는 그 아래 줌 선택지를 막고 안내한다.
- **클릭 팝업**은 React 위젯이 아니라 코어 DOM(`ol.Overlay` + `.gm-mymap-popup`, `styles/gis-map.css`)이라 MapShell·UMD(a)·붙이기(b) 어디서나 같다. 값은 `textContent`로만 넣고(HTML 해석 없음), 값이 200자를 넘으면 …로 자른다.
  **도구(그리기·측정·반경)가 켜져 있으면 열지도 닫지도 않는다.** 첫 레이어를 켤 때 리스너·오버레이를 붙이고 `destroy()`에서 뗀다. `map.vector.setPopupEnabled(false)`로 끄고, `featureAt(pixel)`로 호스트가 직접 피처를 찾을 수 있다.
- 엔진 API(`map.vector`, 전부 옵셔널 소스에 의존하지 않는다): `restyle(id, 스타일|JSON|null)`(저장된 값으로 지정 — GeoJSON을 다시 받지 않는다) · `previewStyle(id, 스타일)` / `endPreview(id)`(저장 전 미리보기) ·
  `getStyle(id)` / `getSavedStyle(id)` / `defaultStyle(id?)` · `columns(id)` / `categories(id, field)` / `numbers(id, field)` / `featureCount(id)`(지도에 올라온 피처로 센 값) · `show(id, { color?, styleConfig? })`.
  목록 객체(`openCatalog()`)는 `saveStyle(id, json | null)`을 갖는다: **등록자만**(공유받은 레이어면 서버를 부르지 않고 거절 — 서버도 403), `update`가 없는 소스면 거절, 성공하면 목록 항목·지도 레이어에 반영하고 `null`은 서버 값을 지운다(`styleConfig: ''`).
  목록을 받을 때마다(`catalog.load()`) 각 항목의 `styleConfig`를 기억해 켜진 레이어에 반영한다(공유받은 레이어는 등록자가 바꾼 스타일을 다음 목록 갱신 때 본다). 미리보기 중인 레이어는 목록이 와도 덮지 않는다.
- **스타일 대화상자**(`ui/mymap/MyMapStyleDialog`)는 패널의 소유 레이어(완료 상태) 항목에 **`update`가 있는 소스일 때만** 팔레트 단추로 열린다. 바꾸면 지도에 바로 반영(미리보기)하고, 닫기·Esc·패널 닫힘은 저장된 스타일로 되돌린다.
  어두운 막을 깔지 않는 떠 있는 카드라 지도를 움직여 라벨이 켜지는 줌을 확인할 수 있다. 기본(옛 고정) 스타일과 같은 상태로 저장하면 서버 값을 지운다.
  **저장 전에 서버가 거절할 값을 막는다**: 직접 입력한 구간 경계는 데이터와 같은 `readNumber` 규칙으로 읽고(`1,000`·`1e3` 허용, `0x10` 거절) 절댓값 1e15 이상이면 안내하며, 이름이 비었거나 200자를 넘는 컬럼은 라벨·색 나누기·팝업 선택지에서 빼고(안내 한 줄),
  팝업 컬럼은 30개에서 더 못 고르게 막고, 저장 JSON이 16KB(UTF-8)를 넘으면 서버에 보내지 않고 바이트 수와 함께 안내한다. 값이 너무 커서(절댓값 1e15 이상) 숫자로 못 읽은 칸이 있는 컬럼은 "값 없음" 색으로 칠한다는 안내를, 범위가 너무 좁아 경계를 못 나누면(소수 20자리 안) 원인에 맞는 문구를 보인다.
  다시 열면 저장된 구간 색에서 **색 띠를 되찾아**(저장 JSON에는 색 띠 id가 없다 — 서버가 모르는 키를 거절) 단계·방식을 바꿔도 같은 색 띠로 만든다. 저장 중에는 Esc·×·다른 레이어의 팔레트 단추를 무시하고(결과·오류를 볼 창이 사라지지 않게), 레이어를 바꿔 열면 창 상태가 새로 시작한다.
  컬럼·값 개수는 레이어를 켠 뒤 불러온 피처에서 센다(꺼져 있으면 대화상자가 먼저 켠다) — 서버의 `/columns`는 쓰지 않는다.
- 새 ol API는 없다(`style.Style/Fill/Stroke/Circle/Text`·`geom.Point`·`layer.Vector`·`Overlay`는 이미 `REQUIRED_OL_API`). 인스턴스 쪽 쓰임: `Polygon.getInteriorPoint`·`MultiPolygon.getInteriorPoints`·`LineString.getCoordinateAt`·`Text.setText/setOffsetY`·`layer.setMinZoom`·`declutter`·`Overlay autoPan`.
  OL의 `minZoom`은 "이 줌 **초과**에서만 보임"이라 설정한 줌에서도 보이도록 `1e-6` 낮춰 넣는다.
- 어댑터: `update`는 `PATCH /api/mymap/{id}`(JSON, 값이 있는 키만 — 서버는 빠진 키를 "그대로"로 본다). 오류는 봉투의 `message`를 `Error`로 던진다(403 "이 나만의지도에 대한 권한이 없습니다.", 400 "스타일 설정 형식이 올바르지 않습니다.").

### 큰 나만의지도 — 나눠 불러오기·묶음 (`config.myMap`)

shp 10만 피처처럼 큰 레이어를 켜도 지도가 멈추지 않게 하는 **클라이언트 쪽** 처리다(서버·DB·`MyMapSource` 계약은 그대로 — `geojson(id)`가 FeatureCollection 하나를 돌려주는 것 그대로).

- **불러오는 중 표시:** 체크하면 곧바로 `map.vector.store`의 `loadingIds`에 들어가고(패널은 "불러오는 중"), 서버 응답을 받은 뒤 피처로 바꾸는 동안 `loadProgress[id]`(0..1)가 올라간다(패널 "불러오는 중 42%" + 얇은 막대). 응답을 받는 동안(`res.json()` 한 번 포함)은 진행률이 없다.
- **나눠 변환:** GeoJSON → 피처 변환과 `VectorSource` 적재를 한 번에 `loadChunkMs`(기본 12ms)씩 하고 화면에 양보한다. 도중에 `hide(id)`·엔진 `destroy()`를 하면 즉시 멈추고 결과를 버린다. FeatureCollection이 아닌 응답(단일 Feature·지오메트리)은 예전처럼 한 번에 읽는다.
- **묶음(클러스터):** 이동·확대가 끝날 때(`moveend`)마다 **화면 안** 피처 수를 세어, 레이어 피처가 5,000개를 넘고 화면 안 점이 5,000개(면은 20,000개)를 넘으면 본 레이어는 그대로 둔 채 숨기고 격자 묶음 레이어(원 + 숫자)를 덧붙인다. 칸은 60px × 그 줌의 해상도, 원 크기는 개수의 로그(14~30px), 숫자는 "1.2천"·"3.4만".
  켜진 묶음은 기준의 80% 아래로 내려가야 꺼진다(깜빡임 방지). 줌 17 이상은 항상 원래 모양. **원을 누르면** 그 원의 범위로 확대(300ms)하고, 하나뿐인 칸은 원래 피처 점이라 팝업이 열린다. 도구(그리기·측정)가 켜져 있으면 확대하지 않는다.
  범주·구간 스타일이면 원 색은 **가장 많은 값의 색**이고, 색이 섞인 칸은 테두리가 회색 점선이다. 선(LineString) 레이어(또는 선이 섞인 레이어)는 묶지 않는다. 면을 "점으로 표시"로 바꾸면 점 기준(5,000)으로 센다.
- **그대로인 것:** 본 `VectorLayer`·`VectorSource`·`getOlLayer(id)`·스타일 대화상자 통계(열 요약·값 개수는 본 레이어 전체 기준)·속성 표·범위로 이동·지도 출력·공유는 묶음과 무관하게 같은 데이터를 본다. 출력에서는 묶음 모드로 찍힌 레이어 범례에 "묶음 (숫자 = 피처 수)" 한 줄이 더해진다. 라벨 레이어는 묶음 모드에서 숨는다(원래 줌 16 이상에서만 보임).
  **주의:** 묶음 모드에서는 `getOlLayer(id).getVisible()`이 false다. 호스트가 가시성을 읽어 쓰면 `map.vector.displayMode(id)`(`'shape'` | `'cluster'` | 없으면 null)를 함께 본다. 묶음 레이어는 `className`이 `ol-layer gm-hl-mymap-cluster`로 따로 있다.
- **속성 표:** 레이어가 지도에 올라와 있으면 표는 그 피처(서버 응답 순서 그대로 `map.vector.featuresInOrder(id)`)로 만든다 — 같은 GeoJSON을 두 번째로 받지 않는다. 꺼져 있으면 예전처럼 `geojson(id)`를 한 번 받는다.
- **설정(`createGisMap`/`GisMap.create`/`GisMap.attach`의 `myMap`, 모두 선택):**

```js
myMap: {
    loadChunkMs: 12,                     // 피처 변환 한 번의 시간(ms)
    cluster: {                           // false 로 주면 묶음을 끈다
        minFeatures: 5000,               // 레이어 피처 수가 이 값 이하면 묶음을 검토하지 않는다
        pointViewLimit: 5000,            // 화면 안 점이 이 값을 넘으면 묶음
        areaViewLimit: 20000,            // 화면 안 면이 이 값을 넘으면 묶음 (null = 면은 묶지 않음)
        cellPx: 60,                      // 격자 한 칸 크기(px)
        maxZoom: 17                      // 이 줌 이상은 항상 원래 모양
    }
}
```

- 엔진 인스턴스 API: `map.vector.store`의 `loadProgress`·`clusteredIds`, `displayMode(id)`, `featuresInOrder(id)`, `featureLonLatExtent(feature)`. 새 ol API **0**(`REQUIRED_OL_API` 그대로).
- 한계: 응답 본문을 한 번에 받아 `res.json()`으로 읽는 한 번의 긴 작업(피처 수·좌표 수에 비례)은 줄이지 못한다. 메모리는 줄이지 않는다(피처 10만 개가 힙에 그대로 있다 — M1 합성 측정 약 280MB). 서버 범위 조회·벡터 타일은 이 처리에 없다.

### 바람지도 (선택)

패널을 쓰려면 플러그인과 패널을 함께 넣는다. 앱 쪽 예: `panels={[...defaultPanels, windPanel]}` (`windPanel`은 `@gtp/gis-map/ui`, 권한 키 `map.tool.wind`).

```tsx
import { createWindPlugin } from '@gtp/gis-map/core/wind'
import { MapShell, defaultPanels, windPanel } from '@gtp/gis-map/ui'
// 입자 단색은 배경지도에 맞춘다(기본: 위성 흰색, 그 외 #334155). 바꾸려면 monoColor에 색 또는 (basemapMode) => 색
const setup = (map) => { map.use(createWindPlugin({ monoColor: (mode) => (mode === 'satellite' ? '#fff' : '#334155') })) }
```

`GisMapSources.wind`(`WindSource`) — `latest()`만 필수이고 나머지는 선택이다. 없으면 그 기능이 조용히 꺼진다.

| 메서드 | 하는 일 | 없으면 |
|---|---|---|
| `latest()` | 지금 시각에 가장 가까운 프레임 한 장(툴바 바람 켜기) | 바람 기능 없음 |
| `frames?()` | 발표 하나의 시간별 프레임 목록 `[{id, forecastHour, validTime, cycleDate, cycleHour, fields}]` | 패널의 예보시각·재생이 꺼지고 툴바만 동작 |
| `frame?(id)` | 목록의 프레임 한 장 | 위와 같음 |
| `field?(id)` | 스칼라 변수 한 장(기온·습도·강수량, `fields[변수]`의 id) | 색상 오버레이 선택지에 풍속만 나온다 |

플러그인(`useWindPlugin()`)에서 쓰는 주요 API: `loadFrames()`·`reloadFrames()`·`setFrame(index)`·`play()`/`pause()`·`setParticlesVisible(on)`·
`setOverlay(on)`·`setOverlayVar('none' | 'speed' | 'temp' | 'humi' | 'rain')`·`setOverlayOpacity(0~1)`·`setBaseVeil(on)`(오버레이가 없음일 때 입자 아래에 반투명 단색 바탕을 깐다 — 바탕 색은 입자 색에 맞춘다: 풍속 색 입자·밝은 단색이면 어두운 바탕 `#0f172a` 0.65, 어두운 단색(#334155)이면 흰 바탕 0.45. 기본 켜짐, 자료 요청 없음, 값은 `windLimits`의 `WIND_VEIL_*`)·`refreshStale()`(자료 오래됨 다시 계산)·
`valueAt(lon, lat)`·`watchPointerValues(listener)`(마우스 지점의 풍속·풍향과 선택 변수 값). 상태는 `useWindState()`(`overlayVar`·`scalarSupported`·`scalarVars`·`baseVeil`·
`stale`·`notice`·`overlayNote` 등), 마우스 값은 `useWindPointerValues()`. 스칼라는 오버레이에서 그 변수를 고를 때만 받고(요청 0 → 고르면 한 장),
시간을 옮기면 바람 프레임과 같이 받아 같이 바꾼다. 짝 백엔드의 응답 규칙(`null` = 자료 없음, `fields`가 비면 선택지 없음)은 `references/query-spec.md` 7절.


## 빌드 (GTProject `frontend/`에서)

| 명령 | 결과 |
|---|---|
| `npm run build:gis-umd` | (a)·(b)를 차례로 빌드 → `dist/gis-map.umd.js`·`gis-map.es.js`·`gis-map.css`, `dist/gis-map.attach.umd.js`·`gis-map.attach.css`, 번들마다 `*.THIRD-PARTY-NOTICES.txt`. 두 빌드 모두 `dist`를 비우지 않는다 |
| `npx vite build -c packages/gis-map/vite.config.ts [--mode attach]` | 한쪽만 다시 빌드 |
| `npm run build:gis-demo` (= `node scripts/build-gis-demo.mjs [--copy-to <dir>]`) | 서버 없이 열리는 정적 예제 폴더 조립 → `dist/gis-demo/`(`examples/gis-demo/*` + `lib/`(번들 6파일 + `ol.js`·`ol.css`·`LICENSE.md`) + 생성한 `map.jsp`). `dist/`의 UMD 산출물이 없거나 소스보다 오래됐으면 스스로 vite build 두 번을 돌리고(깨끗한 체크아웃·CI에서도 성공, vite가 없으면 이유를 말하고 실패), 조립 뒤 이식성 검사(서버 경로·절대 경로·`fetch`·`type="module"` 등)를 하며 위반이면 실패한다. `--copy-to`는 대상 폴더를 비운 뒤 복사(`prebuild`가 `public/demo/umd`로) |
| `npm run dev:gis-standalone` | 개발 서버 5199 → `/examples/standalone.html`(Tailwind 없는 환경 확인, `?host=real`이면 로컬 백엔드·프록시에 붙음) |

`dist/`는 git에 올리지 않는다(`.gitignore`). GTProject의 `npm run build`는 `prebuild`로 `build:gis-demo`를 먼저 돌려 `public/demo/umd/`(웹 데모의 정적 예제)를 만든다 — vite 두 번이 더 든다(약 9초). React 앱은 빌드 없이 소스를 그대로 쓴다.

## 알려진 제한

- **(a) 번들 지도 요소에 `class="gm-root"`가 꼭 있어야 한다.** `gis-map.css`의 ol.css는 다른 OL 지도를 건드리지 않게 `.gm-root` 안으로 한정돼 있어서,
  빠뜨리면 오류 없이 축척 막대 꾸밈·viewport 터치 규칙 등이 빠진다. `body`처럼 넓게 붙이지 말고 지도 요소 하나에만 붙인다.
- **코어 CSS 크기 단위가 `rem`이다.** 업무 페이지가 `html { font-size: 62.5% }`처럼 뿌리 글자 크기를 바꾸면 측정 툴팁·텍스트 입력이 같이 작아진다
  (16px → 10px이면 툴팁 글자 12 → 7.5px). 표는 `examples/jsp/README.md` 10절.
- **attach 최소 ol 버전은 7.1.** 6.x·7.0은 `checkOl`이 막는다. 공식 6.15.1·7.0.0 full build에서도 버전 검사만 건너뛰면 전 항목이 통과했지만,
  보장 범위는 7.1 이상으로 두었다(바꾸려면 `src/core/olCompat.ts`의 `MIN_OL_VERSION` 한 줄 + 문서). 자세한 근거는 `COMPATIBILITY.md`.
- **AMD 로더(RequireJS 등)가 있는 페이지에서는 UMD가 전역 `GisMap`을 만들지 않는다.** `require(['gis-map'])`로 받거나 불러오는 동안 `define`을 치운다
  (`examples/jsp/README.md` 7절).
- attach 기본값은 업무 ol 좌표계 목록에 한국 좌표계와 proj4 내장 정의를 더하고 `destroy()` 뒤에도 남긴다. 원하지 않으면 `projections: false`.
- 기본이 아닌 `theme.primary`는 엔진이 생긴 뒤 들어가 서버 렌더 첫 프레임은 기본색이다. 깜빡임이 싫으면 CSS(`.gm-root { --gm-primary: … }`)로 준다.
  호스트가 `--gm-*`나 위젯 모양을 덮으려면 패키지 CSS **뒤에**, `@layer` 밖에서 선언한다.
- 바람길 표시는 ol 버전별로 시험하지 않았다(설치·제거만).
- 큰 나만의지도 묶음·나눠 불러오기는 가짜 DOM·합성 데이터 시험과 node 측정(M1)만 했다 — 브라우저 렌더 시간(다시 그리기)·원 모양·클릭은 `examples/_tmp-big-vector-bench.html`(임시)로 확인한다.
- 필지 정보 카드의 실제 PostgreSQL 실행 계획·VWorld 점 질의 응답·브라우저 레이아웃은 구현 때 직접 확인하지 못했다(운영 DB 접근 금지).

## 라이선스 고지

번들에는 OpenLayers((a)만)·proj4·ol-wind 등의 코드가 들어간다. 빌드가 실제로 들어간 패키지의 라이선스 원문을 `dist/*.THIRD-PARTY-NOTICES.txt`로 내고,
번들 JS 머리에도 한 줄 남긴다. 저장소용 사본: `THIRD-PARTY-NOTICES.md`. 납품물 오픈소스 고지에 이 파일을 쓴다.
