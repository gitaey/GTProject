package com.gtp.domain.member.role.controller;

import com.gtp.domain.member.role.dto.*;
import com.gtp.domain.member.role.service.RoleService;
import com.gtp.global.response.ApiResponse;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/roles")
@RequiredArgsConstructor
public class RoleController {

    private final RoleService roleService;

    @GetMapping
    public ApiResponse<List<RoleResponse>> getRoles() {
        return ApiResponse.ok(roleService.getAllRoles());
    }

    @PostMapping
    public ApiResponse<RoleResponse> createRole(@Valid @RequestBody RoleCreateRequest req) {
        return ApiResponse.ok(roleService.createRole(req));
    }

    @PutMapping("/{code}")
    public ApiResponse<RoleResponse> updateRole(@PathVariable String code, @Valid @RequestBody RoleUpdateRequest req) {
        return ApiResponse.ok(roleService.updateRole(code, req));
    }

    @DeleteMapping("/{code}")
    public ApiResponse<Void> deleteRole(@PathVariable String code) {
        roleService.deleteRole(code);
        return ApiResponse.ok(null);
    }

    @GetMapping("/{roleCode}/permissions")
    public ApiResponse<List<PermissionResponse>> getPermissions(@PathVariable String roleCode) {
        return ApiResponse.ok(roleService.getPermissions(roleCode));
    }

    @PostMapping("/{roleCode}/permissions")
    public ApiResponse<PermissionResponse> createPermission(
            @PathVariable String roleCode,
            @Valid @RequestBody PermissionCreateRequest req) {
        return ApiResponse.ok(roleService.createPermission(roleCode, req));
    }

    @PutMapping("/permissions/{code}")
    public ApiResponse<PermissionResponse> updatePermission(
            @PathVariable String code,
            @Valid @RequestBody PermissionUpdateRequest req) {
        return ApiResponse.ok(roleService.updatePermission(code, req));
    }

    @DeleteMapping("/permissions/{code}")
    public ApiResponse<Void> deletePermission(@PathVariable String code) {
        roleService.deletePermission(code);
        return ApiResponse.ok(null);
    }
}
