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
