package com.gtp.domain.menu.controller;

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
        if (!StringUtils.hasText(role)) throw new CustomException(ErrorCode.INVALID_INPUT);
        List<String> menuIds = menuVisibilityService.getMenuIds(role, permission);
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
        if (!StringUtils.hasText(req.getRole())) throw new CustomException(ErrorCode.INVALID_INPUT);
        menuVisibilityService.updateMenuIds(req.getRole(), req.getPermission(), req.getMenuIds());
        return ApiResponse.ok(new MenuVisibilityResponse(req.getRole(), req.getPermission(), req.getMenuIds()));
    }
}
