gis-map 정적 예제 폴더 (gis-demo)
================================

※ 이 파일이 있는 원본 폴더(packages/gis-map/examples/gis-demo)에서는 열리지 않습니다 — lib/ 가 없습니다.
   저장소의 frontend/ 에서 `npm run build:gis-demo` 를 실행한 뒤, 만들어진 packages/gis-map/dist/gis-demo/ 를 여세요.
   (웹 데모 서버에서는 /demo/umd/index.html 로 같은 완성본이 열립니다. 폴더 주소만으로는 안 열립니다 — 파일 이름까지.)

무엇인가
--------
OpenLayers 지도 엔진(@gtp/gis-map)을 JSP·정적 화면에 붙이는 예제입니다. 서버 프로그램(Spring·Node·Next) 없이 정적 파일만으로 동작하고
(데이터는 전부 가상 샘플, 우리 서버 호출 0), 바깥으로 나가는 것은 배경 지도 타일뿐입니다.

  index.html   예제 목록, 복사 방법, ol 호환 표 요약, 고지
  create.html  UMD (a) GisMap.create — 엔진이 지도를 만든다(번들에 ol 9.2.4 포함)
  attach.html  UMD (b) GisMap.attach — 업무 화면이 만든 ol 지도에 엔진을 붙였다 뗀다(checkOl 결과 표시)
  map.jsp      create.html + JSP 지시자 한 줄 (빌드가 만든다 — 직접 고치지 마세요)
  demo-data.js 설정 두 줄(배경지도·VWorld 키) + 두 예제가 같이 쓰는 화면 조각
  demo.css     예제 페이지 모양(지도 모듈 CSS 아님)
  lib/         번들·CSS·라이선스 고지·ol(attach 예제용)

열기
----
- 권장: http. 톰캣 정적 폴더, `npx http-server`, nginx 등.
- file:// 더블클릭: 동작합니다(지도·도구·가짜 데이터·PNG/PDF 저장). 배경을 VWorld로 바꿨다면 동작하지 않습니다(도메인 키).
- 데이터는 .js 파일입니다(.geojson·fetch 안 씀) — file:// 와 톰캣 기본 MIME 표만으로 충분합니다.

복사해서 쓰기 (JDK 11 톰캣·전자정부)
-------------------------------------
1) 폴더째 webapp/gis-demo/ (WEB-INF 밖)에 복사합니다. 경로는 전부 상대 경로라 컨텍스트 경로와 무관합니다.
2) 열기: /<컨텍스트>/gis-demo/index.html 또는 map.jsp
3) 스프링 DispatcherServlet 이 "/" 에 매핑된 앱이면 정적 파일이 디스패처로 갑니다.
   <mvc:resources mapping="/gis-demo/**" location="/gis-demo/"/> 또는 <mvc:default-servlet-handler/> 가 필요합니다.
   (전자정부 기본 *.do 매핑이면 필요 없습니다.)
4) 로그인 필터·보안 필터가 있으면 /gis-demo/** 를 허용 목록에 넣으세요.

map.jsp 는 page 지시자 한 줄(contentType·pageEncoding·isELIgnored)만 씁니다. JSTL·EL·스크립틀릿·서블릿 API 없음 —
JSP 2.0 문법이라 Tomcat 8.5·9(JDK 8+)·전자정부 3.x/4.x 컨테이너에서 해석되고, javax/jakarta 를 import 하지 않아 Tomcat 10+ 에서도 그대로입니다.
isELIgnored="true" 는 HTML·JS 안의 ${ 같은 글자가 EL 로 해석되지 않게 막습니다.
※ 이 저장소에는 서블릿 컨테이너 시험이 없어 map.jsp 를 실제 톰캣에서 실행해 보지는 못했습니다.
   같은 내용의 create.html 로 동작을 확인하세요. (실연동 틀 — CSRF·contextPath·서버 값 — 은 examples/jsp/map.jsp·attach.jsp 입니다.)

설정 바꾸기 (demo-data.js 맨 위)
--------------------------------
  var DEMO_BASEMAP = 'osm';   // 'osm' | 'vworld' | 'none'
  var VWORLD_KEY   = '';      // 'vworld' 일 때만
- 'osm'    키 없이 동작. 저작자 표시가 지도에 보입니다. OSM 타일 정책상 업무 서비스의 대량 사용은 맞지 않습니다.
- 'vworld' 그 서버 도메인으로 발급한 VWorld 키를 넣으세요. 키가 비어 있으면 배경지도를 넣지 않고 안내 문구를 기록 칸에 보입니다.
           키를 파일에 적어 저장소에 커밋하지 마세요.
- 'none'   폐쇄망. 타일 요청 0, 회색 바탕 + 샘플 레이어만 보입니다.

attach 예제로 다른 ol 버전 확인
------------------------------
lib/ol/ol.js, lib/ol/ol.css 를 업무 화면이 쓰는 판(7.1 이상)으로 바꿔 끼우고 attach.html 을 엽니다.
왼쪽 위 checkOl 줄이 통과/막음을 알려 줍니다. 시험한 버전표는 index.html 과 패키지의 COMPATIBILITY.md.

한계
----
- 데이터는 합성(시드 고정)한 가상 샘플입니다. 실제 필지·건물·시설·관측과 무관합니다.
- 영역 분석은 가상 판정입니다(서버를 부르지 않음). 실제 연동은 GisMap.adapters.proxy() 를 쓰세요.
- 나만의지도 위젯(스타일 대화상자·속성 표 등 React 위젯)은 이 폴더에 없습니다. 엔진 API(gis.vector …)만 씁니다.
- 번들은 ES2019 문법입니다(구형 IE 계열 미지원). 예제 페이지 자체는 ES5 문법입니다.

라이선스: lib/*.THIRD-PARTY-NOTICES.txt, lib/ol/LICENSE.md
