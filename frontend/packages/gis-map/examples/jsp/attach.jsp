<%@ page contentType="text/html; charset=UTF-8" pageEncoding="UTF-8" %>
<%@ taglib prefix="c" uri="http://java.sun.com/jsp/jstl/core" %>
<%--
  gis-map attach 번들(b) 예제 — 업무 화면이 원래 가진 OL 지도(전역 ol)에 엔진을 붙인다. 화면은 같은 폴더 attach.html과 같다.
  준비: dist/gis-map.attach.umd.js, dist/gis-map.attach.css(+ gis-map.attach.THIRD-PARTY-NOTICES.txt)를 webapp/resources/gis-map/<버전>/ 에 복사(README 6절).
        ol은 업무 프로젝트가 원래 쓰던 공식 full build(ol.js·ol.css, 7.1 이상)를 그대로 쓴다. 아래 경로는 예시다.
  Jakarta EE 10(Tomcat 10.1+, JSTL 3.0)이면 taglib uri를 "jakarta.tags.core"로 바꾼다.

  아래 ${...} 값은 전부 자리표시자다. 컨트롤러가 모델에 넣는다(키·주소를 이 파일에 직접 쓰지 않는다):
    gisVworldKey   VWorld 키(서버 설정/환경 변수에서 읽어 모델에 넣는다. 도메인 제한 키 권장). 비면 배경지도를 OpenStreetMap으로
    gisApiBase     짝 백엔드 REST base. 비면 contextPath
    gisProxyBase   VWorld·WFS 프록시 base. 비면 contextPath + "/gis/proxy"
    gisUserId, gisUserRole  로그인 사용자(없으면 빈 값)
  주의: 스크립트 블록 안에 ${...}를 쓰지 않는다 — JSP가 JS 템플릿 문자열의 ${}까지 EL로 먼저 바꾼다(README 8절). 서버 값은 data- 속성으로만 넘긴다.
--%>
<c:set var="ctx" value="${pageContext.request.contextPath}"/>
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
<title>지도(기존 지도에 붙이기)</title>
<%-- 주소는 <c:url> 대신 contextPath + 경로로 만든다(<c:url>은 첫 요청에 ;jsessionid=…를 붙인다 — README 2절) --%>
<link rel="stylesheet" href="<c:out value='${ctx}'/>/resources/ol/9.2.4/ol.css">
<%-- 엔진 CSS: ol.css가 들어 있지 않고, 엔진이 그리는 DOM에만 걸린다(호스트 지도 모양 그대로). 호스트 지도에 gm-root를 붙일 필요 없다 --%>
<link rel="stylesheet" href="<c:out value='${ctx}'/>/resources/gis-map/0.1.0/gis-map.attach.css">
<style>
    html, body { margin: 0; height: 100%; }
    body { font-family: "Malgun Gothic", sans-serif; font-size: 14px; }
    .demo { display: flex; height: 100%; }
    .demo-side { width: 280px; flex: none; overflow: auto; padding: 12px; border-right: 1px solid #ddd; box-sizing: border-box; background: #fafafa; }
    .demo-side button { margin: 0 4px 4px 0; padding: 4px 8px; border: 1px solid #bbb; background: #fff; border-radius: 3px; cursor: pointer; font-size: 12px; }
    .demo-side button.is-on { background: #f26722; border-color: #f26722; color: #fff; }
    .demo-side ul { list-style: none; margin: 0; padding-left: 0; }
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
    <%-- 서버 값은 data- 속성으로(c:out이 HTML 이스케이프) --%>
    <div id="map" class="demo-map"
         data-api-base="<c:out value='${apiBase}'/>"
         data-proxy-base="<c:out value='${proxyBase}'/>"
         data-login-url="<c:out value='${ctx}'/>/login"
         data-vworld-key="<c:out value='${gisVworldKey}'/>"
         data-user-id="<c:out value='${gisUserId}'/>"
         data-user-role="<c:out value='${gisUserRole}'/>"></div>
</div>

<script src="<c:out value='${ctx}'/>/resources/ol/9.2.4/ol.js"></script>
<script>
// ───── 업무 화면이 원래 가진 지도(엔진과 무관한 업무 코드 자리) ─────
(function () {
    'use strict';
    var el = document.getElementById('map');
    var key = el.getAttribute('data-vworld-key');
    var base = key
        ? new ol.layer.Tile({ source: new ol.source.XYZ({ url: 'https://api.vworld.kr/req/wmts/1.0.0/' + encodeURIComponent(key) + '/Base/{z}/{y}/{x}.png' }) })
        : new ol.layer.Tile({ source: new ol.source.OSM() });   // OSM 저작자 표시는 기본 Attribution 컨트롤이 그린다
    window.workMap = new ol.Map({
        target: el,
        layers: [base],
        view: new ol.View({ center: ol.proj.fromLonLat([127.0276, 37.4979]), zoom: 15 })
    });
})();
</script>

<%-- attach 번들은 ol.js 뒤에(불러오는 순간의 전역 ol을 쓴다) --%>
<script src="<c:out value='${ctx}'/>/resources/gis-map/0.1.0/gis-map.attach.umd.js"></script>
<script>
(function () {
    'use strict';
    var el = document.getElementById('map');
    function meta(name) { var m = document.querySelector('meta[name="' + name + '"]'); return m ? m.getAttribute('content') : ''; }

    var report = GisMap.checkOl();
    if (!report.ok) {   // 업무 화면은 지도를 그대로 쓰고, 엔진 기능만 끈다
        if (window.console) console.error('[gis-map] 이 화면의 ol에는 붙일 수 없다', report);
        return;
    }
    var gis = GisMap.attach(window.workMap, {
        host: {
            http: {
                credentials: 'same-origin',
                getHeaders: function () {
                    var h = {};
                    var name = meta('_csrf_header'), token = meta('_csrf');
                    if (name && token) h[name] = token;
                    return h;
                },
                onUnauthorized: function () { location.href = el.getAttribute('data-login-url'); }
            },
            endpoints: { apiBaseUrl: el.getAttribute('data-api-base'), proxyBaseUrl: el.getAttribute('data-proxy-base'), geoserverUrl: '' },
            keys: { vworld: el.getAttribute('data-vworld-key') },
            getCurrentUser: function () {
                var id = el.getAttribute('data-user-id');
                return id ? { userId: id, role: el.getAttribute('data-user-role') || '' } : null;
            }
        },
        sources: [GisMap.adapters.rest(), GisMap.adapters.proxy()],
        // 업무 지도의 레이어 zIndex 체계와 겹치지 않게 엔진 도구·강조 레이어를 위로
        zIndex: { tools: 900, parcel: 950 }
    });

    document.getElementById('tools').onclick = function (e) {
        var t = e.target && e.target.getAttribute && e.target.getAttribute('data-tool');
        if (t) gis.tools.activate(t);
    };
    document.getElementById('btnClear').onclick = function () { gis.clearAll(); };
    gis.tools.store.subscribe(function (s) {
        var btns = document.querySelectorAll('#tools [data-tool]');
        for (var i = 0; i < btns.length; i++) btns[i].className = btns[i].getAttribute('data-tool') === s.activeTool ? 'is-on' : '';
    });
    function render() {
        var box = document.getElementById('tree');
        var s = gis.layers.store.getState();
        box.innerHTML = '';
        if (!s.tree) { box.textContent = s.error ? '불러오기 실패: ' + s.error : '레이어 불러오는 중'; return; }
        var ul = document.createElement('ul');
        var layers = gis.layers.allLayers();
        for (var i = 0; i < layers.length; i++) {
            (function (layer) {
                var li = document.createElement('li');
                var cb = document.createElement('input');
                cb.type = 'checkbox';
                cb.checked = gis.layers.isVisible(layer);
                cb.onchange = function () { gis.layers.toggleLayer(layer.id); };
                li.appendChild(cb);
                li.appendChild(document.createTextNode(' ' + layer.name));
                ul.appendChild(li);
            })(layers[i]);
        }
        box.appendChild(ul);
    }
    gis.layers.store.subscribe(render);
    render();

    // 정리: 문서 전체를 떠날 때만(e.persisted = 뒤로 가기 캐시에 얼림 → 정리하지 않는다. map.jsp와 같은 이유).
    // 부분 화면 교체(ajax로 지도 영역만 바꾸기)라면 교체 직전에 gis.destroy()를 직접 부른다 — 업무 지도는 그대로 남고 엔진이 붙인 것만 떨어진다.
    window.addEventListener('pagehide', function (e) { if (!e.persisted) gis.destroy(); });
})();
</script>
</body>
</html>
