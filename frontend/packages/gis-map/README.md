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
│   │   └── proxy/   호스트 프록시 규약 — VWorld 주소 검색·필지·지역명·범례, WFS, GeoServer 범례 이미지
│   ├── styles/      gis-map.css(리셋·--gm-* 변수·코어 DOM) · gis-map-ui.css(위젯). 클래스는 전부 gm- 접두사, Tailwind 없음
│   ├── standalone.ts         UMD (a) 진입점(ol 포함)
│   └── standalone-attach.ts  UMD (b) 진입점(ol 제외, 전역 ol 사용)
├── examples/        standalone.html(개발 서버) · jsp/{map,attach}.{jsp,html} + jsp/README.md(JSP 상세 안내)
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
   `@gtp/gis-map/core`, `/core/wind`, `/react`, `/ui`, `/adapters/rest`, `/adapters/proxy` → 각 `src/.../index.ts`. 앱은 이 6개만 import한다.
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

- `MapShell` 주요 props: `brand`(false면 숨김), `panels`(기본 레이어·TIFF·나만의지도, 호스트 패널을 더함), `defaultPanel`·`onPanelChange`,
  `show*`(Header·Search·BasemapSwitcher·User·NavRail·Toolbar·RegionBadge·MobileLayerButton·WindLegend·StatusBar), `statusBarProjection`(기본 EPSG:5186).
- 위젯을 따로 조립할 때는 `<MapRoot>`(또는 class `gm-root`) 안에 두고, 지도 div는 `<GisMapView>`로 만든다. 위젯은 가장 가까운 Provider의 엔진만 본다
  → 한 화면에 Provider 둘이면 지도 둘이 서로 독립이다.
- 이미 만든 `ol.Map`에 붙이려면 `<GisMapProvider attachTo={olMap}>`(이때 `<GisMapView>`는 필요 없다). 앱과 패키지가 **같은 ol 사본**을 써야 한다.
- GTProject 연결부 예시: `frontend/src/app/map/page.tsx`, `frontend/src/app/map/_gtp/`(호스트·설정·앱 기억). 이 파일들은 이식 대상이 아니다.

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
| `myMap` · `geoTiff` · `wind` | 나만의지도(목록·업로드·결과 보고서·샘플) · GeoTIFF 타일 · 바람장 | `restSources()` |
| `addressSearch` · `parcel` · `regionName` · `legend` · `wfs` | 주소 검색 · 필지 폴리곤 · 지역명 · 범례 · WFS URL | `proxySources()` |

짝 백엔드 응답 형식이 다르면 해당 소스만 직접 구현해 배열 뒤쪽에 넣는다. 백엔드(Spring·MyBatis)로 옮길 때의 테이블 DDL·쿼리 명세는
GTProject 저장소의 `.claude/skills/map-module-export/references/`에 있다.
### 나만의지도 (`GisMapSources.myMap`)

`MyMapSource`의 `list`·`status`·`geojson`·`remove`만 필수이고 나머지는 전부 선택이다. **없는 메서드의 화면 요소는 조용히 빠진다**(옛 소스는 옛 화면 그대로).

| 메서드 | 하는 일 | 없으면 |
|---|---|---|
| `list()` · `status(id)` · `geojson(id)` · `remove(id)` | 목록 · 처리 상태 폴링 · GeoJSON(EPSG:4326) · 삭제 | 나만의지도 기능 없음 |
| `uploadShp?` · `previewExcel?` · `confirmExcel?` | SHP·엑셀 업로드 | 해당 업로드가 안 됨 |
| `getShare?` · `setShare?` | 공유 설정 | 공유 칸이 비어 있음 |
| `quota?()` | `{ownedLayers, maxLayers, maxRows:{pnu,address,coord}, maxShpFeatures, maxExcelMb, maxShpMb, coverage}` — `coverage`는 아래 | 패널의 `내 레이어 n/20`과 한도·지적도 기준월 문구가 빠진다(패널을 열 때 1번만 받는다) |
| `downloadSample?(kind)` | `'pnu' \| 'coord'`(`'address'`는 2단계) 샘플 xlsx **바이트(Blob)**. 저장은 위젯이 `<a download>`로 한다 | 업로드 창의 "샘플 받기"가 없다 |
| `importReport?(id, {page, size, reason})` | 소유자 전용 결과 보고서 `{total, matched, failed, byReason, rows:[{rowNo, reason, message, input, candidates}], page, size, totalRows}` | `실패 N 보기`가 링크 대신 글자 |
| `downloadImportFailures?(id)` | 실패 행 xlsx 바이트 | 보고서에 "실패 행 엑셀 받기"가 없다 |

- `confirmExcel(input)`은 `{ id }`를 돌려줄 수 있다(처리는 비동기 — 패널이 목록 폴링으로 진행률을 본다). 옛 소스처럼 아무것도 안 돌려줘도 된다. 입력의 `mode`(`'PNU' | 'ADDRESS' | 'COORD'`)·`pnuColumn`·`addressColumn`은 선택이고
  없으면 좌표(`latColumn`·`lonColumn`·`sourceSrid`)다. 주소 모드는 2단계에서 켜지므로 업로드 창은 PNU·좌표만 보여 준다.
- `previewExcel`의 응답에 `suggestions`가 있으면 모드·컬럼을 미리 고르고, **없으면 옛 서버로 보고 좌표(위도·경도) 하나뿐인 옛 흐름**으로 동작한다. `totalRows`·`limits`·`warnings`
  (`NUMERIC_PNU_CELLS`·`DUPLICATE_FILE`·`OVER_LIMIT`)가 있으면 경고 배너와 행 한도 검사(모드별 `limits`, 없으면 `quota.maxRows`)를 한다. 모르는 경고 코드도 `message`를 그대로 보여 준다.
- 목록 항목의 새 필드(전부 선택): `ownerId`(공유받은 항목의 "보낸 사람")·`sourceKind`(`SHP|EXCEL_COORD|EXCEL_PNU|EXCEL_ADDRESS` — 있으면 종류 배지)·`progressTotal`/`progressDone`(처리 중 막대)·
  `matchedCount`/`failedCount`(`매칭 N · 실패 M`)·`parcelVersion`·`errorMessage`. `status(id)` 응답에도 같은 진행률·건수 필드를 실을 수 있고, 있으면 처리 중에도 목록에 반영한다(없으면 옛 동작 — 끝났을 때만).
- `quota().coverage`(= `MyMapCoverage`): `{ sidoCodes, parcelVersion, loaded?, nationwide?, restrictedSidoCodes? }`. **`nationwide`가 있는 새 서버**에서는 `sidoCodes` = 실제 적재된 시도(지역 제한이 있으면 그 교집합), `parcelVersion` = 그 중 가장 이른 기준월,
  `loaded` = 시도별 기준월, `nationwide` = 전국 기준 시도(서버 설정, 기본 현행 16개)가 전부 적재되고 제한이 없을 때만 true, `restrictedSidoCodes` = 지역 제한 설정값. **빈 `sidoCodes`는 전국이 아니다.** 업로드 창 문구:
  `nationwide` → "지적도 기준월 2026-10(전국)" / 일부 → "제공 지역: 세종 · 기준월 2026-10"(시도 4개 이상은 "제공 지역: 일부 시도(n/16) · 기준월 …", 시도별 기준월은 마우스를 올리면) + "적재된 시도 밖의 PNU는 실패합니다" 안내 / 비어 있으면 "지적도 자료 준비 중입니다"(PNU 확정은 서버가 503).
  **`nationwide`가 없는 옛 서버**에서는 `sidoCodes`를 지역 제한 설정값으로 보고(비면 "(전국)", 있으면 "(제공 지역: …)") 옛 문구를 그대로 쓴다. 시도 이름표는 `ui/mymap/format.ts`의 `SIDO_NAMES`(12 전남광주·42·45 포함).
- 목록 항목 `errorMessage`(실패한 레이어의 이유)는 패널에 그대로 보이고, `status(id)` 응답의 `parcelVersion`·`geomType`은 끝났을 때 목록에 합친다(목록을 다시 받지 않아도 "지적도 YYYY-MM"이 나온다).
- `confirmExcel`의 반환 `MyMapConfirmResult { id, parcelVersion? }`: PNU 모드의 "예정" 기준월이면 패널이 처리 중인 동안 "지적도 2026-10 예정"으로 보이고, 끝나면 상태·목록의 확정값으로 바뀐다. `importReport`의 `duplicatePnuCount`(같은 PNU가 여러 행이라 피처가 겹친 수)가 0보다 크면 보고서에 "중복 PNU N건" 한 줄.
- 서버가 거절하면(5,001행부터 미리보기 400, 미리보기·확정·shp 동시 실행 429 등) 서버 `message`를 업로드 창에 그대로 보여 준다. 파일 고르는 단계에는 "수식은 값으로 붙여넣은 파일" 안내 한 줄이 있다(서버가 수식 셀을 엑셀이 저장한 계산값으로 읽는다).
- 파일 저장(샘플·실패 행 엑셀)은 `<a download>`를 클릭하고 **30초 뒤에** `URL.revokeObjectURL`한다(Firefox가 클릭 직후 해제를 취소로 처리하는 것을 피함). 실패 행이 보관 기간(30일)이 지나 지워진 레이어는 보고서가 안내만 보여 준다.
- `adapters/rest`: 응답 본문이 JSON이 아니면(프록시의 413·502 HTML 등) "Unexpected token" 대신 호출부의 기본 문구, 413은 "파일이 너무 큽니다(서버 한도)"로 던진다.
- 엔진: `map.vector.openCatalog()`의 상태(`MyMapCatalogState`)에 `quota: MyMapQuota | null`이 늘었다. 훅은 새로 만들지 않았다(`useMyMapCatalog()`로 같은 상태). 패널은 내 레이어 / 공유받은 레이어 두 묶음으로 나눠 그린다
  (공유받은 항목이 있을 때만 묶음 제목이 나온다).
- 어댑터: `restSources()`의 `myMap`이 위 메서드를 `/api/mymap/{quota, samples/{kind}, {id}/import-report(.xlsx)}`로 구현한다. 파일 응답은 봉투가 없고, 오류 본문의 `message`가 있으면 그 글을 `Error`로 던진다.

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
| `npm run dev:gis-standalone` | 개발 서버 5199 → `/examples/standalone.html`(Tailwind 없는 환경 확인, `?host=real`이면 로컬 백엔드·프록시에 붙음) |

`dist/`는 git에 올리지 않는다(`.gitignore`). CI·배포는 이 빌드를 돌리지 않는다. React 앱은 빌드 없이 소스를 그대로 쓴다.

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

## 라이선스 고지

번들에는 OpenLayers((a)만)·proj4·ol-wind 등의 코드가 들어간다. 빌드가 실제로 들어간 패키지의 라이선스 원문을 `dist/*.THIRD-PARTY-NOTICES.txt`로 내고,
번들 JS 머리에도 한 줄 남긴다. 저장소용 사본: `THIRD-PARTY-NOTICES.md`. 납품물 오픈소스 고지에 이 파일을 쓴다.
