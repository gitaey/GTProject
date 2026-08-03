package com.gtp.domain.geoserver.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.gtp.domain.geoserver.dto.LayerItem;
import com.gtp.domain.geoserver.dto.PublishResult;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.util.ArrayList;
import java.util.Base64;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

@Slf4j
@Service
@RequiredArgsConstructor
public class GeoServerService {

    @Value("${geoserver.url}")
    private String geoserverUrl;

    @Value("${geoserver.admin.user}")
    private String adminUser;

    @Value("${geoserver.admin.password}")
    private String adminPassword;

    @Value("${geoserver.legend-layer}")
    private String legendLayer;

    private final ObjectMapper objectMapper = new ObjectMapper();
    private final HttpClient httpClient = HttpClient.newHttpClient();

    private String basicAuth() {
        return "Basic " + Base64.getEncoder().encodeToString((adminUser + ":" + adminPassword).getBytes());
    }

    private HttpRequest.Builder baseRequest(String path) {
        return HttpRequest.newBuilder()
                .uri(URI.create(geoserverUrl + "/rest" + path))
                .header("Authorization", basicAuth())
                .header("Accept", "application/json");
    }

    public List<String> getWorkspaces() throws Exception {
        HttpRequest req = baseRequest("/workspaces").GET().build();
        HttpResponse<String> res = httpClient.send(req, HttpResponse.BodyHandlers.ofString());
        JsonNode root = objectMapper.readTree(res.body());
        List<String> names = new ArrayList<>();
        JsonNode ws = root.path("workspaces").path("workspace");
        if (ws.isArray()) {
            ws.forEach(n -> names.add(n.path("name").asText()));
        }
        return names;
    }

    public List<String> getDatastores(String workspace) throws Exception {
        HttpRequest req = baseRequest("/workspaces/" + workspace + "/datastores").GET().build();
        HttpResponse<String> res = httpClient.send(req, HttpResponse.BodyHandlers.ofString());
        JsonNode root = objectMapper.readTree(res.body());
        List<String> names = new ArrayList<>();
        JsonNode ds = root.path("dataStores").path("dataStore");
        if (ds.isArray()) {
            ds.forEach(n -> names.add(n.path("name").asText()));
        }
        return names;
    }

    public List<LayerItem> getFeatureTypes(String workspace, String datastore) throws Exception {
        // 발행된 레이어 목록
        HttpRequest publishedReq = baseRequest("/workspaces/" + workspace + "/datastores/" + datastore + "/featuretypes?list=published").GET().build();
        HttpResponse<String> publishedRes = httpClient.send(publishedReq, HttpResponse.BodyHandlers.ofString());
        log.info("[GeoServer] published response: {}", publishedRes.body());
        // published: {"featureTypes":""} 또는 {"featureTypes":{"featureType":[...]}}
        Set<String> published = new HashSet<>();
        JsonNode pubRoot = objectMapper.readTree(publishedRes.body());
        JsonNode pubList = pubRoot.path("featureTypes").path("featureType");
        if (pubList.isArray()) {
            pubList.forEach(n -> published.add(n.path("name").asText()));
        }

        // available: {"list":{"string":[...]}}
        HttpRequest allReq = baseRequest("/workspaces/" + workspace + "/datastores/" + datastore + "/featuretypes?list=available").GET().build();
        HttpResponse<String> allRes = httpClient.send(allReq, HttpResponse.BodyHandlers.ofString());
        log.info("[GeoServer] available response: {}", allRes.body());
        JsonNode allRoot = objectMapper.readTree(allRes.body());
        JsonNode allList = allRoot.path("list").path("string");

        List<LayerItem> items = new ArrayList<>();
        if (allList.isArray()) {
            allList.forEach(n -> {
                String name = n.asText();
                if (!name.isBlank()) items.add(new LayerItem(name, published.contains(name)));
            });
        }
        // available에 없는 발행된 레이어도 포함
        pubList.forEach(n -> {
            String name = n.path("name").asText();
            if (!name.isBlank() && items.stream().noneMatch(i -> i.getName().equals(name))) {
                items.add(new LayerItem(name, true));
            }
        });
        items.sort((a, b) -> a.getName().compareToIgnoreCase(b.getName()));
        return items;
    }

    public List<com.gtp.domain.geoserver.dto.LayerWithStyle> getWorkspaceLayers(String workspace) throws Exception {
        HttpRequest req = baseRequest("/workspaces/" + workspace + "/layers").GET().build();
        HttpResponse<String> res = httpClient.send(req, HttpResponse.BodyHandlers.ofString());
        JsonNode root = objectMapper.readTree(res.body());
        List<String> names = new ArrayList<>();
        JsonNode layers = root.path("layers").path("layer");
        if (layers.isArray()) {
            layers.forEach(n -> names.add(n.path("name").asText()));
        }
        names.sort(String::compareToIgnoreCase);

        // 각 레이어의 defaultStyle 병렬 조회
        List<java.util.concurrent.CompletableFuture<com.gtp.domain.geoserver.dto.LayerWithStyle>> futures = names.stream()
                .map(name -> java.util.concurrent.CompletableFuture.supplyAsync(() -> {
                    try {
                        HttpRequest detailReq = baseRequest("/workspaces/" + workspace + "/layers/" + name).GET().build();
                        HttpResponse<String> detailRes = httpClient.send(detailReq, HttpResponse.BodyHandlers.ofString());
                        JsonNode detail = objectMapper.readTree(detailRes.body());
                        String style = detail.path("layer").path("defaultStyle").path("name").asText("");
                        return new com.gtp.domain.geoserver.dto.LayerWithStyle(name, style);
                    } catch (Exception e) {
                        return new com.gtp.domain.geoserver.dto.LayerWithStyle(name, "");
                    }
                }))
                .toList();

        return futures.stream()
                .map(java.util.concurrent.CompletableFuture::join)
                .toList();
    }

    public List<String> getStyles() throws Exception {
        HttpRequest req = baseRequest("/styles").GET().build();
        HttpResponse<String> res = httpClient.send(req, HttpResponse.BodyHandlers.ofString());
        JsonNode root = objectMapper.readTree(res.body());
        List<String> names = new ArrayList<>();
        JsonNode styles = root.path("styles").path("style");
        if (styles.isArray()) {
            styles.forEach(n -> names.add(n.path("name").asText()));
        }
        return names;
    }

    public String getStyleSld(String name) throws Exception {
        HttpRequest req = HttpRequest.newBuilder()
                .uri(URI.create(geoserverUrl + "/rest/styles/" + name + ".sld"))
                .header("Authorization", basicAuth())
                .header("Accept", "application/vnd.ogc.sld+xml")
                .GET().build();
        HttpResponse<String> res = httpClient.send(req, HttpResponse.BodyHandlers.ofString());
        return res.body();
    }

    /** VWorld WMS SLD 파라미터용: GeoServer 스타일의 UserStyle을 지정 레이어명으로 재조립하여 반환 */
    public String getStyleSldForLayers(String styleName, List<String> layerNames) throws Exception {
        String sld = getStyleSld(styleName);
        // GeoServer는 sld: prefix를 붙여서 반환하므로 optional prefix로 매칭
        java.util.regex.Matcher m = java.util.regex.Pattern
                .compile("<(?:sld:)?UserStyle>[\\s\\S]*?</(?:sld:)?UserStyle>")
                .matcher(sld);
        if (!m.find()) return sld;
        String userStyle = m.group();
        String p = sld.contains("sld:") ? "sld:" : "";
        StringBuilder namedLayers = new StringBuilder();
        for (String layerName : layerNames) {
            namedLayers.append("<").append(p).append("NamedLayer>")
                       .append("<").append(p).append("Name>").append(layerName).append("</").append(p).append("Name>")
                       .append(userStyle)
                       .append("</").append(p).append("NamedLayer>");
        }
        return java.util.regex.Pattern
                .compile("<(?:sld:)?NamedLayer>[\\s\\S]*</(?:sld:)?NamedLayer>")
                .matcher(sld)
                .replaceFirst(java.util.regex.Matcher.quoteReplacement(namedLayers.toString()));
    }

    public void createStyle(String name, String sld) throws Exception {
        HttpRequest req = HttpRequest.newBuilder()
                .uri(URI.create(geoserverUrl + "/rest/styles?name=" + name))
                .header("Authorization", basicAuth())
                .header("Content-Type", "application/vnd.ogc.sld+xml")
                .POST(HttpRequest.BodyPublishers.ofString(sld))
                .build();
        HttpResponse<String> res = httpClient.send(req, HttpResponse.BodyHandlers.ofString());
        if (res.statusCode() != 201) throw new RuntimeException("스타일 생성 실패: " + res.body());
    }

    public void updateStyle(String name, String sld) throws Exception {
        HttpRequest req = HttpRequest.newBuilder()
                .uri(URI.create(geoserverUrl + "/rest/styles/" + name))
                .header("Authorization", basicAuth())
                .header("Content-Type", "application/vnd.ogc.sld+xml")
                .PUT(HttpRequest.BodyPublishers.ofString(sld))
                .build();
        HttpResponse<String> res = httpClient.send(req, HttpResponse.BodyHandlers.ofString());
        if (res.statusCode() != 200) throw new RuntimeException("스타일 업데이트 실패: " + res.body());
    }

    public void deleteStyle(String name) throws Exception {
        HttpRequest req = HttpRequest.newBuilder()
                .uri(URI.create(geoserverUrl + "/rest/styles/" + name + "?purge=true&recurse=true"))
                .header("Authorization", basicAuth())
                .DELETE().build();
        httpClient.send(req, HttpResponse.BodyHandlers.ofString());
    }

    public byte[] getLegendGraphic(String sld) throws Exception {
        // 백엔드 → GeoServer 구간은 nginx를 거치지 않으므로 GET + URL에 SLD_BODY 직접 전달
        String url = geoserverUrl + "/ows?service=WMS&version=1.1.0&request=GetLegendGraphic"
                + "&format=image%2Fpng&width=20&height=20"
                + "&LAYER=" + java.net.URLEncoder.encode(legendLayer, java.nio.charset.StandardCharsets.UTF_8)
                + "&SLD_BODY=" + java.net.URLEncoder.encode(sld, java.nio.charset.StandardCharsets.UTF_8);
        log.info("[Legend] layer='{}' urlLen={}", legendLayer, url.length());

        HttpRequest req = HttpRequest.newBuilder()
                .uri(URI.create(url))
                .header("Authorization", basicAuth())
                .GET()
                .build();
        HttpResponse<byte[]> res = httpClient.send(req, HttpResponse.BodyHandlers.ofByteArray());
        String contentType = res.headers().firstValue("Content-Type").orElse("");
        log.info("[Legend] status={} contentType={} bodyLen={}", res.statusCode(), contentType, res.body().length);
        if (res.statusCode() != 200 || contentType.contains("xml")) {
            log.warn("[Legend] error: {}", new String(res.body(), 0, Math.min(300, res.body().length)));
            throw new RuntimeException("범례 생성 실패");
        }
        return res.body();
    }

    public void setLayerStyle(String workspace, String layerName, String styleName) throws Exception {
        String body = String.format(
                "{\"layer\":{\"defaultStyle\":{\"name\":\"%s\",\"workspace\":\"%s\"}}}",
                styleName, workspace);
        HttpRequest req = HttpRequest.newBuilder()
                .uri(URI.create(geoserverUrl + "/rest/layers/" + workspace + ":" + layerName))
                .header("Authorization", basicAuth())
                .header("Content-Type", "application/json")
                .PUT(HttpRequest.BodyPublishers.ofString(body))
                .build();
        HttpResponse<String> res = httpClient.send(req, HttpResponse.BodyHandlers.ofString());
        if (res.statusCode() != 200) throw new RuntimeException("스타일 적용 실패: " + res.body());
    }

    public List<PublishResult> publishLayers(String workspace, String datastore, List<String> layers) {
        List<PublishResult> results = new ArrayList<>();
        for (String layer : layers) {
            try {
                String body = String.format("{\"featureType\":{\"name\":\"%s\"}}", layer);
                HttpRequest req = baseRequest("/workspaces/" + workspace + "/datastores/" + datastore + "/featuretypes")
                        .header("Content-Type", "application/json")
                        .POST(HttpRequest.BodyPublishers.ofString(body))
                        .build();
                HttpResponse<String> res = httpClient.send(req, HttpResponse.BodyHandlers.ofString());
                if (res.statusCode() == 201) {
                    results.add(new PublishResult(layer, true, "발행 완료"));
                } else {
                    results.add(new PublishResult(layer, false, "HTTP " + res.statusCode() + ": " + res.body()));
                }
            } catch (Exception e) {
                results.add(new PublishResult(layer, false, e.getMessage()));
            }
        }
        return results;
    }
}
