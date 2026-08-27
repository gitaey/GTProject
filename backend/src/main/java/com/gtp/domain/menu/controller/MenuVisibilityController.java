package com.gtp.domain.menu.controller;

import com.gtp.domain.member.user.entity.Permission;
import com.gtp.domain.member.user.entity.Role;
import com.gtp.domain.menu.dto.MenuVisibilityRequest;
import com.gtp.domain.menu.dto.MenuVisibilityResponse;
import com.gtp.domain.menu.service.MenuVisibilityService;
import com.gtp.global.exception.CustomException;
import com.gtp.global.exception.ErrorCode;
import com.gtp.global.response.ApiResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.util.StringUtils;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/menu-visibility")
@RequiredArgsConstructor
public class MenuVisibilityController {

    private final MenuVisibilityService menuVisibilityService;

    /**
     * GET /api/menu-visibility?role=MAP_USER&permission=VIEWER
     * 해당 role+permission의 menuIds 반환 (없으면 기본값)
     */
    @GetMapping
    public ApiResponse<MenuVisibilityResponse> getMenuVisibility(
            @RequestParam String role,
            @RequestParam(required = false) String permission
    ) {
        Role roleEnum = parseRole(role);
        Permission permissionEnum = parsePermission(permission);

        List<String> menuIds = menuVisibilityService.getMenuIds(roleEnum, permissionEnum);
        return ApiResponse.ok(new MenuVisibilityResponse(role, permission, menuIds));
    }

    /**
     * PUT /api/menu-visibility  (SUPER_ADMIN만)
     * body: { role, permission, menuIds }
     */
    @PutMapping
    public ApiResponse<MenuVisibilityResponse> updateMenuVisibility(
            @RequestBody MenuVisibilityRequest req
    ) {
        Role roleEnum = parseRole(req.getRole());
        Permission permissionEnum = parsePermission(req.getPermission());

        menuVisibilityService.updateMenuIds(roleEnum, permissionEnum, req.getMenuIds());
        return ApiResponse.ok(new MenuVisibilityResponse(req.getRole(), req.getPermission(), req.getMenuIds()));
    }

    /* ────────── 내부 유틸 ────────── */

    private Role parseRole(String role) {
        if (!StringUtils.hasText(role)) throw new CustomException(ErrorCode.INVALID_INPUT);
        try { return Role.valueOf(role); }
        catch (IllegalArgumentException e) { throw new CustomException(ErrorCode.INVALID_ROLE); }
    }

    private Permission parsePermission(String permission) {
        if (!StringUtils.hasText(permission)) return null;
        try { return Permission.valueOf(permission); }
        catch (IllegalArgumentException e) { throw new CustomException(ErrorCode.INVALID_PERMISSION); }
    }
}
