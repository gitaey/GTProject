package com.gtp.domain.geoserver.controller;

import com.gtp.domain.geoserver.dto.DatastoreResponse;
import com.gtp.domain.geoserver.dto.LayerItem;
import com.gtp.domain.geoserver.dto.PublishRequest;
import com.gtp.domain.geoserver.dto.PublishResult;
import com.gtp.domain.geoserver.dto.WorkspaceResponse;
import com.gtp.domain.geoserver.service.GeoServerService;
import com.gtp.global.response.ApiResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

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
}
