# gis-map — JSP(React 없는 페이지)에서 쓰기

`<script>` 한 줄로 지도 엔진을 쓰는 방법이다. React 위젯(툴바·패널)은 들어 있지 않다 — 화면은 업무 페이지가 직접 만들고,
버튼은 엔진 API(`map.tools.activate(...)` 등)를 부른다.

| 파일 | 내용 |
|---|---|
| `map.jsp` | (a) 번들 — 엔진이 지도를 만든다. 서버 값(키·주소·사용자)을 모델 → `data-` 속성 → 엔진 옵션으로 넘긴다. 실제 백엔드에 붙는다(`GisMap.adapters.rest()`·`proxy()`) |
| `map.html` | `map.jsp`와 같은 화면의 정적 HTML. 백엔드 없이 뜬다(레이어 트리 = 메모리 소스) |
| `attach.jsp` | (b) attach 번들 — 업무 화면이 전역 `ol`로 **이미 만든 지도**에 엔진을 붙인다 |
| `attach.html` | `attach.jsp`와 같은 화면의 정적 HTML. 백엔드 없이 뜬다. 붙이기/떼기 단추로 호스트 지도가 원래대로 돌아오는 것을 본다 |

## 0. 어느 번들을 쓰나

| | (a) `gis-map.umd.js` | (b) `gis-map.attach.umd.js` |
|---|---|---|
| 지도를 누가 만드나 | 엔진(`GisMap.create`) | 업무 화면(`new ol.Map`) → 엔진을 붙임(`GisMap.attach`) |
| ol | 번들 안에 들어 있다(9.2.4, 페이지 전역 `ol`과 따로 논다) | 들어 있지 않다. 페이지의 전역 `ol`(공식 full build `ol.js`)을 쓴다 — **7.1 이상**(6절) |
| 크기(압축 전 / gzip) | 약 590 KB / 176 KB | 약 210 KB / 68 KB |
| CSS | `gis-map.css` = `.gm-root` 안으로 한정한 ol.css + 코어 CSS | `gis-map.attach.css` = 코어 CSS만(ol.css 없음, 엔진이 그리는 DOM에만 걸림) |
| 전역 이름 | `GisMap` = `{ create, createGisMap, controls, plugins, adapters, version }` | `GisMap` = `{ attach, attachGisMap, checkOl, GisOlCompatError, plugins, adapters, version }` |

두 번들은 전역 이름이 같아서 한 페이지에 같이 올리지 않는다.

## 1. 빌드와 배치

```bash
# frontend/ 에서 — (a)와 (b)를 차례로 빌드한다. 두 빌드 모두 dist를 비우지 않아 서로의 산출물을 지우지 않는다
npm run build:gis-umd
# 한쪽만 다시: npx vite build -c packages/gis-map/vite.config.ts            ← (a)
#              npx vite build -c packages/gis-map/vite.config.ts --mode attach ← (b)
# (a) packages/gis-map/dist/gis-map.umd.js, gis-map.css, gis-map.es.js(번들러가 있는 화면용), gis-map.THIRD-PARTY-NOTICES.txt
# (b) packages/gis-map/dist/gis-map.attach.umd.js, gis-map.attach.css, gis-map.attach.THIRD-PARTY-NOTICES.txt
```

업무 프로젝트의 `src/main/webapp/resources/gis-map/<버전>/`에 쓰는 번들의 `.umd.js`·`.css`와 **`.THIRD-PARTY-NOTICES.txt`를 함께** 복사한다.
버전 폴더를 두면 브라우저 캐시 때문에 옛 파일이 남는 문제를 피할 수 있다(버전은 `GisMap.version`).

- **오픈소스 고지**: 번들에는 OpenLayers(BSD-2-Clause, (a)만)·proj4·ol-wind 등(MIT 등)의 코드가 들어 있다. 빌드가 번들에 **실제로 들어간**
  패키지만 골라 각 패키지의 LICENSE 원문을 `*.THIRD-PARTY-NOTICES.txt`로 낸다(패키지 목록·버전·라이선스는 그 파일 머리에 있다).
  번들 JS 맨 앞에도 `/*! … 서드파티 라이선스: <파일 이름> */` 한 줄이 남는다. 납품물 오픈소스 고지에 이 파일을 쓴다.
  패키지 폴더의 `THIRD-PARTY-NOTICES.md`는 같은 내용의 저장소용 사본이다.

```jsp
<%-- 주소는 contextPath + 경로로(아래 "contextPath를 안전하게" 참고) --%>
<c:set var="ctx" value="${pageContext.request.contextPath}"/>
<link rel="stylesheet" href="<c:out value='${ctx}'/>/resources/gis-map/0.1.0/gis-map.css">
<div id="map" class="gm-root" style="height:600px"></div>
<script src="<c:out value='${ctx}'/>/resources/gis-map/0.1.0/gis-map.umd.js"></script>
```

**contextPath를 안전하게 쓰는 법**
- `<c:url>`은 쓰지 않는다. 세션 쿠키가 아직 없는 첫 요청에 `;jsessionid=…`를 주소에 붙인다(Tomcat 실측). 그러면 세션 ID가 주소창·Referer·접근 로그에
  남고, 세션마다 브라우저 캐시 키가 달라진다. 서버 전체에서 막으려면 `web.xml`에 `<session-config><tracking-mode>COOKIE</tracking-mode></session-config>`.
- `${pageContext.request.contextPath}`는 `<c:set var="ctx" …/>`로 한 번 받아 **`<c:out value='${ctx}'/>`로 출력**한다. EL을 HTML에 그대로 쓰면
  이스케이프가 안 된다(값에 따옴표·꺾쇠가 섞이면 속성·스크립트가 깨지는 XSS 통로). contextPath는 배포 설정 값이지만 컨테이너가 요청 주소에서 잘라 내는
  값이라, 다른 모델 값과 똑같이 c:out을 거친다.

## 2. CSS

- **JS가 CSS를 넣지 않는다.** JS가 `<style>`을 몰래 넣으면 업무 CSS와의 순서를 퍼블리셔가 정할 수 없고, CSP(`style-src`)가 엄격한 기관 서버에서 막힌다.
  `<link>`를 빼먹으면 측정 툴팁·축척 막대가 꾸밈 없이 나온다. 모양을 바꾸려면 이 `<link>` **뒤에** 업무 CSS를 둔다.
- **(a) `gis-map.css`** — ol.css를 통째로 넣되 **모든 선택자를 `.gm-root` 안으로 한정**했다(`:root`의 `--ol-*` 변수도 `.gm-root`로).
  그래서 엔진 지도 요소(또는 그 조상)에 **`class="gm-root"`가 꼭 있어야** ol.css가 걸린다. 같은 페이지에 업무 화면의 다른 OL 지도가 있어도
  (다른 버전 ol.css, 업무 테마 변수 포함) 그 지도의 모양은 바뀌지 않는다 — ol 7.1·7.5·8.2·9.2·10.10의 ol.css + 업무 테마를 둔 페이지에서
  `gis-map.css`를 문서 맨 끝에 넣어도 호스트 지도 DOM 계산 스타일 변화 0으로 확인했다. 반대로 업무 화면의 전역 ol.css는 엔진 지도에도 걸린다
  (엔진 쪽은 명시도가 높아 같은 속성이면 엔진 규칙이 이긴다). `gm-root`를 `body`처럼 넓게 붙이면 그 안의 업무 지도도 엔진 ol.css를 받으니
  **지도 요소 하나에만** 붙인다.
- **(b) `gis-map.attach.css`** — ol.css가 없다(업무 화면의 ol.css를 그대로 쓴다). 코어 규칙은 엔진이 그리는 DOM(측정 툴팁 `.gm-measure-tooltip`,
  텍스트 입력 `.gm-text-input`, 커서 안내 `.gm-tool-hint`)에만 걸리고, OL 컨트롤 규칙(축척 막대 꾸밈)은 빠져 있다. 호스트 지도에 `gm-root`를 붙일
  필요가 없다. 엔진 DOM 계산 스타일은 (a)의 `.gm-root` 안과 같다(33개 속성 대조).
- 지도 요소의 **높이는 페이지가 준다**(0이면 아무것도 안 보인다).
- 크기 단위 주의 — 10절 "알려진 제한"의 rem 표.

## 3. 호스트 옵션 채우기 (`GisMapHost`) — 전부 자리표시자

비밀값(키·비밀번호·토큰)을 JSP·JS 파일에 직접 쓰지 않는다. 서버가 설정(환경 변수)에서 읽어 **모델 속성**으로 넘기고,
JSP는 `<c:out>`으로 `data-` 속성에 담는다. JS는 `el.getAttribute('data-…')`로 읽는다. JS 문자열에 EL을 바로 꽂지 않는다(8절).

| 옵션 | JSP에서 채우는 법 | 비고 |
|---|---|---|
| `host.http.getHeaders` | `function () { var h = {}; h[meta('_csrf_header')] = meta('_csrf'); return h; }` | **요청마다 다시 부른다.** Spring Security CSRF면 `<meta name="_csrf" content="<c:out value='${_csrf.token}'/>">`, `<meta name="_csrf_header" content="<c:out value='${_csrf.headerName}'/>">`. 토큰 인증이면 `h['Authorization'] = 'Bearer ' + 토큰` |
| `host.http.credentials` | `'same-origin'`(기본) | 세션 쿠키(JSESSIONID) 인증. 다른 도메인 API면 `'include'` + 서버 CORS 허용 |
| `host.http.onUnauthorized` | `function () { location.href = el.getAttribute('data-login-url'); }` | 401 응답 때. JSP: `data-login-url="<c:out value='${ctx}'/>/login"` |
| `host.endpoints.apiBaseUrl` | `el.getAttribute('data-api-base')` ← `<c:out value='${ctx}'/>` | 짝 REST 백엔드 base. 같은 앱이면 contextPath |
| `host.endpoints.proxyBaseUrl` | `el.getAttribute('data-proxy-base')` ← contextPath + `/gis/proxy` | VWorld 검색·필지·지역명·WFS를 서버가 대신 부르는 프록시(키 숨김). `{proxyBaseUrl}/vworld/search`, `/vworld/data`, `/vworld/legend-style`, `/wfs`, `/region` |
| `host.endpoints.geoserverUrl` | `''` 또는 GeoServer 주소 | 이미지 범례(GetLegendGraphic). 빈 값이면 끔 |
| `host.keys.vworld` | 모델 `gisVworldKey` → `data-vworld-key` | 타일 URL의 `{VWORLD_KEY}`를 바꿀 때 쓴다. 타일 요청에 실려 브라우저에 보이므로 **도메인 제한 키**를 쓴다 |
| `host.getCurrentUser` | `function () { return id ? { userId: id, role: role } : null; }` | 함수로 받는다(항상 최신 값). 개인 레이어 설정(`/api/layers/user-access`) 조회 여부를 정한다 |
| `host.isFeatureAllowed` | `function (featureId) { return true; }` | 기관 권한 체계가 있으면 연결 |

컨트롤러 예(값은 설정에서 읽는다 — 코드에 쓰지 않는다):

```java
@GetMapping("/map")
public String map(Model model, @Value("${gis.vworld-key:}") String vworldKey) {
    model.addAttribute("gisVworldKey", vworldKey);          // 환경 변수 GIS_VWORLD_KEY 등으로 주입
    model.addAttribute("gisProxyBase", "/gis/proxy");      // 비우면 JSP가 contextPath + /gis/proxy
    return "map";
}
```

## 4. 데이터 소스

- `GisMap.adapters.rest()` — 짝 Spring 백엔드(`{ success, message, data }` 봉투). 레이어 트리 `GET /api/layers/tree`
  (로그인이면 `/api/layers/user-access`·`/api/layers/tree/permission/{key}`), 나만의지도 `/api/mymap`, GeoTIFF `/api/geotiff`, 바람장 `/api/wind/latest`(바람길 플러그인을 쓸 때만).
- `GisMap.adapters.proxy()` — 위 프록시 규약.
- 응답 모양이 다른 기존(eGov) 백엔드면 소스 객체를 직접 준다. 뒤에 준 것이 이긴다:

```js
var el = document.getElementById('map');
var ctx = el.getAttribute('data-ctx');                 // JSP: data-ctx="<c:out value='${ctx}'/>"
var myEgovSources = {
    layerTree: {
        loadTree: function () {
            return fetch(ctx + '/gis/layerTree.do', { credentials: 'same-origin' })
                .then(function (r) { return r.json(); })
                .then(function (j) { return toLayerTree(j.resultList); });   // { groups: [...], ungroupedLayers: [...] } 로 바꾼다
        }
    }
};
GisMap.create({ target: el, host: host, sources: [GisMap.adapters.proxy(), myEgovSources] });
```

소스를 주지 않은 기능은 조용히 꺼진다(예: 폐쇄망이면 `proxy()`를 빼서 검색·필지 강조를 끈다).

## 5. 자주 쓰는 엔진 API

```js
var map = GisMap.create({ target: 'map', host: host, sources: sources, view: { center: [127.0, 37.5], zoom: 12 } });
GisMap.controls.scaleLine(map);                 // 축척 막대(번들 ol로 만든다). 반환값 = 떼기. (a) 전용
map.tools.activate('measure-area');             // 'draw-point|line|polygon|circle|box|text', 'select', 'measure-distance', 'radius-search' …
map.tools.activate('measure-area');             // 같은 도구를 다시 부르면 끔(토글). map.tools.deactivate()
map.tools.setRadiusMeters(500);                 // 반경 직접 입력(null이면 드래그)
map.tools.store.subscribe(function (s) { /* s.activeTool로 단추 모양 */ });
map.draw.setStyle({ color: '#0055aa', strokeWidth: 3 });
map.draw.toGeoJSON();                           // 그린 도형(EPSG:4326 FeatureCollection)
map.layers.toggleLayer(id); map.layers.setOpacity(id, 0.5); map.layers.setBasemapMode('satellite');
// 레이어 트리 로드 실패는 throw하지 않고 map.layers.store의 error에 메시지를 남긴다(이전 트리는 그대로). 위젯이 없는 페이지는 직접 보여 준다:
map.layers.store.subscribe(function (s) { if (s.error) $('#layerError').text(s.error); });
map.flyTo({ lon: 127.0, lat: 37.5, zoom: 16 });
map.clearAll();                                 // 그리기·측정·반경·필지 강조 지움
map.destroy();                                  // 엔진이 붙인 레이어·interaction·DOM·리스너·타이머를 전부 뗀다
```

jQuery로 써도 같다: `$('#btnArea').on('click', function () { map.tools.activate('measure-area'); });`

**`destroy()`는 언제 부르나 — 뒤로 가기 캐시(bfcache) 주의**
- 페이지 전체를 떠나는 화면(일반 JSP)이면 부르지 않아도 된다 — 문서를 버리면 자원도 같이 풀린다.
- 부를 거면 `pagehide`에서 **`e.persisted`가 false일 때만** 부른다:
  `window.addEventListener('pagehide', function (e) { if (!e.persisted) map.destroy(); });`
  `persisted`가 true면 브라우저가 문서를 뒤로 가기 캐시에 얼려 둔 것이다. 이때 destroy하면 뒤로 가기로 돌아왔을 때 문서는 그대로 복원되고 스크립트는
  다시 돌지 않아 **지도가 빈 화면**이 된다(Chrome 실측. Spring Security 기본 `Cache-Control: no-store`가 있어도 같다).
- `pagehide`는 문서 전체를 떠날 때(이동·새로고침·탭 닫기)만 온다. ajax로 지도 영역만 바꾸는 **부분 화면 교체**에서는 오지 않으니, 그때는 교체 직전에
  `map.destroy()`를 직접 부른다.

## 6. 기존 OL 지도에 붙이기 — (b) attach 번들

업무 화면이 이미 `<script src="ol.js">`(공식 full build, 전역 `ol`)로 `new ol.Map(...)`을 만들어 쓰고 있고, 거기에 측정·그리기·반경·필지 강조·
레이어 트리 관리만 얹고 싶을 때 쓴다. 예제: `attach.html`(정적), `attach.jsp`.

```html
<link rel="stylesheet" href="/resources/ol/9.2.4/ol.css">                    <!-- 업무 화면이 원래 쓰던 ol -->
<link rel="stylesheet" href="/resources/gis-map/0.1.0/gis-map.attach.css">  <!-- ol.css 없음 -->
<div id="map" style="height:600px"></div>
<script src="/resources/ol/9.2.4/ol.js"></script>                           <!-- 1) ol.js 먼저 -->
<script> var workMap = new ol.Map({ target: 'map', layers: [...], view: new ol.View({...}) }); </script>
<script src="/resources/gis-map/0.1.0/gis-map.attach.umd.js"></script>     <!-- 2) 번들은 ol.js 뒤 -->
<script>
  var el = document.getElementById('map');   // JSP면 data-proxy-base 등을 c:out으로 담아 둔다(3절)
  var report = GisMap.checkOl();          // { ok, version, missing: [], testedRange, minVersion: '7.1.0', belowMinimum }
  if (report.ok) {
    var gis = GisMap.attach(workMap, {     // 붙이기 전에 checkOl을 다시 돌려, 안 되면 GisOlCompatError(없는 API·버전 사유가 메시지에)
      host: { endpoints: { proxyBaseUrl: el.getAttribute('data-proxy-base') }, keys: { vworld: el.getAttribute('data-vworld-key') } },
      sources: [GisMap.adapters.rest(), GisMap.adapters.proxy()],
      zIndex: { tools: 900, parcel: 950 }  // 업무 레이어 zIndex 체계와 겹치지 않게
    });
    $('#btnDist').on('click', function () { gis.tools.activate('measure-distance'); });
  }
</script>
```

**권장 ol 버전 — 7.1 이상(시험: 7.1.0·7.5.2·8.2.0·9.2.4·10.10.0 공식 full build 전부 통과).** 표는 패키지 폴더 `COMPATIBILITY.md`.
- 6.x·7.0은 `checkOl`이 `belowMinimum`으로 막는다(오류 문구 "ol 7.1.0 이상이 필요하다(현재 6.15.1)"). API가 없어서가 아니다 —
  GitHub 릴리스의 **공식 6.15.1·7.0.0 full build**로 버전 검사만 건너뛰어 시험하면 엔진 코드 변경 없이 전 항목이 통과했다(COMPATIBILITY.md).
  최소 버전을 7.1로 둔 것은 지원 범위 결정이다(설계자·사용자 몫). 6.15를 열려면 `src/core/olCompat.ts`의 `MIN_OL_VERSION` 한 줄과 이 문서·호환 표를 고친다.
- 7.1.0 공식 빌드는 `ol.util.VERSION`이 `'latest'`라서 `checkOl().version`이 `'latest'`, `testedRange`가 false로 나온다(붙이기는 된다).

**불러오는 순서**: `ol.js` → `gis-map.attach.umd.js`. 번들은 **불러오는 순간의** 전역 `ol`을 잡는다. 순서가 바뀌면 번들은 오류 없이 뜨지만
`checkOl().ok`가 false, `attach`는 "전역 ol을 찾지 못했다 — 공식 full build(ol.js)를 이 번들보다 먼저 불러온다"로 실패한다.

**엔진이 업무 지도에 하는 일 / 안 하는 일**

| 한다 | 안 한다 |
|---|---|
| 자기 레이어 추가(`zIndex` 옵션 값), 자기 interaction(Draw·Select·Modify)은 도구를 켤 때만 | 업무 지도의 기존 레이어·interaction·control·overlay 제거·비활성화 |
| 측정 툴팁 overlay, 지도 target 안에 커서 안내·텍스트 입력 DOM, viewport·document에 필요한 리스너 | `setTarget`, View 교체, View의 min/maxZoom·center 변경(`flyTo`·`fit`을 부를 때만 View를 움직인다) |
| 좌표계 등록(10절 — 이미 있는 코드는 덮어쓰지 않는다) | 업무 화면이 등록한 좌표계 객체 바꾸기 |
| `destroy()` 때 자기가 붙인 것만 뗀다 | 업무 지도 건드리기 — 레이어(수·순서·인스턴스)·interaction·control·overlay·지도/뷰/컬렉션 리스너·target DOM·속성·뷰 상태가 붙이기 전과 같다(버전마다 17항목 대조) |

- `mount()`/`unmount()`는 붙이기 모드에서 경고만 하고 아무것도 안 한다(지도 위치는 업무 화면 것).
- 같은 지도에 두 번 붙이면 "이미 엔진이 붙어 있다", `ol.Map`이 아닌 것을 주면 "ol.Map 인스턴스가 아니다" 오류.
- target이 아직 없는 지도에 먼저 붙이고 나중에 `setTarget`해도 된다.
- 업무 화면이 자기 Select·Draw를 늘 켜 두면 엔진의 선택·편집 도구와 클릭이 겹칠 수 있다. 엔진은 도구를 켤 때만 interaction을 넣으므로, 겹치면 업무 쪽을 끄는 것은 업무 화면 몫이다.
- **뷰 좌표계**: EPSG:3857이 아니어도 된다(EPSG:5186·EPSG:4326 뷰에서 측정·flyTo·GeoJSON 입출력 확인). 다만 뷰 좌표계 ↔ 경위도(EPSG:4326) 변환이
  OL에 등록돼 있어야 한다. OL은 변환이 없으면 오류 없이 좌표를 그대로 돌려줘서 엉뚱한 곳을 그리므로, `attach`가 미리 검사해
  "호스트 지도 뷰 좌표계 X에서 EPSG:4326으로 바꾸는 변환이 등록돼 있지 않다"로 막는다. 해결: `GisMap.attach(map, { projections: { 'X': '+proj=…' } })`
  (좌표계 객체는 그대로 두고 변환만 더한다) 또는 업무 화면이 `proj4.defs(…)` + `ol.proj.proj4.register(proj4)`로 먼저 등록.
  3857 배경 타일(VWorld 등)은 OL이 화면 좌표계로 다시 그린다(래스터 재투영 — 느려질 수 있다).
- 바람길 플러그인(`gis.use(GisMap.plugins.wind())`)은 설치·제거까지만 시험했다. 바람길 표시(ol-wind 렌더러)는 버전별로 시험하지 않았다(10절).

**업무 화면이 ES 모듈 ol(`import Map from 'ol/Map'`, webpack·vite 번들)만 쓰는 경우**: attach UMD를 쓰지 않는다(전역 `ol` 네임스페이스가 없다).
패키지 폴더를 복사해 번들러로 `import { attachGisMap } from '<패키지>/src/core'`를 쓴다. 이때 업무 코드와 엔진이 **같은 ol 사본**을 써야 한다
(`npm ls ol`로 하나인지 확인, vite면 `resolve.dedupe: ['ol']`). 사본이 둘이면 `attachGisMap`이 "ol.Map 인스턴스가 아니다 … ol 사본이 두 개" 오류를 낸다.

## 7. AMD·CommonJS 로더가 있는 페이지 (RequireJS·Dojo 등)

두 번들은 UMD다. 페이지에 `define.amd`가 있으면 **전역 `GisMap`을 만들지 않고** 이름 없는 AMD 모듈로 등록한다(`module`·`exports`가 있으면
CommonJS로 내보낸다). 그래서 오류 없이 `GisMap is not defined`만 나거나 지도가 안 뜬다. RequireJS에서는 그다음 `require()` 때
"Mismatched anonymous define()" 오류가 난다(RequireJS 2.3.7 실측).

- **방법 1(권장) — 로더로 받는다**:
  ```js
  require.config({ paths: { 'gis-map': ctx + '/resources/gis-map/0.1.0/gis-map.umd' } });   // .js 빼고
  require(['gis-map'], function (GisMap) { var map = GisMap.create({ target: 'map', ... }); });
  ```
  attach 번들은 AMD 의존성 이름이 `'ol'`이다. 공식 `ol.js`는 AMD 모듈이 아니라 전역 변수만 만들므로, 먼저 알려 준다:
  ```js
  define('ol', [], function () { return window.ol; });            // ol.js를 <script>로 불러온 뒤
  require.config({ paths: { 'gis-map-attach': ctx + '/resources/gis-map/0.1.0/gis-map.attach.umd' } });
  require(['gis-map-attach'], function (GisMap) { var gis = GisMap.attach(workMap, { ... }); });
  ```
- **방법 2 — 전역이 꼭 필요하면 번들을 불러오는 동안만 `define`을 치운다**:
  ```html
  <script>window.__define = window.define; window.define = undefined;</script>
  <script src=".../gis-map.umd.js"></script>
  <script>window.define = window.__define;</script>   <!-- 이제 전역 GisMap이 있고 RequireJS도 계속 정상 -->
  ```
- 번들 래퍼를 바꿔 "로더가 있어도 전역을 함께 만들기"는 하지 않았다. 로더 쪽 모듈 등록 방식(이름 없는 define)과 겹치는 결정이라 설계 결정으로 남겼다.

## 8. JSP 안에서 JS를 쓸 때 — `${…}` 주의

JSP는 **스크립트 블록 안의 `${…}`도 EL로 먼저 바꾼다.** 그래서 JS 템플릿 문자열(`` `합계 ${n}` ``)을 그대로 쓰면 서버에서 빈 값(또는 EL 오류)이 된다.
`standalone.html`처럼 템플릿 문자열을 쓴 코드를 JSP로 옮길 때 특히 조심한다.
- ES5 문자열 연결(`'합계 ' + n`)을 쓴다 — 이 폴더의 JSP 예제는 전부 이 방식이다.
- 꼭 써야 하면 `\${n}`처럼 역슬래시로 EL을 막는다(JSP 2.0+).
- 서버 값은 JS 문자열에 EL로 바로 꽂지 않는다(`'${vworldKey}'`는 따옴표가 섞이면 스크립트가 깨지는 XSS 통로). `data-` 속성 + `<c:out>`(3절).

## 9. 브라우저 범위

- 번들 문법은 **ES2019**(Chrome·Edge 73+, Firefox 67+, Safari 12.1+). 옵셔널 체이닝·`??`·클래스 필드는 빌드가 낮춰 썼고,
  `Object.hasOwn`·`structuredClone`·`Array.prototype.at` 같은 새 내장 함수는 번들에 없다(빌드 때 점검).
- 실제 하한은 **Chromium Edge/Chrome 80 이상**으로 잡는다(ol 9가 쓰는 `ResizeObserver`·`flatMap`·포인터 이벤트 + 여유).
  attach 번들은 업무 화면의 ol 버전이 요구하는 브라우저도 함께 따른다. IE11은 대상이 아니다.
- CSS의 최소 리셋은 `:where()`(Chrome 88+)를 쓴다. 그보다 낮은 브라우저에서는 그 규칙만 빠지고 측정 툴팁·텍스트 입력은
  자기 규칙으로 그려진다.

## 10. 알려진 제한

**(1) 코어 CSS의 크기 단위가 `rem`이다** — 업무 페이지가 뿌리(`html`) 글자 크기를 바꾸면 측정 툴팁·텍스트 입력·커서 안내의 크기가 같이 바뀐다.
글자 크기는 `body`에 주고 `html`은 브라우저 기본(16px)으로 둔다. 공공기관 퍼블리싱에서 흔한 `html { font-size: 62.5% }`(=10px)이면 측정 툴팁 글자가
**7.5px**가 된다. 아래는 QA FE-6b가 Chrome에서 잰 값(뿌리 16px → 10px / 20px, 바뀌는 계산값 34개). 축척 막대는 px라 그대로다.
px로 바꿀지는 설계 결정 대기다.

| 코어 DOM | 속성(16px → 10px / 20px) |
|---|---|
| 측정 툴팁 `.gm-measure-tooltip` | font-size 12 → 7.5 / 15, padding 4·10 → 2.5·6.25 / 5·12.5, radius 4 → 2.5 / 5 |
| 툴팁 닫기 `.gm-measure-tooltip__close` | margin-left 4 → 2.5 / 5, font-size 12 → 7.5 / 15 (폭·높이 10px 고정) |
| 커서 안내 `.gm-tool-hint__label` | padding 6·10 → 3.75·6.25 / 7.5·12.5, radius 6 → 3.75 / 7.5 (**글자 11px 고정**) |
| 텍스트 입력 `.gm-text-input__field` | **width 192 → 120 / 240**, font-size 14 → 8.75 / 17.5, padding 8·12 → 5·7.5 / 10·15, line-height 20 → 12.5 / 25 |
| 말풍선 `__body`·`__box`·`__close` | margin-bottom 8 → 5 / 10, radius 6 → 3.75 / 7.5, padding 8 → 5 / 10 |
| 축척 막대 | 변화 없음(px) |

**(2) attach가 업무 화면의 ol 좌표계 목록에 남기는 것** — 붙일 때 엔진은 한국 좌표계(EPSG:5186·5179·5185·5187·5188)를 등록하는데, 이때 쓰는
`ol.proj.proj4.register(proj4)`가 엔진 번들 proj4에 내장된 정의(EPSG:4269, UTM EPSG:326xx·327xx 등 약 130개)까지 업무 화면의 ol 좌표계 목록에 더한다.
이미 있는 코드는 덮어쓰지 않고(변환이 없을 때만 변환을 더함), `destroy()` 뒤에도 남는다. 등록이 뷰 좌표계 검사보다 먼저라서 **attach가 "변환이 등록돼 있지 않다"로 실패해도** 이 등록은 이미 일어난 뒤다(지도에는 아무것도 붙지 않는다). 또 `ol.proj.proj4`가 기억하는 proj4가 엔진 번들 사본으로
바뀐다(업무 화면이 `ol.proj.proj4.fromEPSGCode`를 쓰면 영향). 원하지 않으면 `GisMap.attach(map, { projections: false })` — 그러면 아무것도 등록하지 않고
(시험 확인), 뷰 좌표계 변환은 업무 화면이 이미 등록한 것을 쓴다.

**(3) 바람길(ol-wind) 표시는 버전 매트릭스에서 빠졌다** — 개발 환경에서 바람길을 켜지 않는다는 규칙 때문에 설치·제거만 시험했다. ol-wind는
`ol.renderer.canvas.Layer`를 상속하며, 번들이 뜨는 순간 그 상속이 성공하는 것까지는 버전마다 확인됐다.

**(4) (a) 번들 지도에는 OL 저작자 표시 컨트롤이 없다** — 번들 ol은 숨은 사본이라 페이지가 `ol.control.Attribution`을 만들어 넣을 수 없다.
OpenStreetMap 타일처럼 저작자 표시가 필요한 타일을 쓰면 `map.html`처럼 페이지가 지도 위에 문구를 직접 보인다. attach는 업무 지도의 컨트롤을 그대로 쓴다.
