/*
 * gis-demo 설정 + 공용 도우미 (ES5, 서버 호출 0)
 *
 * 이 파일이 하는 일
 *   1) 맨 위 설정 두 줄 — 배경지도와 VWorld 키. 지도 페이지(create.html·attach.html·map.jsp)가 모두 여기서 읽는다.
 *   2) GisDemoData.make(GisMap) — 가짜 데이터 공급원 한 벌을 만든다.
 *      데이터와 가짜 소스는 이 파일이 아니라 번들 안의 GisMap.adapters.demo(합성 데이터 생성기 + 메모리 소스, 시드 고정)가 만든다.
 *      그래서 웹 데모(/demo/map)와 이 폴더는 같은 코드를 쓰고 어긋날 수 없다. 이 파일에는 데이터가 없다.
 *   3) GisDemoData.bind(...) — 두 페이지가 같이 쓰는 화면 조각(도구 단추·레이어 목록·검색·필지 카드·영역 분석·큰 데이터·바람).
 *      업무 화면에 옮길 때는 이 파일을 버리고 자기 화면에서 엔진 API(gis.tools·gis.layers·gis.vector …)를 직접 부르면 된다.
 *
 * 이 폴더 공통 규칙: 서버 경로·절대 경로·환경 변수·데이터를 네트워크로 읽는 호출·ES 모듈을 쓰지 않는다(그래서 file:// 로 열어도 동작).
 * 빌드 스크립트(frontend/scripts/build-gis-demo.mjs)가 이 규칙을 검사하고 어기면 빌드가 실패한다.
 */

// ───── 설정 (여기만 고친다) ─────
// 배경지도: 'osm'(키 없음, 기본) | 'vworld'(이 서버 도메인으로 발급한 VWorld 키 필요) | 'none'(폐쇄망 — 타일 요청 0, 회색 바탕)
var DEMO_BASEMAP = 'osm';
// 'vworld'일 때만 쓴다. 실제 키를 파일에 적어 커밋하지 않는다(자리표시자). 키는 도메인(Referer)에 묶여 있어 file:// 에서는 동작하지 않는다
var VWORLD_KEY = '';
// 큰 나만의지도 점 개수(레이어마다 단추 하나). 작은 화면(폭 600px 이하)에서는 첫 값만 쓴다. 10만 점은 브라우저 메모리를 약 280MB 쓴다
var DEMO_BIG_COUNTS = [20000, 100000];

var GisDemoData = (function () {
    'use strict';

    function byId(id) { return document.getElementById(id); }
    function has(id) { return !!byId(id); }
    function clear(el) { while (el.firstChild) el.removeChild(el.firstChild); }
    function text(tag, str, className) {
        var el = document.createElement(tag);
        el.textContent = str;
        if (className) el.className = className;
        return el;
    }
    function fmtInt(n) { return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }
    function isSmallScreen() { return !!(window.matchMedia && window.matchMedia('(max-width: 600px)').matches); }

    /** 가짜 데이터 공급원 한 벌: { sources, config, view, basemap, notice, data } (번들의 GisMap.adapters.demo 결과 그대로). override.basemap으로 설정 값을 덮는다(attach 예제: 배경은 업무 지도 몫이라 'none') */
    function make(GisMap, override) {
        var basemap = override && override.basemap ? override.basemap : DEMO_BASEMAP;
        return GisMap.adapters.demo({
            basemap: basemap,
            vworldKey: VWORLD_KEY,
            bigCounts: isSmallScreen() ? [DEMO_BIG_COUNTS[0]] : DEMO_BIG_COUNTS
        });
    }

    // 지도에 보이는 OSM 저작자 표시(OSM 타일 이용 조건). (a) 번들은 OL 저작자 컨트롤이 없어 페이지가 직접 보인다
    function showAttribution(demo) {
        var el = byId('attrib');
        if (el) el.hidden = !(demo.basemap === 'osm');
    }

    function renderTree(gis) {
        var box = byId('tree');
        if (!box) return;
        var s = gis.layers.store.getState();
        clear(box);
        if (s.error || !s.tree) { box.appendChild(text('div', s.error ? '불러오기 실패: ' + s.error : '불러오는 중', 'demo-note')); return; }
        function list(groups, layers) {
            var ul = document.createElement('ul');
            var i;
            for (i = 0; i < groups.length; i++) {
                var li = document.createElement('li');
                li.appendChild(text('div', groups[i].name, 'demo-group'));
                li.appendChild(list(groups[i].children, groups[i].layers));
                ul.appendChild(li);
            }
            for (i = 0; i < layers.length; i++) ul.appendChild(item(layers[i]));
            return ul;
        }
        function item(layer) {
            var li = document.createElement('li');
            var label = document.createElement('label');
            var cb = document.createElement('input');
            cb.type = 'checkbox';
            cb.checked = gis.layers.isVisible(layer);
            cb.onchange = function () { gis.layers.toggleLayer(layer.id); };
            label.appendChild(cb);
            label.appendChild(document.createTextNode(' ' + layer.name));
            li.appendChild(label);
            return li;
        }
        box.appendChild(list(s.tree.groups, s.tree.ungroupedLayers));
    }

    // 나만의지도 레이어: 켜기/끄기 체크박스(엔진 API gis.vector). 큰 데이터(id 11~)는 단추로 따로
    function renderMyMaps(gis, demo, log) {
        var box = byId('mymaps');
        if (!box) return;
        clear(box);
        var ul = document.createElement('ul');
        var maps = demo.data.myMaps;
        for (var i = 0; i < maps.length; i++) {
            if (maps[i].id >= 11) continue;
            (function (m) {
                var li = document.createElement('li');
                var label = document.createElement('label');
                var cb = document.createElement('input');
                cb.type = 'checkbox';
                cb.checked = gis.vector.isVisible(m.id);
                cb.onchange = function () {
                    if (cb.checked) gis.vector.zoomTo(m.id).then(function () { log(m.name + ' 켬(' + m.featureCount + '개)'); });
                    else { gis.vector.hide(m.id); log(m.name + ' 끔'); }
                };
                label.appendChild(cb);
                label.appendChild(document.createTextNode(' ' + m.name));
                li.appendChild(label);
                ul.appendChild(li);
            })(maps[i]);
        }
        box.appendChild(ul);
    }

    function renderBigButtons(gis, demo, log) {
        var box = byId('bigButtons');
        if (!box) return;
        clear(box);
        var maps = demo.data.myMaps;
        for (var i = 0; i < maps.length; i++) {
            if (maps[i].id < 11) continue;
            (function (m) {
                var b = document.createElement('button');
                b.type = 'button';
                b.textContent = m.name;
                b.onclick = function () {
                    if (gis.vector.isVisible(m.id)) { gis.vector.hide(m.id); log(m.name + ' 끔'); return; }
                    gis.vector.zoomTo(m.id).then(function () {
                        log(m.name + ' 켬 · 표시 방식 ' + gis.vector.displayMode(m.id) + ' (cluster = 묶음, shape = 점) · 원을 누르거나 확대하면 풀립니다');
                    });
                };
                box.appendChild(b);
            })(maps[i]);
        }
    }

    function renderParcelCard(gis, GisMap) {
        var card = byId('parcelCard');
        if (!card) return;
        var s = gis.parcelInfo.store.getState();
        clear(card);
        if (!s.open) { card.hidden = true; return; }
        card.hidden = false;
        var head = document.createElement('div');
        head.className = 'demo-card-head';
        head.appendChild(text('b', '필지 정보'));
        head.appendChild(text('span', '가상', 'demo-tag'));
        var x = text('button', '닫기');
        x.type = 'button';
        x.onclick = function () { gis.parcelInfo.close(); };
        head.appendChild(x);
        card.appendChild(head);
        if (s.parcel.status === 'loading') { card.appendChild(text('div', '불러오는 중', 'demo-note')); return; }
        if (s.parcel.status !== 'ready' || !s.parcel.info) {
            card.appendChild(text('div', s.parcel.error || '이 지점에는 샘플 필지가 없습니다(시범 구역 밖).', 'demo-note'));
            return;
        }
        var i = s.parcel.info;
        var rows = [
            ['주소', i.address || '-'],
            ['PNU(가상)', i.pnu],
            ['지목', (i.jimok || '-') + (i.jimok ? ' (' + GisMap.jimokName(i.jimok) + ')' : '')],
            ['면적', s.parcel.areaM2 === null ? '-' : fmtInt(s.parcel.areaM2) + ' ㎡'],
            ['공시지가', i.officialPrice === null ? '-' : fmtInt(i.officialPrice) + ' 원/㎡']
        ];
        var dl = document.createElement('dl');
        for (var r = 0; r < rows.length; r++) {
            dl.appendChild(text('dt', rows[r][0]));
            dl.appendChild(text('dd', rows[r][1]));
        }
        card.appendChild(dl);
        var b = s.buildings;
        if (b.status === 'loading') card.appendChild(text('div', '건물 불러오는 중', 'demo-note'));
        else if (b.result) {
            card.appendChild(text('div', '건물 ' + b.result.buildingCount + '동', 'demo-sub'));
            for (var a = 0; a < b.result.addresses.length; a++) {
                var g = b.result.addresses[a];
                var names = [];
                for (var k = 0; k < g.buildings.length; k++) names.push(g.buildings[k].detailName || g.buildings[k].name || '-');
                card.appendChild(text('div', g.roadAddress + (g.name ? ' · ' + g.name : '') + ' (' + names.join(', ') + ')', 'demo-note'));
            }
        } else if (b.error) card.appendChild(text('div', b.error, 'demo-note'));
    }

    function bindSearch(gis, log) {
        var input = byId('searchInput');
        var box = byId('searchResults');
        if (!input || !box) return;
        function run() {
            clear(box);
            var q = input.value;
            gis.sources.addressSearch.search(q, 8).then(function (items) {
                if (items.length === 0) { box.appendChild(text('div', '결과 없음(샘플 장소 · 가상 필지)', 'demo-note')); return; }
                for (var i = 0; i < items.length; i++) {
                    (function (it) {
                        var b = document.createElement('button');
                        b.type = 'button';
                        b.className = 'demo-result';
                        b.textContent = it.title + ' · ' + it.category;
                        b.onclick = function () {
                            gis.flyTo({ lon: it.point.lon, lat: it.point.lat, zoom: 17 });
                            gis.parcel.highlight(it.point.lon, it.point.lat, it.title);
                            log('검색 선택: ' + it.title);
                        };
                        box.appendChild(b);
                    })(items[i]);
                }
            });
        }
        byId('btnSearch').onclick = run;
        input.onkeydown = function (e) { if (e.key === 'Enter' || e.keyCode === 13) run(); };
    }

    function bindAnalysis(gis, log) {
        if (!has('btnAnalysis')) return;
        byId('btnAnalysis').onclick = function () {
            var layers = gis.areaAnalysis.store.getState().layers;
            var refs = [];
            for (var i = 0; i < layers.length; i++) if (layers[i].queryable !== false && layers[i].provider !== 'none') refs.push(layers[i].ref);
            if (refs.length === 0) { log('영역 분석: 분석할 수 있는 레이어가 없습니다'); return; }
            gis.areaAnalysis.useViewExtent();
            gis.areaAnalysis.setPicked(refs);
            gis.areaAnalysis.run().then(function (rs) {
                var out = byId('analysisResult');
                if (out) clear(out);
                for (var r = 0; r < rs.length; r++) {
                    var res = rs[r];
                    if (res.status === 'error') { log('영역 분석 실패(' + res.name + '): ' + res.error); continue; }
                    var line = res.name + ': ' + res.count + '건, 잘라낸 면적 ' + fmtInt(res.clipAreaM2) + ' ㎡';
                    log('영역 분석 · ' + line);
                    if (out) {
                        out.appendChild(text('div', line, 'demo-sub'));
                        if (res.category) {
                            var ul = document.createElement('ul');
                            for (var c = 0; c < res.category.rows.length; c++) {
                                var row = res.category.rows[c];
                                ul.appendChild(text('li', res.category.label + ' ' + row.value + ' — ' + row.count + '건' + (row.clipAreaM2 === null ? '' : ', ' + fmtInt(row.clipAreaM2) + ' ㎡')));
                            }
                            out.appendChild(ul);
                        }
                    }
                }
            });
        };
    }

    // 시설 구분별 색: 엔진 API gis.vector.getStyle/restyle (스타일 대화상자 위젯은 React라 이 폴더에는 없다)
    function bindStyle(gis, log) {
        if (!has('btnStyle')) return;
        byId('btnStyle').onclick = function () {
            gis.vector.zoomTo(1).then(function () {
                var style = gis.vector.getStyle(1);
                var colors = { '도서관': '#2563eb', '주민센터': '#16a34a', '공원': '#65a30d', '학교': '#f59e0b', '체육시설': '#dc2626', '보건소': '#7c3aed' };
                var classes = [];
                for (var k in colors) if (Object.prototype.hasOwnProperty.call(colors, k)) classes.push({ value: k, color: colors[k] });
                style.classify = { type: 'categorical', field: '구분', classes: classes, otherColor: '#9ca3af' };
                style.pointRadius = 7;
                gis.vector.restyle(1, style);
                log('공공시설(가상): 구분별 색 적용(restyle)');
            });
        };
    }

    function bindWind(gis, GisMap, log) {
        if (!has('btnWind')) return;
        var wind = gis.getPlugin('wind');
        if (!wind) wind = (gis.use(GisMap.plugins.wind()), gis.getPlugin('wind'));
        byId('btnWind').onclick = function () {
            wind.toggle();
            log('바람(가상 합성 바람장) ' + (wind.store.getState().visible ? '켬' : '끔'));
        };
        return wind;
    }

    /**
     * 두 지도 페이지 공용 화면 연결. gis = GisMap.create/attach 결과, ctx = { GisMap, demo, log }.
     * 반환값 = 연결 해제 함수(gis.destroy() 전에 부른다)
     */
    function bind(gis, ctx) {
        var GisMap = ctx.GisMap, demo = ctx.demo, log = ctx.log;
        var offs = [];
        var tools = byId('tools');
        if (tools) {
            tools.onclick = function (e) {
                var t = e.target && e.target.getAttribute && e.target.getAttribute('data-tool');
                if (t) gis.tools.activate(t);
            };
            offs.push(gis.tools.store.subscribe(function (s) {
                var btns = tools.querySelectorAll('[data-tool]');
                for (var i = 0; i < btns.length; i++) btns[i].className = btns[i].getAttribute('data-tool') === s.activeTool ? 'is-on' : '';
            }));
        }
        offs.push(gis.layers.store.subscribe(function () { renderTree(gis); }));
        offs.push(gis.region.watch());
        offs.push(gis.parcelInfo.store.subscribe(function () { renderParcelCard(gis, GisMap); }));
        offs.push(gis.region.store.subscribe(function (s) {
            var el = byId('regionName');
            if (el) el.textContent = s.name && s.name !== '-' ? s.name : '(샘플 지역 밖)';
        }));
        renderTree(gis);
        renderMyMaps(gis, demo, log);
        renderBigButtons(gis, demo, log);
        renderParcelCard(gis, GisMap);
        bindSearch(gis, log);
        bindAnalysis(gis, log);
        bindStyle(gis, log);
        var wind = bindWind(gis, GisMap, log);
        if (has('btnClear')) byId('btnClear').onclick = function () { gis.clearAll(); log('전체 지우기'); };
        if (has('btnPrint')) byId('btnPrint').onclick = function () { gis.print.print({ title: '지도 출력 예제' }); };
        function save(kind, name) {
            var p = kind === 'pdf' ? gis.print.exportPdf({ title: '지도 출력 예제' }) : gis.print.exportPng({ title: '지도 출력 예제' });
            p.then(function (blob) { GisMap.saveBlob(blob, name); log(name + ' 저장'); })
                .catch(function (e) { window.alert(e && e.code === 'TAINTED' ? e.message : '출력 실패: ' + (e && e.message)); });
        }
        if (has('btnPng')) byId('btnPng').onclick = function () { save('png', '지도출력.png'); };
        if (has('btnPdf')) byId('btnPdf').onclick = function () { save('pdf', '지도출력.pdf'); };
        if (demo.notice) log('안내: ' + demo.notice);
        showAttribution(demo);
        return function () {
            for (var i = 0; i < offs.length; i++) offs[i]();
            offs = [];
            if (wind && wind.store.getState().visible) wind.setVisible(false);
        };
    }

    return { make: make, bind: bind, showAttribution: showAttribution, renderTree: renderTree };
})();
