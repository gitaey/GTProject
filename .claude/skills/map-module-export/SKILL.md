---
name: map-module-export
description: GTProject의 OpenLayers 지도 패키지(frontend/packages/gis-map — core·react·ui·adapters, UMD 번들)와 지도 백엔드를 다른 프로젝트로 옮기거나, 옮길 수 있는 상태인지 점검할 때 사용한다. "지도 기능 다른 프로젝트에 가져가고 싶어", "지도 모듈 이식", "지도 코드 복사해서 쓰려면", "JSP/전자정부에 지도 붙이기", "기존 OL 지도에 측정·그리기 붙이기", "이식성 점검/감사", "지도 모듈 의존성 확인", "공공기관 프로젝트에 지도 붙이기" 같은 요청에 반드시 사용한다. 지도 파일을 수정한 뒤 이식성 계약 위반이 없는지 확인할 때도 이 스킬의 감사 스크립트를 쓴다. 지도 기능을 새로 개발하는 것 자체는 fullstack-pipeline이나 map-dev 담당이다.
---

# 지도 패키지 이식 / 이식성 점검

이 스킬은 두 가지 일을 한다. 계약(허용·금지 의존성, 계층, 주입 인터페이스)은 `.claude/rules/map.md`에 있다 — 먼저 읽는다.

1. **점검** — 지금 코드가 이식 가능한 상태인지 확인한다.
2. **이식** — 대상 환경에 맞는 경로를 골라 절차를 안내하고, 연결 코드(호스트 주입·조립·JSP 페이지)를 대신 써 준다.

자료: 패키지 안내 `frontend/packages/gis-map/README.md`, JSP 상세 `frontend/packages/gis-map/examples/jsp/README.md`,
ol 버전 호환 `frontend/packages/gis-map/COMPATIBILITY.md`, 백엔드(전자정부·MyBatis) 이식 `references/README.md`(이 폴더).

## 1. 점검

저장소 루트에서:

```bash
bash .claude/skills/map-module-export/scripts/audit-portability.sh            # 1~15번, 위반 있으면 exit 1
bash .claude/skills/map-module-export/scripts/audit-portability.sh --report   # + 14번 백엔드 이식 비용(JDK 11 기준 수치)
# 옵션: --pkg <패키지 src>  --app <앱 src>  --backend <com/gtp 루트>  --node-modules <ol이 있는 node_modules>  --strict <번호,…>
```

| # | 보는 것 | # | 보는 것 |
|---|---|---|---|
| 1 | 앱 별칭·자기 자신·패키지 밖 import | 9 | core의 React 전용 API(createRoot, 'use client', .tsx) |
| 2 | `process.env`·`import.meta.env` | 10 | core의 `'EPSG:3857'` 하드코딩 |
| 3 | `localhost`, `/api`·`/proxy` 경로(adapters 밖) | 11 | 앱이 공개 진입점 6개 밖을 import |
| 4 | 계층 방향(`ui→react→core`, `adapters→core`) | 12 | 옛 폴더(`components/map`·`hooks/map`·`stores/map`) 재등장 |
| 5 | 계층별 npm 허용 목록 | 13 | 지도 백엔드 도메인이 다른 도메인·서로를 import |
| 6 | 모듈 전역 가변 상태(얼리지 않은 공개 상수 포함) | 14 | (정보) jakarta·record·텍스트 블록·switch 식·toList 개수 |
| 7 | `window`/`self`/`globalThis` 쓰기, localStorage | 15 | attach 번들 ol 경로 ↔ `REQUIRED_OL_API` ↔ vite 전역 규칙 ↔ 설치된 ol full build ↔ (있으면) dist |
| 8 | Tailwind 클래스(`gm-` 접두사만) | | |

스크립트가 못 잡는 것은 눈으로 본다: 숨은 전역 CSS 의존(keyframes 등), GTProject 전용 개념(User·Role 엔티티, 메뉴 ID 체계)이 패키지 타입에 섞였는지,
소스 인터페이스를 우회한 fetch, 다른 이름에 담은 전역 쓰기, 인라인 style 고정값. UMD 쪽을 고쳤으면 `frontend/`에서 `npm run build:gis-umd` 뒤 다시 돌린다.

위반을 고칠 때는 그 자리에 값을 복사해 넣지 않는다 — 외부 값은 `GisMapHost` 필드(+`DEFAULT_HOST` 기본값)로, 데이터는 `GisMapSources` + `adapters/`로,
GTProject 전용 값은 `frontend/src/app/map/_gtp/`로(map.md "새 코드를 어디에 두나").

## 2. 이식 — 대상부터 확인

| 대상 | 경로 | 가져갈 것 |
|---|---|---|
| React 앱(Next.js·Vite, React 18+) | **A** 폴더 복사 | `frontend/packages/gis-map/`(dist·node_modules 제외) |
| JSP·jQuery 페이지(지도를 새로 만듦) | **B** UMD (a) | `dist/gis-map.umd.js`·`gis-map.css`·`gis-map.THIRD-PARTY-NOTICES.txt` |
| 이미 전역 `ol`(ol.js)로 `new ol.Map`을 쓰는 화면 | **C** attach UMD (b) | `dist/gis-map.attach.umd.js`·`gis-map.attach.css`·`gis-map.attach.THIRD-PARTY-NOTICES.txt` |
| ES 모듈 ol(webpack·vite)로 지도를 쓰는 화면 | **A**의 core만 + `attachGisMap` | 패키지 폴더(같은 ol 사본 필수) |
| 백엔드 — Spring Boot 3·JPA | **D1** 도메인 복사 | 지도 5개 도메인 + global 조각 |
| 백엔드 — 전자정부(JDK 11·Spring 5·MyBatis) | **D2** 재구현 | `references/` 문서대로 매퍼·설정 작성 |

대상의 ol 버전(attach면 7.1 이상), React 버전, 인증 방식(JWT 헤더 / 세션 쿠키+CSRF), 프록시를 둘 서버, 쓸 기능(레이어 트리·나만의지도·GeoTIFF·바람길·검색)을 먼저 묻는다.

### A. React 앱 — 폴더 복사

1. `frontend/packages/gis-map/`을 대상 프로젝트로 복사한다(`dist/` 제외). 패키지 안 import는 전부 상대 경로라 손댈 것이 없다.
2. 의존성: `ol@^9.2`, `proj4@^2.20`, `react`·`react-dom`(18+), `lucide-react`(위젯), `ol-wind@^1.1`(바람길을 쓰면). zustand·Tailwind는 필요 없다.
3. 경로 별칭 6개(`tsconfig.json` `paths` — GTProject `frontend/tsconfig.json` 참고): `@gtp/gis-map/core`, `/core/wind`, `/react`, `/ui`, `/adapters/rest`,
   `/adapters/proxy` → 각 `src/.../index.ts`. 패키지가 프로젝트 안(node_modules 밖)이면 Next에서도 `transpilePackages`가 필요 없다.
4. 전역 CSS: `ol/ol.css` → `src/styles/gis-map.css` → `src/styles/gis-map-ui.css`. 테마는 `config.theme.primary` 또는 `.gm-root { --gm-primary: … }`(패키지 CSS 뒤, `@layer` 밖).
5. 호스트 주입 훅을 쓴다(`frontend/src/app/map/_gtp/useGtpMapHost.ts`가 예시) — 대상의 인증·권한 스토어를 읽어 `PartialGisMapHost`를 돌려주고 `useMemo`로 고정:
   `http.getHeaders`(Bearer 토큰 등, 요청마다 호출), `endpoints.apiBaseUrl`·`proxyBaseUrl`·`geoserverUrl`, `keys.vworld`, `getCurrentUser`(`{ userId, role }`),
   `isFeatureAllowed`·`permissionsReady`(권한 체계가 없으면 생략 → 전부 표시).
6. 조립: `<GisMapProvider host={host} config={CONFIG} setup={setup}><MapShell brand={…} panels={…} /></GisMapProvider>`.
   `CONFIG`(view·theme·sources·layers)와 `panels`는 **모듈 상수**로 둔다(`_gtp/gtpMap.tsx` 참고). 필요 없는 패널·도구는 `panels`·`show*` props나
   기능 ID(`map.panel.{layer,image,mymap}`, `map.tool.{zoom,draw,measure-distance,measure-area,radius-search,wind,clear}`)로 끈다.
7. 데이터: 짝 백엔드가 GTProject와 같은 형식이면 `sources: [restSources(), proxySources()]`. 다르면 그 소스만 직접 구현해 배열 뒤에 둔다.
   VWorld 키를 숨기려면 `{proxyBaseUrl}` 아래 `/vworld/search`·`/vworld/data`·`/vworld/legend-style`·`/wfs`·`/region`을 대상 서버에 만든다
   (Next면 `frontend/src/app/proxy/{vworld,wfs,region}`의 `route.ts`를 복사하고 키는 환경 변수 이름으로만 읽는다).
8. 확인: 대상에서 타입 검사 + 화면(레이어 트리·측정·검색). GTProject에서 복사본을 점검하려면 `--pkg <복사본>/src --app <대상 src> --node-modules <대상 node_modules>`.

### B. JSP — UMD (a) `GisMap.create`

1. GTProject `frontend/`에서 `npm run build:gis-umd` → `packages/gis-map/dist/`.
2. 업무 프로젝트 `src/main/webapp/resources/gis-map/<버전>/`에 (a) 파일 3개를 복사한다(버전 = `GisMap.version`, 캐시 문제 방지).
3. `examples/jsp/map.jsp`를 틀로 페이지를 쓴다: `<c:set var="ctx" …/>` + `<c:out>`(`<c:url>` 금지 — `;jsessionid` 노출), 서버 값은 `data-` 속성으로,
   지도 요소에 `class="gm-root"` **필수**, 높이는 페이지가 준다. 세션 쿠키 인증이면 `http: { credentials: 'same-origin', getHeaders: () => ({ 'X-CSRF-TOKEN': … }) }`.
4. 버튼 → 엔진 API(`map.tools.activate('measure-area')`, `map.layers.toggleLayer(id)`, `map.flyTo({lon,lat})`, `map.clearAll()`), 상태 표시는 `map.tools.store.subscribe`.
5. 문서 전체를 떠날 때만 `pagehide`(`e.persisted`면 건너뜀)에서 `map.destroy()`. AMD 로더 페이지는 `examples/jsp/README.md` 7절.

### C. 기존 ol 지도에 붙이기 — attach UMD (b)

1. (b) 파일 3개를 복사. 순서: 업무 `ol.js` → `gis-map.attach.css`(ol.css 없음) → `gis-map.attach.umd.js`.
2. `GisMap.checkOl()`로 먼저 확인(`ok`, `missing`, `belowMinimum`). 최소 7.1(`COMPATIBILITY.md`).
3. `var gis = GisMap.attach(workMap, { host, sources, zIndex: { tools: 900, parcel: 950 } })` — 업무 레이어 zIndex 체계에 맞춘다.
   뷰가 3857이 아니면 그 좌표계 ↔ 4326 변환이 등록돼 있어야 한다(`projections` 옵션 또는 업무 쪽 `ol.proj.proj4.register`).
   업무 ol 좌표계 목록을 건드리기 싫으면 `projections: false`.
4. 업무 화면이 Select·Draw를 늘 켜 두면 엔진 도구와 클릭이 겹칠 수 있다 — 업무 쪽을 끄는 것은 업무 화면 몫. `gis.destroy()`는 엔진이 붙인 것만 뗀다.
5. 틀: `examples/jsp/attach.jsp`(서버 렌더), `attach.html`(정적, 붙였다 떼기 확인).

### D. 백엔드

- **D1 Spring Boot 3(같은 스택):** `backend/src/main/java/com/gtp/domain/{map,mymap,geoserver,geotiff,wind}` + `global/response/ApiResponse`,
  `global/exception/{CustomException,BaseErrorCode}`, `global/gis/{GisErrorCode,GisUserContext,SecurityContextGisUserContext}`. 대상 인증이 다르면
  `GisUserContext` 구현만 새로 쓴다. 설정 키(`geoserver.*`, `titiler.*`, `geotiff.upload-dir`, `mymap.upload-dir`, `kma.*`, `wind.*`)와 SecurityConfig 규칙을 옮긴다
  (`references/query-spec.md` 엔드포인트 표의 권한 열). 사용자는 `userId` 문자열이라 대상의 사용자 테이블과 FK로 묶지 않는다.
- **D2 전자정부·MyBatis:** `references/README.md`의 읽는 순서대로 — `query-spec.md`(무엇을 만들지, 최소 = `GET /api/layers/tree`) → `ddl.md`(테이블)
  → `query-spec.md` 4~13절(매퍼·깨지기 쉬운 계약) → `egov-jdk11-checklist.md`(Java 17 문법, javax, XML 설정, `GisUserContext` 전자정부 구현, 예외 핸들러).
- GTProject DB를 그대로 쓰는 경우 `tbl_layer_user_access`의 옛 `tbl_user` FK 제거 SQL(설계문서 B1)을 사용자에게 전달한다(실행은 사용자).

## 3. 보고

"가져간 것 / 새로 쓴 연결 코드(호스트·조립·JSP 페이지·프록시) / 대상에서 추가로 필요한 것(API·프록시·설정·ol 버전) / 점검 결과 / 확인 못 한 것"으로 정리한다.
비밀값(키·비밀번호·토큰)은 코드·문서에 쓰지 않고 환경 변수·서버 설정 이름만 적는다.
