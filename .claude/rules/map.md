---
paths:
  - "frontend/packages/gis-map/**"
  - "frontend/src/app/map/**"
  - "frontend/src/app/map-admin/**"
  - "frontend/src/app/map-dev/**"
  - "frontend/src/app/admin/geoserver/**"
  - "frontend/src/app/proxy/**"
  - "backend/src/main/java/com/gtp/domain/map/**"
  - "backend/src/main/java/com/gtp/domain/mymap/**"
  - "backend/src/main/java/com/gtp/domain/geoserver/**"
  - "backend/src/main/java/com/gtp/domain/geotiff/**"
  - "backend/src/main/java/com/gtp/domain/wind/**"
  - "backend/src/main/java/com/gtp/global/gis/**"
---

# 지도 규칙

사용자는 이 지도 기능을 **다른 프로젝트(공공기관 JSP·전자정부·기존 OL 지도 화면 포함)로 그대로 가져가서** 쓴다. 지도 코드가
GTProject의 인증 스토어·환경 변수·전역 상태에 묶이면 옮길 때마다 뜯어고쳐야 해서 재사용이 무너진다.
그래서 아래 계약이 이 프로젝트에서 가장 강한 규칙이다. 설계: `.claude/design-docs/2026-09-23-map-module-restructure.md`(맨 위 구현 요약).

## 이식성 계약 (프론트)

**이식 단위:** `frontend/packages/gis-map/` 폴더 하나(`@gtp/gis-map`). 안에서는 **상대 경로로만** import한다.

| 계층 | 하는 일 | import 허용 |
|---|---|---|
| `src/core/` | 지도 엔진(React 없음): `createGisMap`·`attachGisMap`, 도구, 레이어 트리, 오버레이, 필지·지역명, `olCompat` | `ol`, `ol/*`, `proj4`, core 안 |
| `src/core/wind/` | 바람길 플러그인 | + `ol-wind` (여기서만) |
| `src/react/` | `GisMapProvider`·`GisMapView`·훅 | + `react`, core |
| `src/ui/` | 선택형 위젯(`MapShell` 등) | + `react`, `react-dom`, `lucide-react`, react·core |
| `src/adapters/{rest,proxy}/` | 짝 백엔드 REST·호스트 프록시 형식 → `GisMapSources` | core만 |
| `src/styles/` | `gis-map.css`(리셋·`--gm-*`·코어 DOM) · `gis-map-ui.css`(위젯) | — |
| `src/standalone.ts` · `standalone-attach.ts` | UMD (a) 엔진이 지도 생성 / (b) 기존 ol 지도에 붙이기 | core·wind·adapters (React 금지) |

의존 방향: `ui → react → core`, `adapters → core`. core는 누구도 import하지 않는다.

**패키지 안 금지:** 앱 import(`@/…`, 자기 자신 `@gtp/gis-map`, 패키지 밖 상대 경로), `process.env`·`import.meta.env`,
모듈 전역 가변 상태(최상위 `let`/`var`·`new Map/Set`·zustand `create`·얼리지 않은 공개 상수 — 상태는 전부 `GisMap` 인스턴스와 그 컨트롤러 필드),
`window`/`self`/`globalThis` 쓰기(UMD 진입점 2개만 예외), `localStorage`(`react/usePersistentExpanded.ts`만), Tailwind 클래스(`gm-` 접두사 CSS만,
조건부 클래스는 `cx()`, className 템플릿 문자열 금지), 호스트 경로·주소 하드코딩(`localhost`, `/api/…`·`/proxy/…` — **`adapters/`만** 허용,
`core/host.ts`의 `DEFAULT_HOST` 기본값 예외), core에서 `'EPSG:3857'` 리터럴(`config.ts`·`projection.ts`만 — 뷰 좌표계는 `map.getView().getProjection()`).

**외부 값은 주입받는다 — `GisMapHost` 하나** (`core/host.ts`, `MapHostValue`/`mapAuthBridge`는 없어졌다):
`http.getHeaders()`(요청마다 다시 읽음)·`credentials`·`onUnauthorized`, `endpoints.{apiBaseUrl, proxyBaseUrl, geoserverUrl}`, `keys.vworld`,
`getCurrentUser()`, `isFeatureAllowed(id)`·`permissionsReady`. 일부만 넘기면 `DEFAULT_HOST`로 채운다.
React는 `<GisMapProvider host={…}>`(바뀌면 `map.setHost`), UMD는 `GisMap.create/attach({ host })`.
**데이터는 `GisMapSources`로만** (`core/sources.ts`): `layerTree`(+`userSelection`)·`myMap`·`geoTiff`·`wind`(`restSources()`),
`addressSearch`·`parcel`·`regionName`·`legend`·`wfs`(`proxySources()`). 소스가 없으면 그 기능은 조용히 꺼진다. 코어·위젯은 fetch를 직접 하지 않는다.

**GTProject 연결부(이식 안 함):** `app/map/page.tsx`(조립만) + `app/map/_gtp/`
— `useGtpMapHost.ts`(authStore·menuStore·env → host), `gtpMap.tsx`(중심·브랜드 색·소스·바람길 플러그인·기타 패널 상수), `mapSession.ts`(앱 기억), `EtcPanel.tsx`.
`app/map-admin/layer`는 엔진 없이 `usePersistentExpanded`와 `./types`만 쓴다. 앱은 공개 진입점 6개(`@gtp/gis-map/{core,core/wind,react,ui,adapters/rest,adapters/proxy}`)만 import한다.

**새 코드를 어디에 두나**

| 무엇 | 어디 |
|---|---|
| 지도 동작(OL 레이어·interaction·계산), React와 무관 | `core/` — 상태는 인스턴스 필드 + `core/store.ts` 스토어, 엔진이 붙인 것은 `tracker`로 추적해 `destroy`에서 해제 |
| 새 ol API를 core에서 사용 | `core/olCompat.ts` `REQUIRED_OL_API`에 추가(감사 15번이 강제). 타입만이면 `import type` |
| 서버·프록시 URL과 응답 형식 | `adapters/rest` 또는 `adapters/proxy`. 새 데이터 종류면 `core/sources.ts` 인터페이스부터 |
| 새 외부 값(인증·주소·키·권한) | `GisMapHost` 필드 + `DEFAULT_HOST` 기본값 → 앱은 `_gtp/useGtpMapHost.ts`에서 채움 |
| React 훅·Provider | `react/` |
| 화면 위젯 | `ui/` + `styles/gis-map-ui.css`(gm- 클래스, 동적 값만 인라인 style) |
| 측정 툴팁·텍스트 입력·커서 안내 모양 | `styles/gis-map.css`(attach CSS는 빌드가 엔진 DOM 뿌리로 옮긴다) |
| UMD 전역에 노출 | `standalone.ts` / `standalone-attach.ts` |
| GTProject 전용(브랜드·중심좌표·기타 패널·페이지 이동 간 기억) | `app/map/_gtp/` |
| 관리 화면 전용 타입·옵션 | `app/map-admin/layer/types.ts` |

**확인:** 지도 파일을 고치면 저장소 루트에서 `bash .claude/skills/map-module-export/scripts/audit-portability.sh`(인자 없이, 1~15번),
`frontend/`에서 `npx tsc --noEmit`과 `npx tsc -p packages/gis-map --noEmit`. UMD에 영향이 있으면 `npm run build:gis-umd` 뒤 감사를 다시 돌린다(15번이 번들도 대조).
감사가 못 잡는 것: 숨은 전역 CSS 의존(keyframes 등), GTProject 전용 개념이 타입에 섞였는지, 소스 인터페이스를 우회한 fetch, 다른 이름에 담은 전역 쓰기.

**호스트가 제공해야 하는 것:** `{proxyBaseUrl}` 아래 `/vworld/search`·`/vworld/legend-style`·`/vworld/data`·`/wfs`·`/region`(키 숨김 프록시),
`{apiBaseUrl}/api/` 아래 `layers`·`mymap`·`geotiff`·`wind`(쓰는 기능만). 엔드포인트·DDL은 `.claude/skills/map-module-export/references/`.

## 프론트 구조

- 좌표계: GTProject 뷰는 EPSG:3857(코어 기본값, `config.view.projection`으로 5179·5186 뷰 가능). 서버와 주고받는 GeoJSON·범위는 EPSG:4326.
  EPSG:5186·5179·5185·5187·5188은 `core/projection.ts`가 proj4로 등록(호스트에 없을 때만). 면적·거리는 geometry의 **실제 좌표계**(=뷰 좌표계)를 `projection`에 넣는다.
  알려진 예외: `ui/statusbar/MapStatusBar`는 원본을 3857로 고정해 둔다(비-3857 뷰 호스트에서는 상태바 값이 틀림 — 후속 과제).
- 엔진 = `GisMap`: `tools`(ToolManager)·`draw`·`layers`(LayerTreeController — 트리·가시성·투명도·배경지도·펼침)·`raster`(GeoTIFF)·`vector`(나만의지도)·
  `parcel`·`region` + 플러그인(`wind`). `clearAll()`은 그리기·측정·반경·필지·플러그인 `clear()`를 정리하고 GeoTIFF/나만의지도는 남긴다.
- 레이어 트리: `LayerGroupDef`(중첩) > `LayerDef`. `flattenGroupLayers()`로 잎 레이어를 모은다. 나만의지도는 트리에 얹지 않고 `vector` 오버레이로 관리.
- 붙이기(attach): 엔진이 붙인 레이어·interaction·overlay·control·리스너만 추적·해제하고 호스트의 target·View·기존 레이어는 건드리지 않는다.
  attach UMD는 ol을 싣지 않고 전역 `ol` 하나만 바깥 모듈로 쓴다(가상 모듈 `olPath`/`olMember`, `vite.config.ts`). 최소 ol 7.1(`checkOl`, `COMPATIBILITY.md`).
- CSS: (a) `gis-map.css`의 ol.css는 `.gm-root` 안으로 한정 → 엔진 지도 요소에 `gm-root` 필수. 호스트가 `--gm-*`·위젯 모양을 덮으려면 패키지 CSS **뒤**, `@layer` 밖.
  GTProject는 `app/globals.css`가 `ol/ol.css` 다음에 패키지 CSS 두 개를 상대 경로로 import한다.

## 백엔드 지도 도메인

- 5개 도메인(`map`·`mymap`·`geoserver`·`geotiff`·`wind`)은 다른 도메인을, 서로도 import하지 않는다(감사 13번 실패). 공통은 `global/` 조각만:
  `global/response/ApiResponse`, `global/exception/{CustomException, BaseErrorCode}`, `global/gis/{GisErrorCode, GisUserContext}` + 구현 `SecurityContextGisUserContext`.
- 사용자·역할은 문자열(`userId`/`roleCode`)로만 다룬다. `map`의 `LayerUserAccess`도 BK-1에서 `String userId`로 바뀌어 `User` FK가 없다
  (DB의 옛 FK 제약은 설계문서 B1 이관 SQL을 사용자가 실행해야 없어진다 — 실행 전에는 탈퇴 사용자 PUT이 500, 회원 삭제가 FK로 실패할 수 있다).
- 지도 전용 에러는 `GisErrorCode.X`(`global/gis`), 현재 사용자·역할은 `GisUserContext`로만 읽는다. 지도 도메인에서 `ErrorCode.`·`SecurityContextHolder` 직접 사용 금지.
  전자정부 이식 때는 `GisUserContext` 구현 하나만 새로 쓴다(`references/egov-jdk11-checklist.md`).
- 업무 프로젝트(MyBatis)로 옮길 때의 테이블 DDL·쿼리 명세: `.claude/skills/map-module-export/references/{README,ddl,query-spec,egov-jdk11-checklist}.md`.
- GeoTools는 shp 파싱/GeoJSON 인코딩에만 쓴다. **`CRS.decode()` 등 EPSG DB 조회는 쓰지 않는다** — 폐쇄망에서 외부 네트워크를 찾다가 멈춘다.
  좌표 변환은 `mymap/util/CoordinateTransformUtil`(4326/3857/5186/5179 공식 직접 구현), `.prj` 판별은 `mymap/util/PrjParser`(정규식).
- 수만 건 이상 INSERT는 `saveAll()` 대신 `mymap/util/FeatureBatchInserter`(JdbcTemplate 배치). IDENTITY 채번에서는 `saveAll()`이 배치로 묶이지 않는다.
- `@Async` 메서드(`GeoTiffProcessor.process`, `UserMapProcessor.processShp`)를 `@Transactional` 안에서 호출하지 않는다 — 커밋 전에 비동기 스레드가 조회해 빈 값을 받는다.
- GeoTIFF는 GDAL(`gdal_translate`)로 COG 변환 후 titiler로 서빙. 로컬은 `titiler-local.sh`.
- 바람길은 기상청 LDAPS 데이터(`KMA_API_KEY`)를 6시간마다 가져온다. `grib2json` 의존성은 남아 있지만 쓰지 않는다.

## 함정 (실제로 겪은 것)

- **참조 안정성.** 의존성 배열·Provider prop에 들어가는 함수·객체는 렌더마다 새로 만들지 않는다. 옛 `useAuthHeaders`가 매 렌더 새 함수를 돌려줘
  패널을 열면 3초에 `/api/mymap` 58번·`/api/geotiff` 120번 호출했다. 반환 함수는 `useCallback`, 객체는 `useMemo`, 설정·패널 목록은 모듈 상수
  (`_gtp/gtpMap.tsx`처럼). host 객체는 값이 바뀔 때만 새로. **화면으로는 안 드러난다** — 요청 수를 센다.
- **효과 실행 순서.** React는 자식 effect를 부모 effect보다 먼저 실행한다. 부모가 `useEffect`에서 인증 getter를 등록하는 방식(옛 `mapAuthBridge`)은
  자식의 첫 요청이 역할·토큰 없이 나가는 경쟁을 만들었다. 첫 호출 전에 필요한 값은 렌더 시점에 넘기는 getter(`GisMapHost`)로 주입한다.
- **StrictMode 요청 수는 2배가 정상.** 개발 모드에서 패널 마운트 요청은 정확히 2번(TIFF `/api/geotiff` 2, 나만의지도 `/api/mymap` 2,
  진입 `tree/permission/{role}` 2·`user-access` 2), 열어 둔 뒤 증가 0, `/api/wind` 0. 셀 때는 `fetch`를 감싸 **시작 시점**에 센다 —
  `performance.getEntriesByType('resource')`는 취소된 요청을 빼서 1로 보인다.
- **로컬 개발 서버에서 바람길을 켜지 않는다(검증 목적 포함).** `GET /api/wind/latest`가 원격 운영 DB에서 4.7MB를 읽어 한 건 약 115초,
  요청이 겹치면 백엔드가 `OutOfMemoryError`로 멈춘다(복구는 재시작). 바람길은 앱 기억에도 넣지 않는다(켠 채 돌아오면 곧바로 재요청).
- **앱 기억(`_gtp/mapSession.ts`) 규칙.** 패키지는 모듈 전역 상태가 없으므로 페이지 이동 간 기억은 앱이 한다: 메모리 `Map`(새로고침하면 처음부터 =
  옛 zustand 수명), 열린 패널·그리기 스타일·켠 도구·반경만, 주인(userId)이 바뀌면 지움, Provider `setup`에서 엔진 공개 API로 되살리고 엔진 스토어 구독은
  `destroy`에서 해제. sessionStorage로 바꾸면 SSR 첫 화면과 어긋난다(하이드레이션).
- **브라우저 창이 가려지면 시험이 거짓 차이를 낸다.** CSS transition이 중간값에서 멈추고 OL 렌더가 돌지 않아(축척 막대 빈칸) 기준선 비교가 틀린다.
  비교 전 `transition:none` 주입 + `map.renderSync()` + 상태바 좌표는 `pointermove` 흉내. 뷰포트 에뮬레이션(1280×800)은 턴마다 풀리니 다시 설정하고,
  기준선은 항상 강력 새로고침 직후(레이어 패널 기본 열림 — `레이어` 단추를 누르면 닫힌다)에서 시작한다.
- **Tailwind 4.1.11 캐시 경합.** `@tailwindcss/postcss`는 입구 CSS의 mtime만 보고 전체 재빌드를 정한다. 개발 서버가 옛 `globals.css`를 읽은 직후
  파일이 바뀌면 옛 내용으로 만든 컴파일러를 계속 써서 새 규칙이 안 나온다(가져오는 CSS의 mtime이 바뀌어야 풀림). `globals.css`와 패키지 CSS를
  동시에 쓰지 말고, `globals.css`를 먼저 쓰고 몇 초 뒤 나머지를 쓴 다음, 제공되는 CSS에 새 규칙이 있는지 확인한다.
- **핫 리로드 중간 상태.** 여러 파일을 차례로 저장하는 동안 `reading 'store'`류 일시 오류가 콘솔에 남는다. 확인 전에는 강력 새로고침.
- **VWorld 키는 도메인(Referer)에 묶여 있다.** 앱 밖에서 curl로 시험하면 Referer 없이는 정상 레이어도 `INCORRECT_KEY`다.
- **(a) UMD에서 `gm-root`를 빠뜨리면 조용히 망가진다**(ol.css가 하나도 안 걸림). 예제·문서의 지도 요소는 모두 `class="gm-root"`.
