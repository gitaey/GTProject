# gis-map attach 번들 — OpenLayers 버전 호환 표

`dist/gis-map.attach.umd.js`(ol을 번들에 넣지 않고 페이지의 전역 `ol`을 쓰는 번들)가 업무 화면의 ol 버전별로 동작하는지 정리한 표다.
(a) 번들(`gis-map.umd.js`)은 ol 9.2.4를 안에 갖고 있어 페이지의 ol 버전과 상관없다.

- 결론: **ol 7.1 이상 ~ 10.x 지원**(시험: 7.1.0·7.5.2·8.2.0·9.2.4·10.10.0 공식 full build 전부 통과). 엔진 코드는 버전별 분기 없이 같다.
- 6.x·7.0: `GisMap.checkOl()`이 `ok:false, belowMinimum:true`, `GisMap.attach()`가 `GisOlCompatError("ol 7.1.0 이상이 필요하다(현재 …)")`로 막는다.
  기능 문제는 아니다 — 공식 6.15.1·7.0.0 full build에서도 버전 검사만 건너뛰면 엔진 코드 변경 없이 전 항목 통과(아래 "6.x 판단").
- 코드의 값: `MIN_OL_VERSION = '7.1.0'`, `TESTED_OL_MAX = '10.10'`(`src/core/olCompat.ts`). `checkOl().testedRange`는 7.1.0 ≤ 버전 ≤ 10.10.x이면 true.

## 시험 방법

실제 Chrome(headless)에서, 업무 화면을 흉내 낸 페이지가 그 버전의 공식 `ol/dist/ol.js`·`ol/ol.css`(npm `ol@<버전>`)를 불러와 직접 `new ol.Map`을 만든다
(기본 컨트롤 + 축척 막대, 기본 interaction + 꺼 둔 Select, 타일 레이어·벡터 레이어 각 1, overlay 1, click·moveend 리스너, ol.css 뒤에 업무 테마 CSS).
그 뒤 `gis-map.attach.css`·`gis-map.attach.umd.js`를 붙여 같은 시나리오를 돈다. 마우스 조작은 CDP 실제 입력, 바깥 타일은 가짜 PNG(네트워크 0).
구현자 시험과 QA 독립 시험(다른 러너, 버전마다 28~30항목)이 같은 결론을 냈다. 자동 시험 러너는 GTProject 개발 환경의 **저장소 밖 시험 기록**에만 있고
공개 저장소·이 패키지에는 넣지 않았다 — 다른 환경에서는 맨 아래 "다른 버전을 시험하려면"의 수동 절차로 확인한다.

## 표

| 항목 | 7.1.0 | 7.5.2 | 8.2.0 | 9.2.4 | 10.10.0 | 6.15.1 ※ | 7.0.0 ※ |
|---|---|---|---|---|---|---|---|
| 번들 로드, 새 전역 = `GisMap`(+호스트 `ol`) | 통과 | 통과 | 통과 | 통과 | 통과 | 통과 | 통과 |
| `checkOl()` | ok · version `'latest'` | ok | ok | ok | ok | **막음**(belowMinimum, 없는 API 0) | **막음**(belowMinimum, 없는 API 0) |
| attach.css 넣기 전후 호스트 지도 DOM 계산 스타일 변화(24요소·약 11,700값) | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| 레이어: XYZ 타일 · WMS 이미지 · WFS 벡터(피처 3) | 통과 | 통과 | 통과 | 통과 | 통과 | 통과(우회) | 통과(우회) |
| 그리기 점·선·면·원·사각형·텍스트 + 선택 | 통과 | 통과 | 통과 | 통과 | 통과 | 통과(우회) | 통과(우회) |
| 측정(같은 클릭 → 같은 값): 거리 · 면적 · 반경 드래그 · 반경 500 m | 852 m · 116,118 m² · 305 m · 500 m | 같음 | 같음 | 같음 | 같음 | 같음(우회) | 같음(우회) |
| 측정 툴팁이 호스트 viewport 안, 커서 안내·텍스트 입력이 호스트 target 안 | 통과 | 통과 | 통과 | 통과 | 통과 | 통과(우회) | 통과(우회) |
| 필지 강조(zIndex 옵션) · 지역명 | 통과 | 통과 | 통과 | 통과 | 통과 | 통과(우회) | 통과(우회) |
| 엔진 DOM 계산 스타일 = (a) 번들 `.gm-root` 안(12요소·33속성) | 같음 | 같음 | 같음 | 같음 | 같음 | 같음(우회) | 같음(우회) |
| `clearAll` | 통과 | 통과 | 통과 | 통과 | 통과 | 통과(우회) | 통과(우회) |
| `destroy` 원복 17항목(레이어 수·순서·인스턴스, interaction, control, overlay, 지도·뷰·컬렉션·호스트 레이어 리스너, target 안 요소 리스너, document·window 리스너, target·viewport 자식, 지도 속성, 뷰 상태, 엔진 DOM) | 같음 | 같음 | 같음 | 같음 | 같음 | 같음(우회) | 같음(우회) |
| destroy 뒤 타이머·인터벌·rAF = 붙이기 전 | 같음 | 같음 | 같음 | 같음 | 같음 | 같음(우회) | 같음(우회) |
| destroy 뒤 호스트 click 리스너·드래그 이동 | 동작 | 동작 | 동작 | 동작 | 동작 | 동작(우회) | 동작(우회) |
| 같은 지도에 다시 붙였다 떼기(도구 켠 채) | 원복 | 원복 | 원복 | 원복 | 원복 | 원복(우회) | 원복(우회) |
| 바람길 플러그인 | 설치·제거만 | 설치·제거만 | 설치·제거만 | 설치·제거만 | 설치·제거만 | 설치·제거만 | 설치·제거만 |
| 콘솔 예외·error·warning, 실패 요청 | 0 | 0 | 0 | 0 | 0 ※2 | 0 | 0 |

※ 6.15.1·7.0.0: npm 패키지에는 full build(`dist/ol.js`)가 없다(7.1.0부터 있음). 공식 full build는 **GitHub 릴리스 자산**으로 배포된다
(`v6.15.1-dist.zip`, `v7.0.0-legacy.zip` — 각 `ol.util.VERSION`이 "6.15.1"·"7.0.0"). QA가 이 공식 배포본으로 시험했고, 구현자는 같은 패키지의 ES 모듈로 만든
합성 full build로 시험했다(합성 빌드가 공식 빌드의 키를 모두 포함함도 확인). 두 시험 모두 결과가 같다.
"우회" = `ol.util.VERSION`을 7.1.0 이상처럼 바꿔 `checkOl`의 버전 검사만 건너뛰고 기능을 돌린 결과다.

※2 10.10.0: 선택(Select) 도구로 클릭하면 Chrome 경고 1개("Canvas2D: Multiple readback operations using getImageData … willReadFrequently")가 난다.
엔진 없이 업무 지도의 Select만으로도 똑같이 나는 OL 10의 히트 검사 경고라 엔진과 무관하다(9.2.4 이하는 0). 오류·예외·실패 요청은 0이다.

**6.x 판단 — 최소 지원 버전은 7.1로 유지(차단).** API가 없어서가 아니다: 공식 6.15.1·7.0.0 full build에서 필요한 API 51개가 전부 있고,
버전 검사만 건너뛰면 엔진 코드 변경 없이 위 항목(측정값·destroy 원복·CSS 영향 0·콘솔 0 포함)이 전부 통과했다.
그래도 7.1로 두는 것은 지원 범위를 어디까지 보장할지의 결정이다(설계자·사용자 몫). 시험하지 않은 것: 6.5~6.14 등 다른 6.x 마이너, 바람길 표시.
6.15를 열려면 `src/core/olCompat.ts`의 `MIN_OL_VERSION`을 `'6.15.0'`으로 바꾸고(코드 한 줄) 이 표와 `examples/jsp/README.md` 6절을 고친다.

## 9.2.4에서만 더 본 것

| 경우 | 결과 |
|---|---|
| EPSG:5186 뷰(업무 화면이 proj4로 등록) · EPSG:4326 뷰 | attach 성공, `flyTo(127.1, 37.4)` 정확, 그린 면의 GeoJSON이 경위도, 면적 툴팁 = 같은 링의 구면 면적(1% 안) |
| 뷰 좌표계 객체만 있고 경위도 변환이 없음(proj4도 모르는 코드) | attach가 "…EPSG:4326으로 바꾸는 변환이 등록돼 있지 않다" 오류, 지도에 아무것도 안 붙음(단 아래 "좌표계 목록에 남는 것"의 등록은 검사보다 먼저라 이미 일어난 뒤). `projections` 옵션으로 정의를 주면 변환만 더해져(객체 그대로) 정상 |
| 전역 ol 없음 / ol.js를 번들 뒤에 불러옴 | 번들은 오류 없이 뜸, `checkOl().ok` false(없는 API 51), attach "전역 ol을 찾지 못했다 — … 먼저 불러온다" |
| target 없는 지도에 먼저 붙이고 나중에 `setTarget` | 측정 툴팁 동작 |
| 잘못된 인자 / 두 번 붙이기 | "ol.Map 인스턴스가 아니다" / "이미 엔진이 붙어 있다" |
| 한 페이지 호스트 지도 2개에 각각 붙이기 | 도구 상태 독립, 떼면 둘 다 원복 |
| 좌표계 목록에 남는 것 | 기본값: 5186·5179와 proj4 내장 정의(UTM 326xx 등)가 업무 ol 좌표계 목록에 더해지고 destroy 뒤에도 남는다. `projections: false`면 목록·`ol.proj.proj4.isRegistered()` 그대로 |
| AMD 로더(RequireJS 2.3.7) | `define('ol', …)` + `require(['gis-map-attach'])`로 붙였다 떼기(README 7절) |

## 엔진이 쓰는 ol API

`checkOl`이 검사하는 목록 = `src/core/olCompat.ts`의 `REQUIRED_OL_API`(51개). attach 번들이 실제로 읽는 전역 경로와 1:1이다
(빌드 결과를 파싱해 대조: 번들의 `ol` 모듈 경로 26개 + 이름 내보내기 34개 = 소스의 값 import, 차이 0). 클래스 `Map`·`Feature`·`Overlay`·
`layer.{Tile,Vector,Image,Layer}`·`source.{Vector,XYZ,ImageWMS}`·`format.GeoJSON`·`interaction.{Draw,Modify,Select}`·`geom.{Point,LineString,Polygon}`·
`style.{Style,Fill,Stroke,Circle,Icon,Text}`·`renderer.canvas.Layer`, 함수 `interaction.Draw.createBox`·`geom.Polygon.{fromCircle,circular}`·`proj.*`(9)·
`proj.proj4.register`·`sphere.{getArea,getLength}`·`extent.*`(6)·`transform.*`(5)·`loadingstrategy.bbox`·`events.condition.click`. `View`는 엔진이 지도를
만들 때(`createGisMap`)만 쓰므로 attach 목록에 없다.

## 다른 버전을 시험하려면

1. 그 버전의 공식 full build `ol.js`·`ol.css`를 받는다 — 7.1.0 이상은 npm `ol@<버전>`의 `dist/ol.js`·`ol.css`, 그 아래는 GitHub 릴리스 자산(`v<버전>-dist.zip` 등).
2. `npm run build:gis-umd`로 `dist/`를 만들고, `examples/jsp/attach.html` 사본에서 ol.js·ol.css 경로를 받은 파일로 바꿔 연다.
3. 화면 왼쪽 위 `checkOl` 결과(7.1 미만이면 막힘이 정상), 붙이기 → 도구 10종(그리기·측정·반경·텍스트) → 떼기 뒤 기록 칸의 "레이어 · interaction · control · overlay" 수가
   붙이기 전과 같은지, 콘솔 오류 0을 본다. 7.1 미만을 시험하려면 붙이기 전에 콘솔에서 `ol.util.VERSION`을 7.1.0 이상 값으로 바꾼다(버전 검사만 건너뜀).
4. 통과하면 이 표와 `TESTED_OL_MAX`(`src/core/olCompat.ts`)를 고친다. 최소 버전을 바꿀 때는 `MIN_OL_VERSION`도.
