package com.gtp.domain.geoserver.controller;

import com.gtp.domain.geoserver.connection.ConnectedGeoServer;
import com.gtp.domain.geoserver.connection.GeoServerConnection;
import com.gtp.domain.geoserver.dto.LayerGroupCreateRequest;
import com.gtp.domain.geoserver.dto.LayerGroupDetail;
import com.gtp.domain.geoserver.dto.LayerGroupSummary;
import com.gtp.domain.geoserver.dto.LayerGroupUpdateRequest;
import com.gtp.domain.geoserver.dto.LayerGroupUpdateResult;
import com.gtp.domain.geoserver.service.GeoServerLayerGroupService;
import com.gtp.global.response.ApiResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * GeoServer 레이어 그룹 API(G1~G10). 권한은 SecurityConfig의 /api/geoserver/** 규칙(SUPER_ADMIN·MAP_ADMIN),
 * 대상 서버는 번호표 헤더(X-GeoServer-Connection)로 정해진다. */
@RestController
@RequestMapping("/api/geoserver")
@RequiredArgsConstructor
public class GeoServerLayerGroupController {

    private final GeoServerLayerGroupService service;

    /** G1: 작업공간의 발행된 레이어 이름 목록 */
    @GetMapping("/workspaces/{workspace}/layer-names")
    public ApiResponse<List<String>> getLayerNames(
            @ConnectedGeoServer GeoServerConnection conn,
            @PathVariable String workspace) {
        return ApiResponse.ok(service.getLayerNames(conn, workspace));
    }

    /** G2: 전역 그룹 목록 */
    @GetMapping("/layergroups")
    public ApiResponse<List<LayerGroupSummary>> getGlobalLayerGroups(@ConnectedGeoServer GeoServerConnection conn) {
        return ApiResponse.ok(service.getLayerGroups(conn, null));
    }

    /** G3: 작업공간 그룹 목록 */
    @GetMapping("/workspaces/{workspace}/layergroups")
    public ApiResponse<List<LayerGroupSummary>> getWorkspaceLayerGroups(
            @ConnectedGeoServer GeoServerConnection conn,
            @PathVariable String workspace) {
        return ApiResponse.ok(service.getLayerGroups(conn, workspace));
    }

    /** G4: 전역 그룹 상세 */
    @GetMapping("/layergroups/{name}")
    public ApiResponse<LayerGroupDetail> getGlobalLayerGroup(
            @ConnectedGeoServer GeoServerConnection conn,
            @PathVariable String name) {
        return ApiResponse.ok(service.getLayerGroup(conn, null, name));
    }

    /** G5: 작업공간 그룹 상세 */
    @GetMapping("/workspaces/{workspace}/layergroups/{name}")
    public ApiResponse<LayerGroupDetail> getWorkspaceLayerGroup(
            @ConnectedGeoServer GeoServerConnection conn,
            @PathVariable String workspace,
            @PathVariable String name) {
        return ApiResponse.ok(service.getLayerGroup(conn, workspace, name));
    }

    /** G6: 그룹 만들기(request.workspace가 null이면 전역) */
    @PostMapping("/layergroups")
    public ApiResponse<LayerGroupDetail> create(
            @ConnectedGeoServer GeoServerConnection conn,
            @RequestBody LayerGroupCreateRequest req) {
        return ApiResponse.ok(service.createLayerGroup(conn, req));
    }

    /** G9: 전역 그룹 수정(제목·설명·방식·레이어 구성·순서). 이름·소속은 바꾸지 않는다. */
    @PutMapping("/layergroups/{name}")
    public ApiResponse<LayerGroupUpdateResult> updateGlobal(
            @ConnectedGeoServer GeoServerConnection conn,
            @PathVariable String name,
            @RequestBody LayerGroupUpdateRequest req) {
        return ApiResponse.ok(service.updateLayerGroup(conn, null, name, req));
    }

    /** G10: 작업공간 그룹 수정 */
    @PutMapping("/workspaces/{workspace}/layergroups/{name}")
    public ApiResponse<LayerGroupUpdateResult> updateWorkspace(
            @ConnectedGeoServer GeoServerConnection conn,
            @PathVariable String workspace,
            @PathVariable String name,
            @RequestBody LayerGroupUpdateRequest req) {
        return ApiResponse.ok(service.updateLayerGroup(conn, workspace, name, req));
    }

    /** G7: 전역 그룹 삭제 */
    @DeleteMapping("/layergroups/{name}")
    public ApiResponse<Void> deleteGlobal(
            @ConnectedGeoServer GeoServerConnection conn,
            @PathVariable String name) {
        service.deleteLayerGroup(conn, null, name);
        return ApiResponse.ok(null);
    }

    /** G8: 작업공간 그룹 삭제 */
    @DeleteMapping("/workspaces/{workspace}/layergroups/{name}")
    public ApiResponse<Void> deleteWorkspace(
            @ConnectedGeoServer GeoServerConnection conn,
            @PathVariable String workspace,
            @PathVariable String name) {
        service.deleteLayerGroup(conn, workspace, name);
        return ApiResponse.ok(null);
    }
}
