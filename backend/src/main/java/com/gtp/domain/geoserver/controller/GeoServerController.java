package com.gtp.domain.geoserver.controller;

import com.gtp.domain.geoserver.connection.ConnectedGeoServer;
import com.gtp.domain.geoserver.connection.GeoServerConnection;
import com.gtp.domain.geoserver.dto.DatastoreResponse;
import com.gtp.domain.geoserver.dto.LayerItem;
import com.gtp.domain.geoserver.dto.LayerWithStyle;
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

import java.util.List;
import java.util.Map;

/**
 * GeoServer 관리 API. 권한은 SecurityConfig(SUPER_ADMIN·MAP_ADMIN), 대상 서버는 번호표 헤더(X-GeoServer-Connection)로
 * 정해지며 {@link ConnectedGeoServer} 인자 해석기가 연결 객체로 바꿔 넣는다(없거나 틀리면 428).
 */
@RestController
@RequestMapping("/api/geoserver")
@RequiredArgsConstructor
public class GeoServerController {

    private final GeoServerService geoServerService;

    @GetMapping("/workspaces")
    public ApiResponse<WorkspaceResponse> getWorkspaces(@ConnectedGeoServer GeoServerConnection conn) {
        return ApiResponse.ok(new WorkspaceResponse(geoServerService.getWorkspaces(conn)));
    }

    @GetMapping("/workspaces/{workspace}/datastores")
    public ApiResponse<DatastoreResponse> getDatastores(
            @ConnectedGeoServer GeoServerConnection conn,
            @PathVariable String workspace) {
        return ApiResponse.ok(new DatastoreResponse(geoServerService.getDatastores(conn, workspace)));
    }

    @GetMapping("/workspaces/{workspace}/layers")
    public ApiResponse<List<LayerWithStyle>> getWorkspaceLayers(
            @ConnectedGeoServer GeoServerConnection conn,
            @PathVariable String workspace) {
        return ApiResponse.ok(geoServerService.getWorkspaceLayers(conn, workspace));
    }

    @GetMapping("/workspaces/{workspace}/datastores/{datastore}/layers")
    public ApiResponse<List<LayerItem>> getLayers(
            @ConnectedGeoServer GeoServerConnection conn,
            @PathVariable String workspace,
            @PathVariable String datastore) {
        return ApiResponse.ok(geoServerService.getFeatureTypes(conn, workspace, datastore));
    }

    @PostMapping("/publish")
    public ApiResponse<List<PublishResult>> publish(
            @ConnectedGeoServer GeoServerConnection conn,
            @RequestBody PublishRequest req) {
        return ApiResponse.ok(geoServerService.publishLayers(
                conn, req.getWorkspace(), req.getDatastore(), req.getLayers()));
    }

    @PostMapping("/legend")
    public ResponseEntity<byte[]> getLegendGraphic(
            @ConnectedGeoServer GeoServerConnection conn,
            @RequestBody StyleRequest req) {
        byte[] image = geoServerService.getLegendGraphic(conn, req.getSld());
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.IMAGE_PNG);
        return ResponseEntity.ok().headers(headers).body(image);
    }

    @GetMapping("/styles")
    public ApiResponse<List<String>> getStyles(@ConnectedGeoServer GeoServerConnection conn) {
        return ApiResponse.ok(geoServerService.getStyles(conn));
    }

    @GetMapping("/styles/{name}")
    public ApiResponse<String> getStyleSld(
            @ConnectedGeoServer GeoServerConnection conn,
            @PathVariable String name) {
        return ApiResponse.ok(geoServerService.getStyleSld(conn, name));
    }

    @PostMapping("/styles")
    public ApiResponse<Void> createStyle(
            @ConnectedGeoServer GeoServerConnection conn,
            @RequestBody StyleRequest req) {
        geoServerService.createStyle(conn, req.getName(), req.getSld());
        return ApiResponse.ok(null);
    }

    @PutMapping("/styles/{name}")
    public ApiResponse<Void> updateStyle(
            @ConnectedGeoServer GeoServerConnection conn,
            @PathVariable String name,
            @RequestBody StyleRequest req) {
        geoServerService.updateStyle(conn, name, req.getSld());
        return ApiResponse.ok(null);
    }

    @DeleteMapping("/styles/{name}")
    public ApiResponse<Void> deleteStyle(
            @ConnectedGeoServer GeoServerConnection conn,
            @PathVariable String name) {
        geoServerService.deleteStyle(conn, name);
        return ApiResponse.ok(null);
    }

    @PutMapping("/workspaces/{workspace}/layers/{layer}/style")
    public ApiResponse<Void> setLayerStyle(
            @ConnectedGeoServer GeoServerConnection conn,
            @PathVariable String workspace,
            @PathVariable String layer,
            @RequestBody Map<String, String> body) {
        geoServerService.setLayerStyle(conn, workspace, layer, body.get("styleName"));
        return ApiResponse.ok(null);
    }
}
