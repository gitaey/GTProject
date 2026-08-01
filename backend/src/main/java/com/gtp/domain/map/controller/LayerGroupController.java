package com.gtp.domain.map.controller;

import com.gtp.domain.map.dto.LayerGroupRequest;
import com.gtp.domain.map.dto.LayerGroupResponse;
import com.gtp.domain.map.service.LayerGroupService;
import com.gtp.global.response.ApiResponse;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/layer-groups")
@RequiredArgsConstructor
public class LayerGroupController {

    private final LayerGroupService layerGroupService;

    @GetMapping
    public ApiResponse<List<LayerGroupResponse>> getAll() {
        return ApiResponse.ok(layerGroupService.getAll());
    }

    @PostMapping
    public ApiResponse<LayerGroupResponse> create(@Valid @RequestBody LayerGroupRequest req) {
        return ApiResponse.ok(layerGroupService.create(req));
    }

    @PutMapping("/{id}")
    public ApiResponse<LayerGroupResponse> update(@PathVariable Long id, @Valid @RequestBody LayerGroupRequest req) {
        return ApiResponse.ok(layerGroupService.update(id, req));
    }

    @DeleteMapping("/{id}")
    public ApiResponse<Void> delete(@PathVariable Long id) {
        layerGroupService.delete(id);
        return ApiResponse.ok(null);
    }
}
