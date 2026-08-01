package com.gtp.domain.map.controller;

import com.gtp.domain.map.dto.*;
import com.gtp.domain.map.service.LayerService;
import com.gtp.global.response.ApiResponse;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/layers")
@RequiredArgsConstructor
public class LayerController {

    private final LayerService layerService;

    @GetMapping
    public ApiResponse<List<LayerResponse>> getAll() {
        return ApiResponse.ok(layerService.getAll());
    }

    @GetMapping("/tree")
    public ApiResponse<LayerTreeResponse> getTree() {
        return ApiResponse.ok(layerService.getTree());
    }

    @GetMapping("/tree/permission/{permission}")
    public ApiResponse<LayerTreeResponse> getTreeForPermission(@PathVariable String permission) {
        return ApiResponse.ok(layerService.getTreeForPermission(permission));
    }

    @PostMapping
    public ApiResponse<LayerResponse> create(@Valid @RequestBody LayerRequest req) {
        return ApiResponse.ok(layerService.create(req));
    }

    @PutMapping("/{id}")
    public ApiResponse<LayerResponse> update(@PathVariable Long id, @Valid @RequestBody LayerRequest req) {
        return ApiResponse.ok(layerService.update(id, req));
    }

    @DeleteMapping("/{id}")
    public ApiResponse<Void> delete(@PathVariable Long id) {
        layerService.delete(id);
        return ApiResponse.ok(null);
    }

    @PutMapping("/reorder")
    public ApiResponse<Void> reorder(@RequestBody LayerReorderRequest req) {
        layerService.reorder(req);
        return ApiResponse.ok(null);
    }

    @GetMapping("/permissions/{permission}")
    public ApiResponse<List<Long>> getPermissionLayers(@PathVariable String permission) {
        return ApiResponse.ok(layerService.getPermissionLayerIds(permission));
    }

    @PutMapping("/permissions/{permission}")
    public ApiResponse<Void> setPermissionLayers(@PathVariable String permission,
                                                  @RequestBody List<Long> layerIds) {
        layerService.setPermissionLayers(permission, layerIds);
        return ApiResponse.ok(null);
    }
}
