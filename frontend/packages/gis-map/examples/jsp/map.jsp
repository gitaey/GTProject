<%@ page contentType="text/html; charset=UTF-8" pageEncoding="UTF-8" %>
<%@ taglib prefix="c" uri="http://java.sun.com/jsp/jstl/core" %>
<%--
  gis-map UMD (a) 예제 — 순수 서블릿 컨테이너 JSP(Spring MVC·eGov 공통). 화면은 같은 폴더 map.html과 같다.
  준비: dist/gis-map.umd.js, dist/gis-map.css 두 파일을 webapp/resources/gis-map/<버전>/ 에 복사(README.md 1절).
  Jakarta EE 10(Tomcat 10.1+, JSTL 3.0)이면 taglib uri를 "jakarta.tags.core"로 바꾼다.

  아래 ${...} 값은 전부 자리표시자다. 컨트롤러가 모델에 넣는다(키·주소를 이 파일에 직접 쓰지 않는다):
    gisVworldKey   VWorld 키(서버 설정/환경 변수에서 읽어 모델에 넣는다. 도메인 제한 키 권장)
    gisApiBase     짝 백엔드 REST base. 같은 앱이면 빈 값 → contextPath를 쓴다
    gisProxyBase   VWorld·WFS 프록시 base(키를 숨기는 서버 프록시). 예: contextPath + "/gis/proxy"
    gisUserId, gisUserRole  로그인 사용자(없으면 빈 값)
  _csrf는 Spring Security가 넣는 요청 속성이다(CSRF를 쓰지 않으면 meta 두 줄과 getHeaders의 CSRF 부분을 지운다).
--%>
<c:set var="ctx" value="${pageContext.request.contextPath}"/>
<%-- 모델 값이 없으면 같은 앱 기준 기본값(JSP 2.0 EL만 사용 — 문자열 연결·메서드 호출 없이) --%>
<c:set var="apiBase" value="${ctx}"/>
<c:if test="${not empty gisApiBase}"><c:set var="apiBase" value="${gisApiBase}"/></c:if>
<c:set var="proxyBase" value="${ctx}/gis/proxy"/>
<c:if test="${not empty gisProxyBase}"><c:set var="proxyBase" value="${gisProxyBase}"/></c:if>
<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="icon" href="data:,">
<meta name="_csrf" content="<c:out value='${_csrf.token}'/>">
<meta name="_csrf_header" content="<c:out value='${_csrf.headerName}'/>">
<title>지도</title>
<!-- CSS는 JS가 넣어 주지 않는다 — <link>로 직접 불러온다(ol.css 포함) -->
<%-- 주소는 <c:url> 대신 contextPath + 경로로 만든다: <c:url>은 쿠키가 아직 없는 첫 요청에 ;jsessionid=…를 붙여
     세션 ID가 주소·Referer·접근 로그에 남는다(README 2절). c:out으로 한 번 더 이스케이프한다 --%>
<link rel="stylesheet" href="<c:out value='${ctx}'/>/resources/gis-map/0.1.0/gis-map.css">
<style>
    /* 업무 화면 자체의 모양(지도 모듈 CSS 아님) */
    /* 글자 크기는 body에만 준다 — html(뿌리) 글자 크기를 바꾸면 rem으로 쓴 지도 모듈 CSS(측정 툴팁 등)의 크기도 같이 바뀐다 */
    html, body { margin: 0; height: 100%; }
    body { font-family: "Malgun Gothic", sans-serif; font-size: 14px; }
    .demo { display: flex; height: 100%; }
    .demo-side { width: 280px; flex: none; overflow: auto; padding: 12px; border-right: 1px solid #ddd; box-sizing: border-box; background: #fafafa; }
    .demo-side button { margin: 0 4px 4px 0; padding: 4px 8px; border: 1px solid #bbb; background: #fff; border-radius: 3px; cursor: pointer; font-size: 12px; }
    .demo-side button.is-on { background: #f26722; border-color: #f26722; color: #fff; }
    .demo-side ul { list-style: none; margin: 0; padding-left: 14px; }
    .demo-side > section > ul { padding-left: 0; }
    .demo-map { flex: 1; position: relative; }
</style>
</head>
<body>
<div class="demo">
    <aside class="demo-side">
        <section id="tools">
            <button type="button" data-tool="draw-point">점</button><button type="button" data-tool="draw-line">선</button><button type="button" data-tool="draw-polygon">면</button><button type="button" data-tool="draw-text">텍스트</button><br>
            <button type="button" data-tool="measure-distance">거리측정</button><button type="button" data-tool="measure-area">면적측정</button><button type="button" data-tool="radius-search">반경</button><br>
            <button type="button" id="btnClear">전체 지우기</button>
        </section>
        <section id="tree">레이어 불러오는 중</section>
    </aside>
    <%-- 서버 값은 data- 속성으로 넘긴다(c:out이 HTML 이스케이프 → 값에 따옴표·꺾쇠가 있어도 스크립트가 깨지지 않는다) --%>
    <div id="map" class="gm-root demo-map"
         data-api-base="<c:out value='${apiBase}'/>"
         data-proxy-base="<c:out value='${proxyBase}'/>"
         data-login-url="<c:out value='${ctx}'/>/login"
         data-vworld-key="<c:out value='${gisVworldKey}'/>"
         data-user-id="<c:out value='${gisUserId}'/>"
         data-user-role="<c:out value='${gisUserRole}'/>"></div>
</div>

<script src="<c:out value='${ctx}'/>/resources/gis-map/0.1.0/gis-map.umd.js"></script>
<script>
(function () {
    'use strict';
    var el = document.getElementById('map');
    function meta(name) { var m = document.querySelector('meta[name="' + name + '"]'); return m ? m.getAttribute('content') : ''; }

    var map = GisMap.create({
        target: el,
        host: {
            http: {
                credentials: 'same-origin',            // 세션 쿠키(JSESSIONID)를 같이 보낸다
                getHeaders: function () {              // 요청마다 다시 읽는다(토큰이 바뀌어도 최신 값)
                    var h = {};
                    var name = meta('_csrf_header'), token = meta('_csrf');
                    if (name && token) h[name] = token;
                    // 토큰 인증이면: h['Authorization'] = 'Bearer ' + 토큰을 읽는 업무 함수();
                    return h;
                },
                onUnauthorized: function () { location.href = el.getAttribute('data-login-url'); }
            },
            endpoints: {
                apiBaseUrl: el.getAttribute('data-api-base'),
                proxyBaseUrl: el.getAttribute('data-proxy-base'),
                geoserverUrl: ''                         // GeoServer 이미지 범례를 쓰면 주소를 넣는다
            },
            keys: { vworld: el.getAttribute('data-vworld-key') },
            getCurrentUser: function () {
                var id = el.getAttribute('data-user-id');
                return id ? { userId: id, role: el.getAttribute('data-user-role') || '' } : null;
            }
        },
        // 짝 백엔드(REST: /api/layers/tree 등) + 호스트 프록시(VWorld 검색·필지·지역명·WFS·범례).
        // 응답 형식이 다른 백엔드면 { layerTree: { loadTree: function () { return Promise(LayerTree) } } } 처럼 소스 객체를 직접 준다(README 3절)
        sources: [GisMap.adapters.rest(), GisMap.adapters.proxy()],
        view: { center: [127.0276, 37.4979], zoom: 15 }
    });
    GisMap.controls.scaleLine(map);

    // 도구: 단추 → 엔진, 엔진 상태 → 단추 모양
    document.getElementById('tools').onclick = function (e) {
        var t = e.target && e.target.getAttribute && e.target.getAttribute('data-tool');
        if (t) map.tools.activate(t);
    };
    document.getElementById('btnClear').onclick = function () { map.clearAll(); };
    map.tools.store.subscribe(function (s) {
        var btns = document.querySelectorAll('#tools [data-tool]');
        for (var i = 0; i < btns.length; i++) btns[i].className = btns[i].getAttribute('data-tool') === s.activeTool ? 'is-on' : '';
    });

    // 레이어 트리: 엔진이 생성 직후 소스에서 받아 온다(layers.autoLoad 기본 true). 상태가 바뀌면 목록을 다시 그린다
    function render() {
        var box = document.getElementById('tree');
        var s = map.layers.store.getState();
        box.innerHTML = '';
        if (!s.tree) { box.textContent = s.error ? '불러오기 실패: ' + s.error : '레이어 불러오는 중'; return; }
        var ul = document.createElement('ul');
        var layers = map.layers.allLayers();
        for (var i = 0; i < layers.length; i++) {
            (function (layer) {
                var li = document.createElement('li');
                var cb = document.createElement('input');
                cb.type = 'checkbox';
                cb.checked = map.layers.isVisible(layer);
                cb.onchange = function () { map.layers.toggleLayer(layer.id); };
                li.appendChild(cb);
                li.appendChild(document.createTextNode(' ' + layer.name));
                ul.appendChild(li);
            })(layers[i]);
        }
        box.appendChild(ul);
    }
    map.layers.store.subscribe(render);
    render();

    // 정리: pagehide는 문서 전체를 떠날 때(다른 주소로 이동·새로고침·탭 닫기) 온다. 부분 화면 교체(ajax로 div만 바꾸기)에서는 오지 않으니
    // 그때는 교체 직전에 map.destroy()를 직접 부른다.
    // e.persisted = true면 브라우저가 이 문서를 뒤로 가기 캐시(bfcache)에 얼려 둔 것이다. 이때 destroy하면 뒤로 가기로 돌아왔을 때
    // 지도가 빈 화면이 되므로(문서는 그대로 복원되고 스크립트는 다시 돌지 않는다) 정리하지 않는다. 캐시에서 버려지면 문서와 함께 풀린다.
    window.addEventListener('pagehide', function (e) { if (!e.persisted) map.destroy(); });
})();
</script>
</body>
</html>
