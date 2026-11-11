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
| `src/adapters/memory/` | 서버 없는 데이터 공급원: 이미 가진 데이터로 소스를 만든다(`memorySources`), 합성 샘플 한 벌(`demoSources`, 시드 고정·가상 PNU). 저장소는 호출마다 만든 객체(전역 상태 없음) | core만 |
| `src/styles/` | `gis-map.css`(리셋·`--gm-*`·코어 DOM) · `gis-map-ui.css`(위젯) | — |
| `src/standalone.ts` · `standalone-attach.ts` | UMD (a) 엔진이 지도 생성 / (b) 기존 ol 지도에 붙이기 | core·wind·adapters (React 금지) |

의존 방향: `ui → react → core`, `adapters → core`. core는 누구도 import하지 않는다.

**패키지 안 금지:** 앱 import(`@/…`, 자기 자신 `@gtp/gis-map`, 패키지 밖 상대 경로), `process.env`·`import.meta.env`,
모듈 전역 가변 상태(최상위 `let`/`var`·`new Map/Set`·zustand `create`·얼리지 않은 공개 상수 — 상태는 전부 `GisMap` 인스턴스와 그 컨트롤러 필드),
`window`/`self`/`globalThis` 쓰기(UMD 진입점 2개만 예외), `localStorage`(`react/usePersistentExpanded.ts`·`adapters/memory/browserStorage.ts`만 — 감사 7번 허용 목록), Tailwind 클래스(`gm-` 접두사 CSS만,
조건부 클래스는 `cx()`, className 템플릿 문자열 금지), 호스트 경로·주소 하드코딩(`localhost`, `/api/…`·`/proxy/…` — **`adapters/`만** 허용,
`core/host.ts`의 `DEFAULT_HOST` 기본값 예외), core에서 `'EPSG:3857'` 리터럴(`config.ts`·`projection.ts`만 — 뷰 좌표계는 `map.getView().getProjection()`).

**외부 값은 주입받는다 — `GisMapHost` 하나** (`core/host.ts`, `MapHostValue`/`mapAuthBridge`는 없어졌다):
`http.getHeaders()`(요청마다 다시 읽음)·`credentials`·`onUnauthorized`, `endpoints.{apiBaseUrl, proxyBaseUrl, geoserverUrl}`, `keys.vworld`,
`getCurrentUser()`, `isFeatureAllowed(id)`·`permissionsReady`. 일부만 넘기면 `DEFAULT_HOST`로 채운다.
React는 `<GisMapProvider host={…}>`(바뀌면 `map.setHost`), UMD는 `GisMap.create/attach({ host })`.
**데이터는 `GisMapSources`로만** (`core/sources.ts`): `layerTree`(+`userSelection`)·`myMap`·`geoTiff`·`wind`(`restSources()`),
`addressSearch`·`parcel`·`regionName`·`legend`·`wfs`(`proxySources()`). 소스가 없으면 그 기능은 조용히 꺼진다.
설정 패널용 두 칸도 같은 규칙: `startView`(시작 화면 저장소 — `restStartView` 계정 저장이 `restSources()`에 자동 포함, 백엔드 없는 호스트는 `browserStartViewSource(key)`(adapters/memory, 브라우저 저장). **소스는 하나**라 둘을 섞지 않는다(뒤에 준 것이 이긴다))·`dataInfo`(데이터 기준 정보 `restDataInfo` — `/api/mymap/ref/status`+`/api/wind/frames`, `restSources()`에 자동 포함). 짝 백엔드가 그 API를 모르면(404) 카드가 조용히 빠진다. 코어·위젯은 fetch를 직접 하지 않는다.

**GTProject 연결부(이식 안 함):** `app/map/page.tsx`(조립만) + `app/map/_gtp/`
— `useGtpMapHost.ts`(authStore·menuStore·env → host), `gtpMap.tsx`(중심·브랜드 색·소스·바람길 플러그인·기타 패널 상수), `mapSession.ts`(앱 기억), `gtpTheme.ts`(화면 테마 선택 기억), `EtcPanel.tsx`.
`app/map-admin/layer`는 엔진 없이 `usePersistentExpanded`와 `./types`만 쓴다. 앱은 공개 진입점 7개(`@gtp/gis-map/{core,core/wind,react,ui,adapters/rest,adapters/proxy,adapters/memory}`)만 import한다.

**새 코드를 어디에 두나**

| 무엇 | 어디 |
|---|---|
| 지도 동작(OL 레이어·interaction·계산), React와 무관 | `core/` — 상태는 인스턴스 필드 + `core/store.ts` 스토어, 엔진이 붙인 것은 `tracker`로 추적해 `destroy`에서 해제 |
| 새 ol API를 core에서 사용 | `core/olCompat.ts` `REQUIRED_OL_API`에 추가(감사 15번이 강제). 타입만이면 `import type` |
| 서버·프록시 URL과 응답 형식 | `adapters/rest` 또는 `adapters/proxy`. 새 데이터 종류면 `core/sources.ts` 인터페이스부터 |
| 서버 없는 시연·시험용 가짜 데이터·소스 | `adapters/memory`(합성 생성기는 시드 고정, 가상 PNU는 `3611099900`+본번 9000번대 — 실제 지번과 겹치지 않게). 웹 데모(`app/demo`)·정적 예제(`examples/gis-demo`)가 같은 코드를 쓰므로 데이터 로직을 앱·예제 쪽에 따로 두지 않는다 |
| 새 외부 값(인증·주소·키·권한) | `GisMapHost` 필드 + `DEFAULT_HOST` 기본값 → 앱은 `_gtp/useGtpMapHost.ts`에서 채움 |
| React 훅·Provider | `react/` |
| 화면 위젯 | `ui/` + `styles/gis-map-ui.css`(gm- 클래스, 동적 값만 인라인 style) |
| 측정 툴팁·텍스트 입력·커서 안내 모양 | `styles/gis-map.css`(attach CSS는 빌드가 엔진 DOM 뿌리로 옮긴다) |
| UMD 전역에 노출 | `standalone.ts` / `standalone-attach.ts`(`adapters: { rest, proxy, memory, demo }`) |
| GTProject 전용(브랜드·중심좌표·기타 패널·페이지 이동 간 기억) | `app/map/_gtp/` |
| 관리 화면 전용 타입·옵션 | `app/map-admin/layer/types.ts` |

**확인:** 지도 파일을 고치면 저장소 루트에서 `bash .claude/skills/map-module-export/scripts/audit-portability.sh`(인자 없이, 1~15번),
`frontend/`에서 `npx tsc --noEmit`과 `npx tsc -p packages/gis-map --noEmit`. UMD에 영향이 있으면 `npm run build:gis-umd` 뒤 감사를 다시 돌린다(15번이 번들도 대조).
감사가 못 잡는 것: 숨은 전역 CSS 의존(keyframes 등), GTProject 전용 개념이 타입에 섞였는지, 소스 인터페이스를 우회한 fetch, 다른 이름에 담은 전역 쓰기.

**호스트가 제공해야 하는 것:** `{proxyBaseUrl}` 아래 `/vworld/search`·`/vworld/legend-style`·`/vworld/data`·`/wfs`·`/region`(키 숨김 프록시),
`{apiBaseUrl}/api/` 아래 `layers`·`mymap`·`geotiff`·`wind`·`gis/share-directory`(공유 상대 검색, 쓰는 기능만 — 없으면 아이디·역할 코드를 직접 입력하는 폴백). 엔드포인트·DDL은 `.claude/skills/map-module-export/references/`.

## 설정 패널 · 시작 화면 · 화면 밝기 (2026-11, 1단계 구현)

- 네비 아래 `설정`(`ui/settings/`)이 여는 셸 패널(`MapPanelDef.scope: 'shell'` — 분할 중에도 "대상 지도" 탭 없음, `SETTINGS_PANEL_ID = 'gm-settings'`). `MapShell settings`(기본 true, 객체면 `MapShellSettingsOptions`: `featureId`·`theme`·`startView`·`dataInfo`·`staticDataInfo`·`children`). **메뉴 권한 ID는 만들지 않는다**(새 ID가 `/admin/menu`에 저장된 역할에서 버튼을 숨기는 함정) — 막으려면 `settings.featureId`만.
- **`settings={false}`는 UI(버튼·패널)만 끈다.** 시작 화면 자동 적용(저장값 조회·적용·그림 보류)을 끄려면 `config.startView.autoApply:false`를 따로 준다(지도 위치를 직접 정하는 화면 — 예: map-dev/dual — 이 저장 위치로 덮이지 않게).
- 카드 3장: 화면 테마(`theme !== false`) · 시작 화면(소스 있음 + 서버 404 아님 + 엔진이 지도를 만든 경우) · 데이터 기준 정보(`sources.dataInfo` 또는 `staticDataInfo`). 패널을 열기만 해서는 요청 0, 데이터 기준 정보는 카드를 처음 펼칠 때만(닫으면 abort).
- 시작 화면: 엔진 `map.startView`(`core/startView/`) — `store`(status 8종·`value`·`applied`·`late`·`invalid`·`holding`·`saving`·`errorOp`·`errorKind`)·`load/save/clear/applyNow`. 엔진이 지도를 만들면(`createGisMap`, 붙이기 제외) 저장값을 읽고, 비동기면 **지도 그림(`olMap.setTarget`)을 최대 `config.startView.waitMs`(기본 1500)까지 보류**했다가 값이 오면 적용한다(첫 그림이 곧 시작 화면). 늦게 온 값은 `late`로 store에만 두고 지도는 움직이지 않는다([시작 화면으로] 강조). 조회 5초·저장/삭제 10초 시간 초과는 `restStartView`가 `GisHttpError(408)`로. 사용자(`getCurrentUser().userId`)가 바뀌면 store를 비운다. 분할 보조 지도는 `startView.autoApply:false`(조회·적용 없음).
- 저장하는 것: 분할 수·연동·활성 지도 + 지도마다 중심(4326)·줌·회전·배경지도. 저장 안 하는 것: 켠 레이어·열린 패널·그리기 스타일(`mapSession` 몫)·바람길. 순수 함수 `captureViewState/applyViewState/buildStartView/parseStartView`(`core`, UMD `GisMap.captureStartView/applyViewState/parseStartView`) — 서버는 형식·크기만 보므로 **내용 검사는 `parseStartView`가 유일한 관문**. 배경지도는 트리가 있으면 즉시·없으면 트리 도착 시 한 번(그 사이 사용자가 바꿨거나 그 모드 레이어가 없으면 건너뜀 — `layers.hasBasemapMode`).
- 분할 복원은 `react/split/GisMapSplitProvider`(`restoreStartView`, 기본 true)가 한다: 0번 지도가 `applied`이고 `split.count>1`이면 한 번만 `applyStartView`(사용자가 먼저 분할 수를 바꿨으면 안 함). 설정 패널의 [시작 화면으로]도 같은 `split.applyStartView`. 자식 effect가 먼저 돌아 셸 안에서 하면 Provider의 "처음 상태 복사"가 덮어쓰므로 Provider 안에서만.
- 화면 밝기: `config.appearance`·`map.setAppearance`(엔진이 직접 그리는 DOM용 — 엔진이 만드는 입력창·툴팁·팝업에 `data-gm-theme`를 단다)·`MapShell theme/defaultTheme/onThemeChange`·`MapRoot theme`(`data-gm-theme`, 라이트면 속성 없음). CSS는 `styles/gis-map.css`의 의미 토큰(`--gm-surface`·`--gm-text-muted`·`--gm-primary-soft`·… 라이트=지금 색, `[data-gm-theme="dark"]`·`@media (prefers-color-scheme: dark) [data-gm-theme="system"]` 두 블록은 값이 같고 함께 고친다). **다크 선택자는 속성 선택자만** — attach 빌드가 `.gm-root[...]`·`[...] .gm-root` 꼴을 실패시킨다. 위젯 CSS·인라인 색은 모두 의미 토큰으로 바뀌었다(데이터 색 — 그리기 견본·`DEPTH_COLORS`·나만의지도 팔레트·바람 척도·영역 분석 결과 색·필지 강조색 — 과 출력물은 토큰이 아니다, 출력은 항상 라이트). GTProject는 테마 카드를 켜고(`GTP_SETTINGS.theme:true`, 선택값은 localStorage `gtp-map-theme`이라 대시보드 테마와 별개) 공개 데모는 숨긴다(`DEMO_SETTINGS.theme:false`). `settings={false}`는 UI만 끈다 — 시작 화면 자동 적용을 끄려면 `config.startView.autoApply:false`. **함정:** 패키지 리셋 `.gm-root :where([class*="gm-"])`가 클래스 문자열에 "gm-"가 들어간 요소의 border·margin·padding을 0으로 만든다 — 기타 패널(Tailwind)은 `bg-(--gm-surface)`처럼 클래스에 `--gm-`을 직접 쓰지 말고 `_gtp/etc/EtcParts.tsx`의 `--etc-*` 별칭(`bg-(--etc-surface)`)을 쓴다. `document.body` 아래로 포털되는 모달은 `.gm-root` 밖이라 모달 루트에 `gm-root` 클래스와 `data-gm-theme`을 달아야 토큰을 받는다.
- GTProject 연결: `_gtp/gtpTheme.ts`(테마 선택 기억 — localStorage `gtp-map-theme`, 대시보드와 별개), `gtpMap.tsx`의 `GTP_SETTINGS`(정적 항목 VWorld 1건), `isGtpPanelVisible`이 `SETTINGS_PANEL_ID` 인정. 공개 데모는 `browserStartViewSource('gtp-demo-start-view')`("이 브라우저에 저장").
- 기록·시험: `_workspace/map-settings-panel/`(설계 `01_design.md`, 가짜 응답 `fake-fetch.js`, 순수 함수 시험 `check/run-check.sh`).

## 레이어 목록 플로팅 패널 — 오른쪽 끝 드로어 (2026-11)

- `MapShell layerFloat`(기본 **꺼짐 = DOM까지 예전과 같음**, `true` 또는 `MapShellLayerFloatOptions`: `featureId`(기본 `map.panel.layer`, null이면 검사 안 함)·`label`(기본 '레이어 목록')·`render`·`removeFromPanels`(기본 true)) + `defaultLayerFloatOpen`(기본 true, 마운트 때 한 번) + `onLayerFloatOpenChange`. 켜면 지도 무대 오른쪽 위 모서리에 딱 붙은 주황 "레이어 목록" 단추(`ui/layer/LayerFloat.tsx`, 높이 36px)가 생기고, 패키지 `layerPanel` 객체(`===`)만 왼쪽 네비에서 자동 제외된다(호스트가 직접 만든 레이어 패널은 안 뺀다). 왼쪽 패널은 `defaultPanel`을 생략하면 **닫힌 채** 시작한다.
- 목록은 단추 아래부터 무대 맨 아래까지 **오른쪽 끝에 붙은 전체 높이 드로어**(폭 `--gm-layer-float-width` 320px, 지도 위에 떠서 지도 크기는 그대로). 도구 모음은 단추 아래(44px)로 내려가고(`MapToolbar belowLauncher`), 도구 모음은 **움직이지 않고**, 열린 드로어(z-index 11)가 그 위를 덮는다(사용자 요청: 밀지 말고 뒤에 가려지게). 드로어(320)보다 왼쪽으로 더 나오는 도구 패널(출력 300·영역 분석/필지 320이 도구 모음 왼쪽 56px부터)이 삐져나오지 않게 `MapToolbar covered`(`gm-toolbar--covered`, `visibility:hidden` — 마운트·입력값·진행 유지, Tab·스크린리더에서 빠짐, 768px 이상에서만)가 도구 모음과 패널을 통째로 숨긴다. 오른쪽 아래 축척 막대만 무대에 `gm-has-drawer`(열림·분할 아님)가 붙으면 비킨다. 도구를 쓰려면 드로어를 닫는다 — 도구 단추 규칙·점 표시는 없다.
- 닫아도 목록은 `hidden`으로 남아 펼친 그룹·스크롤·설정 덮개가 유지된다. 분할 중에는 "대상 지도" 탭을 붙이고 활성 지도가 바뀌면 `key=map.id`로 다시 그린다. Esc는 포커스가 목록 안일 때만(한글 입력 중 무시, 설정 덮개가 열려 있으면 덮개만), 닫히면 단추로 포커스. 768px 미만은 CSS가 단추·드로어를 통째로 숨기고(도구 모음 이동 규칙도 `@media (min-width: 48rem)` 안에만) 기존 모바일 레이어 시트를 쓴다.
- GTProject: `_gtp/gtpMap.tsx`(`GTP_PANELS`에서 layer 제거, `GTP_LAYER_FLOAT`, `gtpInitialLayerFloatOpen`·`rememberGtpLayerFloat`), `_gtp/mapSession.ts`(`layerFloatOpen` — 페이지 이동 사이에만 기억, 새로고침하면 처음 값으로 — 레이어 목록 닫힘·왼쪽 패널은 나만의지도 열림. `gtpInitialPanel`: 기억이 없거나 볼 수 없는 패널이면 나만의지도, 닫아 두고 떠났으면 닫힘), `app/map/page.tsx`. **공개 데모·`/map-dev/dual`은 옵션을 안 줘서 예전 그대로**(데모 투어가 왼쪽 레이어 패널을 연다). UMD(`GisMap.create`/`attach`)는 UI를 싣지 않아 영향 없음.
- 알려진 약점: 드로어가 열려 있으면 지도 오른쪽 320px를 가린다(2·3분할에서는 맨 오른쪽 칸 일부와 그 칸의 축척 막대 — 닫으면 해결, 분할 칸 레이아웃은 안 바뀐다). 드로어가 열려 있으면 도구 모음과 열린 도구 패널이 숨겨져 도구를 못 쓴다(닫으면 해결, 진행 중이던 출력 등은 유지). 지역명 배지(가운데 위)가 좁은 화면에서 단추와 겹칠 수 있다. 낮은 노트북 화면에서 분할을 켜면 도구 모음 맨 아래가 잘릴 수 있다. "사용자 레이어" 탭(나만의지도·TIFF 목록)은 만들지 않았다 — 끈 TIFF 재표시에 엔진 수정이 필요하다.
- 기록·시험: `_workspace/layer-float-panel/`(설계 `01_design.md`·목업 — 설계의 "덮어씌우기"는 사용자 요청으로 드로어로 바뀜, 구현 `02_impl_stage1.md`·`02_impl_stage2_drawer.md`, QA `03_qa.md`, 시험 `check/run-check.mjs`).

## 나만의지도 패널 목록 개편 (2026-11-11)

- `ui/panels/MyMapPanel.tsx`는 머리줄(공유 = 테두리 보조 단추·선택 모드 / 업로드 = 채운 주 단추, `uploadShp`·`previewExcel`이 둘 다 없는 소스는 업로드 단추 없음) 아래에 **탭 두 개**(`ui/mymap/MyMapTabs`: `내 레이어 N` / `공유받은 N`, tablist·roving tabindex·←→·Home·End)를 둔다. 한 번에 한쪽 목록만 보이고 지도에 켠 레이어(엔진 `vector` 상태)는 탭과 무관하게 그대로다. 기본 탭 = 내 레이어(내 레이어 0개 + 공유받은 것만 있으면 공유받은), 사용자가 고르면 그것(`listModel.resolveTab`), 패널을 닫거나 분할 지도가 바뀌어 다시 마운트되면 기본 규칙으로. 한도 `3 / 20`·한도 안내는 **내 레이어 탭에만**, 선택 모드(일괄 공유)도 내 레이어 탭에서만(탭을 바꾸면 선택 모드 종료, 공유받은 탭에서 `공유`를 누르면 내 레이어 탭으로 옮겨 선택 모드 시작). 검색창은 두 탭 합계 8개 이상(`SEARCH_MIN_ITEMS`)일 때만, 검색은 현재 탭 안에서만, 탭 건수는 검색과 무관.
- 행(`MyMapListRow`): 표시 체크 32px + 색 견본(보기만) + 이름(2줄, 이름도 체크 라벨) + 정보 줄(회색 종류 칩·단위 붙은 개수) + 위치 이동·⋯. **목록에는 실패 개수·사유를 적지 않는다** — 처리 실패 = `등록하지 못했습니다` + `지우기`(소유자), 전부 못 찾음(featureCount 0) = `지도에 표시할 위치가 없습니다`(체크·위치 이동 비활성), 부분 실패는 정상과 같은 모양. 행 판정·검색·탭·한도 문구·색 견본·"처음 한 번" 대상 결정은 전부 `ui/mymap/listModel.ts` 순수 함수(시험 가능). 빈 화면(`MyMapEmptyState`)은 탭마다(내 레이어 = 첫 레이어 올리기·샘플 받기, 공유받은 = 업로드 유도 없는 안내), 목록 조회 실패는 "없음"과 구별되는 오류 화면/띠.
- **처음 등록 결과 창**: 이 화면에서 방금 올린 레이어(엑셀·SHP 모두 서버 확정 응답의 id가 있으면 그 id, id를 안 주는 옛 서버만 올리기 전 목록과 비교)가 처리(PROCESSING → READY/FAILED)를 마치면 업로드 결과 창(`MyMapImportReport`)을 **한 번** 자동으로 연다. 기억은 엔진 `map.vector.freshUploads`(`FreshUploadMemory` — 엔진 인스턴스 필드, 패널 언마운트에도 유지, 새로고침·destroy하면 사라짐). 규칙(`planFreshReports`): 이 패널에서 올렸거나 처리 중으로 지켜본 레이어만 열고, 패널을 닫은 사이 끝난 것·이미 올라가 있던 것·새로고침 직후는 조용히 지움(재등장 금지). 여럿이 동시에 끝나면 가장 최근(큰 id) 하나만, 다른 모달이 열려 있으면 닫힌 뒤. 자동 창은 요약이 오기 전엔 안 그리고 조회 실패면 조용히 닫힌다(오류만 보이는 창 없음). 결과 창은 바깥 클릭으로 안 닫히고(X·확인), 처리 실패는 보고서 없이 이유 문장을 보여 준다. 다시 보는 길 = ⋯ `업로드 결과 보기`(소유자만; 처리 실패는 소스 `importReport` 없이도).
- ⋯ 메뉴 순서(소유자 READY): 스타일·라벨 / 공유 / 속성 테이블 / 내보내기 / 업로드 결과 보기 / 삭제(`itemMenuModel` — `share` 추가, `canViewImportResult`). 샘플 받기는 업로드 창과 빈 화면이 공용 `ui/mymap/SampleLinks.tsx`를 쓴다. 새 CSS는 `.gm-panel`을 앞에 붙여 리셋 특이도를 이긴다. 선택 모드·다크는 의미 토큰만.
- 기록·시험: `_workspace/mymap-list-redesign/`(설계 `01_design.md`·목업, 구현 `02_impl.md`, 시험 `check/run-check.mjs` — 순수 규칙 + 가짜 엔진으로 패널 서버 렌더 + HEAD와 TIFF·레이어 패널 HTML 비교).

## 나만의지도 업로드 창 개편 — 끌어 놓기·자동 판별 (2026-11-11)

- `ui/mymap/MyMapUploadModal`(창 제목 "레이어 올리기", 주 단추 "레이어 만들기")은 **종류(SHP/엑셀)를 묻지 않는 한 화면**이다. 첫 화면 = 큰 끌어 놓기 영역(진짜 `button`, Enter·Space로 파일 선택창, 숨은 input `accept=".xlsx,.shp,.shx,.dbf,.prj,.cpg"`) + 샘플 엑셀 받기(공용 `SampleLinks`) + 접힌 "무엇을 올릴 수 있나요?"(한도는 `quota`가 있을 때만). 단계 표시·[이전]은 없다. **창 전체가 드롭 대상**(`useFileDrop` — 파일이 아닌 끌기는 무시, dragenter/leave 계수로 덮개, 처리 중에는 "지금은 놓을 수 없습니다" 회색 덮개)이고, 창이 열려 있는 동안 어두운 배경에 놓아도 브라우저가 파일을 열어 페이지를 떠나지 않게 `useBlockBrowserFileOpen`이 window 리스너를 달았다 푼다(바깥 클릭으로 닫히지 않는 규칙은 그대로, Esc는 **파일이 없고 처리 중이 아닐 때만** 닫음). 폴더를 놓으면 **한 단계만** 읽어 안의 파일을 쓴다(`folderEntries.ts`, 하위 폴더 무시, `webkitGetAsEntry` 없으면 `dt.files`).
- 판별은 React 없는 순수 함수가 한다: `uploadFiles.ts`(`classifyFiles`·`resolvePick`·`mergeShpFiles`·`shouldMergeShp` — 엑셀 1개 → excel, 여러 개 → choose-excel, SHP 계열 한 벌 → shp(빠진 .shp/.dbf·.shx 없음·.prj 없음·이름 불일치·용량), 여러 벌 → choose-shp, 둘이 섞임 → mixed, .xls·.csv·.zip·그 밖·0바이트 → unsupported), `uploadModel.ts`(엑셀 추천 `quickReady`·열 기본값·바닥줄 `footerOf`·카드/칩 문구·예외 문구 — 설계 6장 표), `sniffFile.ts`(엑셀 머리 8바이트: `PK` 진행, `D0 CF 11 E0` 암호/옛 형식, 그 밖 엑셀 아님). 시험 가능하게 DOM·React를 안 쓴다.
- **엑셀**: 놓으면 로컬 검사(0바이트·용량·머리 바이트) → 서버 미리보기(`previewExcel`) → 추천이 맞으면(새 서버·추천 방법과 열이 실제 머리글에 있음·좌표는 좌표계 추천도 있음·행 한도 안·OVER_LIMIT 없음) **요약 한 장 + 이름 + [레이어 만들기]**(빠른 길, [바꾸기]로 방법 라디오·열 select 펼침), 아니면 같은 화면에서 방법·열을 고른다(`ExcelLocationCard`, "필요" 표시, 좌표계 미추천이면 확인 문구). 옛 서버(suggestions 없음)는 좌표 열만. 확정 404(미리보기 만료)는 어댑터가 `GisHttpError(404)`로 던져 [다시 읽기](고른 방법·열 유지). **"엑셀로만 받기"(주소 변환)는 주소 방법일 때만 보이는 보조 줄**이라 누르면 같은 창이 변환 모드(제목 "주소 변환 — 엑셀로 받기", 이름 칸 없음, [지도에 올리기로 돌아가기])가 되고, 끝나면 `MyMapConvertResultDialog`(이 창도 이제 바깥 클릭으로 안 닫힘 — X·[닫기]만). `DeliveryChoice`(결과 받는 방법 라디오)는 삭제.
- **SHP**: 서버(`UserMapUploadService.uploadShp`)는 확장자별 **마지막 파일**만 쓰므로 화면이 **항상 한 벌만** 보낸다(`pick.group.files`: shp·dbf·shx·prj 순). 필수는 **.shp + .dbf**(둘 중 하나가 없으면 서버가 `INVALID_SHP_FILE`), **.shx·.prj는 선택**(서버가 null 검사 후 있을 때만 저장) — 그래서 .shx 없음은 막지 않고 "없어도 시도는 합니다" 주황 경고만(GeoTools가 .shx 없는 .shp를 실제로 끝까지 읽는지는 실제 업로드로 확인하지 않았다 — 로컬 DB가 운영 DB). 이름이 다른 두 벌은 묶음 고르기 라디오, a.shp + b.dbf는 이름 불일치로 막음, 합계가 `quota.maxShpMb`를 넘으면 보내기 전에 막음, .cpg·.sbn·.qix·.shp.xml 같은 동반 파일은 오류 없이 "쓰지 않음(빼고 올림)". 부족한 파일은 더 놓으면 **합친다**(같은 이름은 새 것으로, 엑셀이 섞이면 통째로 바꿈). zip은 지원하지 않는다("압축을 풀어서 올려 주세요" 안내만 — 서버가 zip을 안 받고 프론트 풀기는 이번에 안 넣음).
- 성공하면 **`onUploaded(result)` → `onClose()` 순서**(창이 이미 X로 닫혔으면 `onUploaded`만 — 닫은 뒤 다시 연 새 창을 늦은 응답이 닫는 일 방지). `MyMapSource.uploadShp`가 `Promise<void | MyMapConfirmResult>`가 되어 REST 어댑터가 응답 `{id}`를 돌려주고(옛 서버·memory 어댑터는 그대로), 패널 `fetchList`는 이미 `result?.id`를 먼저 본다 → SHP도 목록 비교 없이 "방금 올린 레이어"로 잡힌다(id가 없을 때만 지난 M1 규칙의 목록 비교).
- **패널에 파일 끌어 놓기**(`ui/panels/MyMapPanel`): 패널 위로 파일을 끌면 덮개 "놓으면 업로드 창이 열립니다", 놓으면 `MyMapUploadModal initialFiles`(폴더는 패널이 `filesFromDataTransfer`로 펼침)가 채워진 채 열려 바로 판별한다. 업로드 불가 소스·다른 창이 열려 있으면 받지 않고(브라우저가 파일을 여는 것만 막음), 한도 가득이면 덮개에 "레이어가 가득 찼습니다(n/m)"만. **창은 패널 DOM 안에 그려지므로 `useFileDrop` 네 핸들러(dragenter·over·leave·drop)는 파일 끌기일 때 전파를 멈춘다**(안 그러면 패널 훅이 창이 정한 dropEffect를 none으로 덮어써 브라우저가 drop을 취소한다), 패널은 창이 열리거나 닫힐 때 `reset()`으로 덮개 계수를 0으로. 덮개가 꺼진 평상시 패널 HTML은 이전과 같다(패널 루트는 끌고 있는 동안만 인라인 `position: relative`). 지도 캔버스에는 끌어 놓기를 넣지 않았다. 닫히면 열기 전 포커스(없으면 패널의 업로드 단추)로 돌려준다.
- 접근성·CSS: `role="dialog" aria-modal aria-labelledby aria-describedby`·포커스 가두기(`focusTrap.ts`)·첫 포커스(드롭 영역, 채워 열렸으면 제목)·aria-live 한 곳·오류 `role="alert"`·비활성 단추는 진짜 `disabled` + 바닥줄 문장을 `aria-describedby`로. 새 CSS는 `gm-upload__*`(`.gm-upload-modal`을 앞에 붙여 리셋 특이도를 이김), 색은 의미 토큰만(작은 글 `--gm-text-muted`, 오류 `--gm-danger-text`, 주황 글 `--gm-orange-text` — 새 토큰·다크 선택자 없음). 옛 `gm-wizard__steps/step/cards/card*/file*/link/modes/mode*/recommend`·`gm-upload-modal__drop`은 지웠고, 내보내기 창이 쓰는 `gm-delivery*`·변환 결과 창이 쓰는 `gm-wizard__footer/submit/back/table/banner`는 남겼다. 알려진 예외: 주 단추(흰 글 on #f26722)는 대비 3.1:1 — 패키지 전체 브랜드 단추와 같아 이번엔 안 바꿈.
- 기록·시험: `_workspace/mymap-upload-redesign/`(설계 `01_design.md`·목업 `mockups/compare.html`, 구현 `02_impl.md`, 시험 `check/run-check.mjs` — 판별·추천·바닥줄·문구·폴더·훅·화면 서버 렌더·소스 계약·HEAD HTML 비교·변이 시험).

## 프론트 구조

- 좌표계: GTProject 뷰는 EPSG:3857(코어 기본값, `config.view.projection`으로 5179·5186 뷰 가능). 서버와 주고받는 GeoJSON·범위는 EPSG:4326.
  EPSG:5186·5179·5185·5187·5188은 `core/projection.ts`가 proj4로 등록(호스트에 없을 때만). 면적·거리는 geometry의 **실제 좌표계**(=뷰 좌표계)를 `projection`에 넣는다.
  알려진 예외: `ui/statusbar/MapStatusBar`는 원본을 3857로 고정해 둔다(비-3857 뷰 호스트에서는 상태바 값이 틀림 — 후속 과제).
- 엔진 = `GisMap`: `tools`(ToolManager)·`draw`·`layers`(LayerTreeController — 트리·가시성·투명도·배경지도·펼침)·`raster`(GeoTIFF)·`vector`(나만의지도)·
  `parcel`·`region` + 플러그인(`wind`). `clearAll()`은 그리기·측정·반경·필지·플러그인 `clear()`를 정리하고 GeoTIFF/나만의지도는 남긴다.
- 큰 나만의지도(10만 피처): `config.myMap`(`loadChunkMs`·`cluster`) — 피처 변환을 `runChunked`로 나눠 하고(`loadProgress`), 화면 안 피처가 많으면 본 레이어를 숨기고 격자 묶음 레이어(`core/overlays/myMapCluster.ts`, className `ol-layer gm-hl-mymap-cluster`)를 덧붙인다. 본 레이어·소스·`getOlLayer`는 그대로(묶음 모드에서 `getVisible()` false → `displayMode(id)`), 속성 표는 켜진 레이어면 `featuresInOrder(id)`를 재사용한다.
- 화면 분할(2·3·4분할, 지도마다 레이어 따로): `ui/shell/MapShell`의 `split` prop(기본 꺼짐 — 안 주면 이전과 DOM까지 같다). 지도 하나 = 엔진 하나라 엔진은 거의 그대로고,
  `react/split/GisMapSplitProvider`가 2~4번 엔진을 소유하며 **활성 지도를 위젯들의 "가장 가까운 Provider 엔진"으로 바꿔 끼운다**(그래서 레이어 패널·검색·도구 모음 같은 기존 위젯이 활성 지도에만 적용된다).
  `GisMapProvider`의 `setup(map, info)`는 지도마다 불리므로 **바람 플러그인·페이지 이동 간 기억 복원은 `info.pane === 0`에서만** 한다(`_gtp/gtpMap.tsx`·`app/demo`의 `setupDemoMap`이 예). 레이어 트리는 한 번만 받아 `layers.setTree`로 나눠 쓴다.
  화면 연동은 `core/split/linkViews`(React 없음, UMD `GisMap.linkViews`), 칸 폭 계산·격자 선택은 `ui/split/layout.ts`(순수 함수). 도구 모음·상태바는 화면에 하나. `attachTo`(붙이기) 모드는 분할 미지원.
  투어·패널이 셸을 다시 마운트하는 화면(`/demo`)은 셸 바깥에 `GisMapSplitProvider`를 둬서 지도를 셸 밖에서 소유한다. 기록: `_workspace/map-split/`.
- 레이어 트리: `LayerGroupDef`(중첩) > `LayerDef`. `flattenGroupLayers()`로 잎 레이어를 모은다. 나만의지도는 트리에 얹지 않고 `vector` 오버레이로 관리.
- 붙이기(attach): 엔진이 붙인 레이어·interaction·overlay·control·리스너만 추적·해제하고 호스트의 target·View·기존 레이어는 건드리지 않는다.
  attach UMD는 ol을 싣지 않고 전역 `ol` 하나만 바깥 모듈로 쓴다(가상 모듈 `olPath`/`olMember`, `vite.config.ts`). 최소 ol 7.1(`checkOl`, `COMPATIBILITY.md`).
- CSS: (a) `gis-map.css`의 ol.css는 `.gm-root` 안으로 한정 → 엔진 지도 요소에 `gm-root` 필수. 호스트가 `--gm-*`·위젯 모양을 덮으려면 패키지 CSS **뒤**, `@layer` 밖.
  GTProject는 `app/globals.css`가 `ol/ol.css` 다음에 패키지 CSS 두 개를 상대 경로로 import한다.

- 예제: `examples/standalone.html`(vite 개발 서버 전용) · `examples/jsp/{map,attach}.jsp`(JSTL 실연동 틀) · **`examples/gis-demo/`**(서버 없이 열리는 정적 예제 원본 — `index/create/attach.html`·`demo-data.js`(ES5, 설정 두 줄 `DEMO_BASEMAP`·`VWORLD_KEY` + 화면 조각, 데이터는 없다)·`demo.css`·`README.txt`).
  `npm run build:gis-demo`(`frontend/scripts/build-gis-demo.mjs [--copy-to <dir>]`)가 UMD 산출물이 없거나 오래됐으면 스스로 vite build 두 번을 돌리고 `dist/gis-demo/`(+`lib/`·생성한 `map.jsp`)를 조립한다. 조립 뒤 이식성 검사(최상위 html·js·jsp에 서버 경로·절대 경로·`fetch`·`type="module"`·허용 목록 밖 외부 주소·없는 상대 파일)를 하며 위반이면 빌드가 실패한다. 이 폴더는 상대 경로만 쓰고 서버 호출 0이어야 한다(`file://`로도 열림).

## 백엔드 지도 도메인

- 5개 도메인(`map`·`mymap`·`geoserver`·`geotiff`·`wind`)은 다른 도메인을, 서로도 import하지 않는다(감사 13번 실패). 공통은 `global/` 조각만:
  `global/response/ApiResponse`, `global/exception/{CustomException, BaseErrorCode}`, `global/gis/{GisErrorCode, GisUserContext}` + 구현 `SecurityContextGisUserContext`.
- GeoServer 관리 도구는 연결 정보를 사용자가 입력하는 범용 도구다(서버 메모리 번호표). 접속 정보를 설정에서 읽지 않고, 외부 호출은 `GeoServerHttp`만 지난다(주소 검사·리다이렉트 금지·시간/크기 제한). 이름에 점(`.`)이 있으면 GeoServer REST가 확장자로 잘라 읽을 수 있어 레이어 그룹 수정·삭제를 막는다.
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
- 바람길은 기상청 LDAPS 데이터(`KMA_API_KEY`)를 하루 4회 발표(KST 03·09·15·21시)분으로 가져온다. 발표 후 자료가 올라오기까지 시간이 걸려서 **매시 30분**에 갱신을 시도하고, 예보 9시간(`wind.forecast-hours`) 프레임이 다 모인 "완전한 사이클"만 최신으로 보고 더 오래된 사이클을 지운다. 기온·습도 스칼라는 `wind.fields: temp,humi`로 켜고 끈다(비우면 호출 0) — 완전 사이클 판정에는 쓰지 않고, 같은 키가 연속 3회 실패하면 서버를 다시 띄울 때까지 포기한다. `/api/wind/refresh`는 SUPER_ADMIN·MAP_ADMIN만. `grib2json` 의존성은 남아 있지만 쓰지 않는다.

## 함정 (실제로 겪은 것)

- **참조 안정성.** 의존성 배열·Provider prop에 들어가는 함수·객체는 렌더마다 새로 만들지 않는다. 옛 `useAuthHeaders`가 매 렌더 새 함수를 돌려줘
  패널을 열면 3초에 `/api/mymap` 58번·`/api/geotiff` 120번 호출했다. 반환 함수는 `useCallback`, 객체는 `useMemo`, 설정·패널 목록은 모듈 상수
  (`_gtp/gtpMap.tsx`처럼). host 객체는 값이 바뀔 때만 새로. **화면으로는 안 드러난다** — 요청 수를 센다.
- **효과 실행 순서.** React는 자식 effect를 부모 effect보다 먼저 실행한다. 부모가 `useEffect`에서 인증 getter를 등록하는 방식(옛 `mapAuthBridge`)은
  자식의 첫 요청이 역할·토큰 없이 나가는 경쟁을 만들었다. 첫 호출 전에 필요한 값은 렌더 시점에 넘기는 getter(`GisMapHost`)로 주입한다.
- **StrictMode 요청 수는 2배가 정상.** 개발 모드에서 패널 마운트 요청은 정확히 2번(TIFF `/api/geotiff` 2, 나만의지도 `/api/mymap` 2,
  진입 `tree/permission/{role}` 2·`user-access` 2), 열어 둔 뒤 증가 0, `/api/wind` 0. 셀 때는 `fetch`를 감싸 **시작 시점**에 센다 —
  `performance.getEntriesByType('resource')`는 취소된 요청을 빼서 1로 보인다.
- **`GET /api/wind/latest`를 로컬에서 부르지 않는다(검증 목적 포함).** 원격 운영 DB에서 프레임 하나를 읽어 한 건 약 115초,
  요청이 겹치면 백엔드가 `OutOfMemoryError`로 멈춘다(복구는 재시작). 바람지도 탭(패널)은 `/frames` → `/frames/{id}`(+`/fields/{id}`)를 써서 프레임 한 장만 받으므로 짧게 켜 보는 것은 가능하지만, 로컬 DB가 운영 DB라는 점은 그대로다(`POST /refresh`는 운영 DB를 쓰니 부르지 않는다). 바람길은 앱 기억에도 넣지 않는다(켠 채 돌아오면 곧바로 재요청).
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
