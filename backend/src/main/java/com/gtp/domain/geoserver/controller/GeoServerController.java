package com.gtp.domain.geoserver.controller;

import com.gtp.domain.geoserver.dto.DatastoreResponse;
import com.gtp.domain.geoserver.dto.LayerItem;
import com.gtp.domain.geoserver.dto.PublishRequest;
import com.gtp.domain.geoserver.dto.PublishResult;
import com.gtp.domain.geoserver.dto.StyleRequest;
import com.gtp.domain.geoserver.dto.WorkspaceResponse;
import com.gtp.domain.geoserver.service.GeoServerService;
import com.gtp.global.response.ApiResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Arrays;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/geoserver")
@RequiredArgsConstructor
public class GeoServerController {

    private final GeoServerService geoServerService;

    @GetMapping("/workspaces")
    public ApiResponse<WorkspaceResponse> getWorkspaces() throws Exception {
        return ApiResponse.ok(new WorkspaceResponse(geoServerService.getWorkspaces()));
    }

    @GetMapping("/workspaces/{workspace}/datastores")
    public ApiResponse<DatastoreResponse> getDatastores(@PathVariable String workspace) throws Exception {
        return ApiResponse.ok(new DatastoreResponse(geoServerService.getDatastores(workspace)));
    }

    @GetMapping("/workspaces/{workspace}/layers")
    public ApiResponse<List<com.gtp.domain.geoserver.dto.LayerWithStyle>> getWorkspaceLayers(@PathVariable String workspace) throws Exception {
        return ApiResponse.ok(geoServerService.getWorkspaceLayers(workspace));
    }

    @GetMapping("/workspaces/{workspace}/datastores/{datastore}/layers")
    public ApiResponse<List<LayerItem>> getLayers(
            @PathVariable String workspace,
            @PathVariable String datastore) throws Exception {
        return ApiResponse.ok(geoServerService.getFeatureTypes(workspace, datastore));
    }

    @PostMapping("/publish")
    public ApiResponse<List<PublishResult>> publish(@RequestBody PublishRequest req) {
        List<PublishResult> results = geoServerService.publishLayers(
                req.getWorkspace(), req.getDatastore(), req.getLayers());
        return ApiResponse.ok(results);
    }

    @PostMapping("/legend")
    public ResponseEntity<byte[]> getLegendGraphic(@RequestBody StyleRequest req) throws Exception {
        byte[] image = geoServerService.getLegendGraphic(req.getSld());
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.IMAGE_PNG);
        return ResponseEntity.ok().headers(headers).body(image);
    }

    @GetMapping("/styles")
    public ApiResponse<List<String>> getStyles() throws Exception {
        return ApiResponse.ok(geoServerService.getStyles());
    }

    @GetMapping("/styles/{name}")
    public ApiResponse<String> getStyleSld(@PathVariable String name) throws Exception {
        return ApiResponse.ok(geoServerService.getStyleSld(name));
    }

    /** 인증 불필요 — VWorld WMS SLD 파라미터용 공개 엔드포인트 (경로: /sld/{name}/{layers}) */
    @GetMapping(value = "/sld/{name}/{layers}", produces = "application/xml")
    public ResponseEntity<String> getPublicSldWithLayers(
            @PathVariable String name,
            @PathVariable String layers) throws Exception {
        List<String> layerNames = Arrays.asList(layers.split(","));
        String sld = geoServerService.getStyleSldForLayers(name, layerNames);
        return ResponseEntity.ok(sld);
    }

    /** 인증 불필요 — 레이어명 치환 없이 원본 반환 */
    @GetMapping(value = "/sld/{name}", produces = "application/xml")
    public ResponseEntity<String> getPublicSld(
            @PathVariable String name) throws Exception {
        String sld = geoServerService.getStyleSld(name);
        return ResponseEntity.ok(sld);
    }

    @PostMapping("/styles")
    public ApiResponse<Void> createStyle(@RequestBody StyleRequest req) throws Exception {
        geoServerService.createStyle(req.getName(), req.getSld());
        return ApiResponse.ok(null);
    }

    @PutMapping("/styles/{name}")
    public ApiResponse<Void> updateStyle(@PathVariable String name, @RequestBody StyleRequest req) throws Exception {
        geoServerService.updateStyle(name, req.getSld());
        return ApiResponse.ok(null);
    }

    @DeleteMapping("/styles/{name}")
    public ApiResponse<Void> deleteStyle(@PathVariable String name) throws Exception {
        geoServerService.deleteStyle(name);
        return ApiResponse.ok(null);
    }

    @PutMapping("/workspaces/{workspace}/layers/{layer}/style")
    public ApiResponse<Void> setLayerStyle(
            @PathVariable String workspace,
            @PathVariable String layer,
            @RequestBody Map<String, String> body) throws Exception {
        geoServerService.setLayerStyle(workspace, layer, body.get("styleName"));
        return ApiResponse.ok(null);
    }
}
