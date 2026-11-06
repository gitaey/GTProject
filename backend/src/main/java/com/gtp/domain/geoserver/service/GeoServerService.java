package com.gtp.domain.geoserver.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.gtp.domain.geoserver.connection.GeoServerConnection;
import com.gtp.domain.geoserver.connection.GeoServerHttp;
import com.gtp.domain.geoserver.connection.GeoServerHttp.Req;
import com.gtp.domain.geoserver.connection.GeoServerHttp.Resp;
import com.gtp.domain.geoserver.dto.LayerItem;
import com.gtp.domain.geoserver.dto.LayerWithStyle;
import com.gtp.domain.geoserver.dto.PublishResult;
import com.gtp.global.exception.CustomException;
import com.gtp.global.gis.GisErrorCode;
import jakarta.annotation.PreDestroy;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.web.util.UriUtils;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CompletionException;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * 연결된 GeoServer(REST)에 대한 작업. 접속 정보를 설정에서 읽지 않고 호출마다 {@link GeoServerConnection}을 받는다.
 * 외부 호출은 전부 {@link GeoServerHttp}를 지난다. 요청 본문(SLD 포함)·응답 본문 전체는 로그에 남기지 않는다.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class GeoServerService {

    private static final String SLD_TYPE = "application/vnd.ogc.sld+xml";
    private static final String JSON = "application/json";
    private static final int LAYER_DETAIL_CONCURRENCY = 8;

    private final GeoServerHttp http;
    private final ObjectMapper objectMapper = new ObjectMapper();

    /** 레이어 상세 조회 전용 실행기 — 남의 GeoServer에 레이어 수백 개를 한꺼번에 요청하지 않도록 8개로 제한. */
    private final ExecutorService detailExecutor = Executors.newFixedThreadPool(LAYER_DETAIL_CONCURRENCY, new java.util.concurrent.ThreadFactory() {
        private final AtomicInteger seq = new AtomicInteger();

        @Override
        public Thread newThread(Runnable r) {
            Thread t = new Thread(r, "geoserver-detail-" + seq.incrementAndGet());
            t.setDaemon(true);
            return t;
        }
    });

    @PreDestroy
    void shutdown() {
        detailExecutor.shutdownNow();
    }

    // ── 조회 ────────────────────────────────────────────────────

    public List<String> getWorkspaces(GeoServerConnection c) {
        JsonNode root = getJson(c, "작업공간 조회", "/workspaces");
        return names(root.path("workspaces").path("workspace"));
    }

    public List<String> getDatastores(GeoServerConnection c, String workspace) {
        JsonNode root = getJson(c, "저장소 조회", "/workspaces/" + seg("작업공간", workspace) + "/datastores");
        return names(root.path("dataStores").path("dataStore"));
    }

    public List<LayerItem> getFeatureTypes(GeoServerConnection c, String workspace, String datastore) {
        String base = "/workspaces/" + seg("작업공간", workspace) + "/datastores/" + seg("저장소", datastore) + "/featuretypes";
        // 발행된 레이어 목록
        JsonNode pubRoot = getJson(c, "발행된 레이어 조회", base + "?list=published");
        List<String> publishedNames = names(pubRoot.path("featureTypes").path("featureType"));
        Set<String> published = new HashSet<>(publishedNames);

        // available: {"list":{"string":[...]}} (하나면 배열 대신 문자열)
        JsonNode allRoot = getJson(c, "사용 가능한 레이어 조회", base + "?list=available");
        List<LayerItem> items = new ArrayList<>();
        for (JsonNode n : asList(allRoot.path("list").path("string"))) {
            String name = n.asText();
            if (!name.isBlank()) items.add(new LayerItem(name, published.contains(name)));
        }
        // available에 없는 발행된 레이어도 포함
        Set<String> listed = new HashSet<>();
        items.forEach(i -> listed.add(i.getName()));
        for (String name : publishedNames) {
            if (listed.add(name)) items.add(new LayerItem(name, true));
        }
        items.sort((a, b) -> a.getName().compareToIgnoreCase(b.getName()));
        return items;
    }

    public List<LayerWithStyle> getWorkspaceLayers(GeoServerConnection c, String workspace) {
        String ws = seg("작업공간", workspace);
        JsonNode root = getJson(c, "워크스페이스 레이어 조회", "/workspaces/" + ws + "/layers");
        List<String> names = names(root.path("layers").path("layer"));
        names.sort(String::compareToIgnoreCase);

        // 각 레이어의 defaultStyle 병렬 조회(최대 8개 동시)
        List<CompletableFuture<LayerWithStyle>> futures = names.stream()
                .map(name -> CompletableFuture.supplyAsync(() -> new LayerWithStyle(name, layerStyle(c, ws, name)), detailExecutor))
                .toList();
        List<LayerWithStyle> out = new ArrayList<>();
        for (CompletableFuture<LayerWithStyle> f : futures) {
            try {
                out.add(f.join());
            } catch (CompletionException e) {
                // 연결 거부(401)는 화면에 428로 알려야 하므로 그대로 던진다
                if (e.getCause() instanceof CustomException ce) throw ce;
                throw e;
            }
        }
        return out;
    }

    /** 레이어 하나의 기본 스타일 이름. 계정 거부(AUTH_REJECTED)만 던지고 나머지 실패는 빈 값(기존 동작). */
    private String layerStyle(GeoServerConnection c, String wsEncoded, String layerName) {
        try {
            Resp res = http.call(c, "레이어 상세 조회", Req.get(
                    rest(c, "/workspaces/" + wsEncoded + "/layers/" + seg("레이어", layerName)),
                    JSON, GeoServerHttp.TIMEOUT_NORMAL, GeoServerHttp.MAX_TEXT_BYTES));
            if (!res.is2xx()) return "";
            JsonNode detail = objectMapper.readTree(res.body());
            return detail.path("layer").path("defaultStyle").path("name").asText("");
        } catch (CustomException e) {
            if (e.getErrorCode() == GisErrorCode.GEOSERVER_AUTH_REJECTED) throw e;
            return "";
        } catch (IOException e) {
            return "";
        }
    }

    public List<String> getStyles(GeoServerConnection c) {
        JsonNode root = getJson(c, "스타일 목록 조회", "/styles");
        return names(root.path("styles").path("style"));
    }

    public String getStyleSld(GeoServerConnection c, String name) {
        Resp res = http.call(c, "스타일 조회", Req.get(
                rest(c, "/styles/" + seg("스타일", name) + ".sld"),
                SLD_TYPE, GeoServerHttp.TIMEOUT_NORMAL, GeoServerHttp.MAX_TEXT_BYTES));
        requireStatus(res, "스타일 조회");
        return res.text();
    }

    // ── 스타일 변경 ─────────────────────────────────────────────

    public void createStyle(GeoServerConnection c, String name, String sld) {
        requireName("스타일", name);
        requireText("SLD", sld);
        Resp res = http.call(c, "스타일 생성", Req.send("POST",
                rest(c, "/styles?name=" + UriUtils.encodeQueryParam(name, StandardCharsets.UTF_8)),
                JSON, SLD_TYPE, sld, GeoServerHttp.TIMEOUT_NORMAL));
        if (res.status() != 201) throw GisErrorCode.GEOSERVER_REQUEST_FAILED.exception("스타일 생성", res.status());
    }

    public void updateStyle(GeoServerConnection c, String name, String sld) {
        requireText("SLD", sld);
        Resp res = http.call(c, "스타일 수정", Req.send("PUT",
                rest(c, "/styles/" + seg("스타일", name)),
                JSON, SLD_TYPE, sld, GeoServerHttp.TIMEOUT_NORMAL));
        if (res.status() != 200) throw GisErrorCode.GEOSERVER_REQUEST_FAILED.exception("스타일 수정", res.status());
    }

    public void deleteStyle(GeoServerConnection c, String name) {
        Resp res = http.call(c, "스타일 삭제", Req.send("DELETE",
                rest(c, "/styles/" + seg("스타일", name) + "?purge=true&recurse=true"),
                JSON, null, null, GeoServerHttp.TIMEOUT_NORMAL));
        requireStatus(res, "스타일 삭제");
    }

    public void setLayerStyle(GeoServerConnection c, String workspace, String layerName, String styleName) {
        String ws = seg("작업공간", workspace);
        String layer = seg("레이어", layerName);
        requireName("스타일", styleName);
        ObjectNode style = objectMapper.createObjectNode().put("name", styleName).put("workspace", workspace);
        ObjectNode body = objectMapper.createObjectNode();
        body.putObject("layer").set("defaultStyle", style);
        Resp res = http.call(c, "스타일 적용", Req.send("PUT",
                rest(c, "/layers/" + ws + ":" + layer),
                JSON, "application/json", body.toString(), GeoServerHttp.TIMEOUT_NORMAL));
        if (res.status() != 200) throw GisErrorCode.GEOSERVER_REQUEST_FAILED.exception("스타일 적용", res.status());
    }

    // ── 범례 ────────────────────────────────────────────────────

    /** 연결별로 자동 고른 레이어에 SLD_BODY를 얹어 GetLegendGraphic을 부른다. 기억한 레이어가 실패하면 한 번만 다시 고른다. */
    public byte[] getLegendGraphic(GeoServerConnection c, String sld) {
        requireText("SLD", sld);
        String layer = c.legendLayer();
        boolean freshlyPicked = false;
        if (layer == null) {
            layer = pickLegendLayer(c);
            freshlyPicked = true;
        }
        Resp res = legendRequest(c, layer, sld);
        if (!legendOk(res) && !freshlyPicked) {
            c.legendLayer(null);
            String again = pickLegendLayer(c);
            if (!again.equals(layer)) {
                layer = again;
                res = legendRequest(c, layer, sld);
            }
        }
        if (!legendOk(res)) {
            log.debug("[Legend] 실패 host={} HTTP {} : {}", c.host(), res.status(), GeoServerHttp.preview(res.body()));
            throw GisErrorCode.GEOSERVER_REQUEST_FAILED.exception("범례 생성", res.status());
        }
        c.legendLayer(layer);
        return res.body();
    }

    private boolean legendOk(Resp res) {
        // 로그인 HTML 같은 비이미지 응답을 PNG로 내려보내지 않도록 PNG 매직 바이트(89 50 4E 47 0D 0A 1A 0A)까지 확인
        byte[] b = res.body();
        return res.status() == 200
                && !res.contentType().toLowerCase(java.util.Locale.ROOT).contains("xml")
                && b.length >= 8 && (b[0] & 0xff) == 0x89 && b[1] == 'P' && b[2] == 'N' && b[3] == 'G'
                && b[4] == 0x0d && b[5] == 0x0a && b[6] == 0x1a && b[7] == 0x0a;
    }

    private Resp legendRequest(GeoServerConnection c, String layer, String sld) {
        // 백엔드 → GeoServer 구간은 nginx를 거치지 않으므로 GET + URL에 SLD_BODY 직접 전달
        String url = c.baseUrl() + "/ows?service=WMS&version=1.1.0&request=GetLegendGraphic"
                + "&format=image%2Fpng&width=20&height=20"
                + "&LAYER=" + java.net.URLEncoder.encode(layer, StandardCharsets.UTF_8)
                + "&SLD_BODY=" + java.net.URLEncoder.encode(sld, StandardCharsets.UTF_8);
        return http.call(c, "범례 생성", Req.get(url, "image/png,*/*", GeoServerHttp.TIMEOUT_LEGEND, GeoServerHttp.MAX_PNG_BYTES));
    }

    private String pickLegendLayer(GeoServerConnection c) {
        JsonNode root = getJson(c, "레이어 목록 조회", "/layers");
        List<String> names = names(root.path("layers").path("layer"));
        if (names.isEmpty()) throw new CustomException(GisErrorCode.GEOSERVER_LEGEND_UNAVAILABLE);
        return names.get(0);
    }

    // ── 발행 ────────────────────────────────────────────────────

    public List<PublishResult> publishLayers(GeoServerConnection c, String workspace, String datastore, List<String> layers) {
        String path = "/workspaces/" + seg("작업공간", workspace) + "/datastores/" + seg("저장소", datastore) + "/featuretypes";
        if (layers == null || layers.isEmpty()) {
            throw GisErrorCode.GEOSERVER_INPUT_INVALID.exception("발행할 레이어를 선택하세요.");
        }
        for (String layer : layers) requireName("레이어", layer);

        List<PublishResult> results = new ArrayList<>();
        String abortReason = null; // 연결 자체가 막히면 남은 레이어는 요청하지 않는다
        for (String layer : layers) {
            if (abortReason != null) {
                results.add(new PublishResult(layer, false, abortReason));
                continue;
            }
            try {
                ObjectNode body = objectMapper.createObjectNode();
                body.putObject("featureType").put("name", layer);
                Resp res = http.call(c, "레이어 발행", Req.send("POST", rest(c, path),
                        JSON, "application/json", body.toString(), GeoServerHttp.TIMEOUT_PUBLISH));
                if (res.status() == 201) {
                    results.add(new PublishResult(layer, true, "발행 완료"));
                } else {
                    results.add(new PublishResult(layer, false,
                            "HTTP " + res.status() + ": " + GeoServerHttp.preview(res.body())));
                }
            } catch (CustomException e) {
                results.add(new PublishResult(layer, false, e.getMessage()));
                // http.call이 던지는 예외는 전부 연결 문제(401·3xx·전송 실패)라 남은 레이어는 요청하지 않는다
                abortReason = e.getErrorCode() == GisErrorCode.GEOSERVER_AUTH_REJECTED
                        ? "연결 거부(GeoServer가 계정을 거부해 연결을 해제했습니다)"
                        : "중단됨(앞선 레이어에서 GeoServer 연결에 실패했습니다)";
            }
        }
        return results;
    }

    // ── 내부 도우미 ─────────────────────────────────────────────

    private String rest(GeoServerConnection c, String pathAndQuery) {
        return c.baseUrl() + "/rest" + pathAndQuery;
    }

    private JsonNode getJson(GeoServerConnection c, String op, String pathAndQuery) {
        Resp res = http.call(c, op, Req.get(rest(c, pathAndQuery), JSON, GeoServerHttp.TIMEOUT_NORMAL, GeoServerHttp.MAX_TEXT_BYTES));
        requireStatus(res, op);
        try {
            return objectMapper.readTree(res.body());
        } catch (IOException e) {
            log.debug("[GeoServer] {} JSON 해석 실패 host={}", op, c.host());
            throw new CustomException(GisErrorCode.GEOSERVER_RESPONSE_INVALID);
        }
    }

    private void requireStatus(Resp res, String op) {
        if (!res.is2xx()) throw GisErrorCode.GEOSERVER_REQUEST_FAILED.exception(op, res.status());
    }

    /**
     * 목록 응답 방어: 배열은 그대로, 객체·문자열 하나는 원소 하나, 빈 문자열("")·그 밖은 빈 목록.
     * GeoServer는 빈 목록을 {"workspaces":""}로, 원소 하나를 배열 대신 단독 값으로 주는 버전이 있다.
     */
    static List<JsonNode> asList(JsonNode node) {
        List<JsonNode> out = new ArrayList<>();
        if (node == null || node.isMissingNode() || node.isNull()) return out;
        if (node.isArray()) {
            node.forEach(out::add);
        } else if (node.isObject()) {
            out.add(node);
        } else if (node.isTextual() && !node.asText().isBlank()) {
            out.add(node);
        }
        return out;
    }

    static List<String> names(JsonNode node) {
        List<String> out = new ArrayList<>();
        for (JsonNode n : asList(node)) {
            String name = n.isObject() ? n.path("name").asText("") : n.asText("");
            if (!name.isBlank()) out.add(name);
        }
        return out;
    }

    /** 경로 변수 검사 + 경로 조각 인코딩. 값 자체는 오류 메시지에 넣지 않는다. */
    static String seg(String label, String value) {
        requireName(label, value);
        return UriUtils.encodePathSegment(value, StandardCharsets.UTF_8);
    }

    static void requireName(String label, String value) {
        if (value == null || value.isBlank() || value.equals(".") || value.equals("..") || value.length() > 500) {
            throw GisErrorCode.GEOSERVER_INPUT_INVALID.exception(label + " 이름이 올바르지 않습니다.");
        }
        for (int i = 0; i < value.length(); i++) {
            if (Character.isISOControl(value.charAt(i))) {
                throw GisErrorCode.GEOSERVER_INPUT_INVALID.exception(label + " 이름에 제어 문자를 넣을 수 없습니다.");
            }
        }
    }

    static void requireText(String label, String value) {
        if (value == null || value.isBlank()) {
            throw GisErrorCode.GEOSERVER_INPUT_INVALID.exception(label + " 내용이 비었습니다.");
        }
    }
}
