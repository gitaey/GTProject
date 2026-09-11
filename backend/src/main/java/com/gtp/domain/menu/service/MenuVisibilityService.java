package com.gtp.domain.menu.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.gtp.domain.menu.entity.MenuVisibility;
import com.gtp.domain.menu.repository.MenuVisibilityRepository;
import com.gtp.domain.member.role.service.RoleService;
import com.gtp.global.exception.CustomException;
import com.gtp.global.exception.ErrorCode;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Map;
import java.util.Optional;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class MenuVisibilityService {

    private final MenuVisibilityRepository menuVisibilityRepository;
    private final ObjectMapper objectMapper;
    private final RoleService roleService;

    // DB에 없을 때 반환할 기본 메뉴 목록
    private static final Map<String, List<String>> DEFAULT_MENUS = Map.of(
        "SUPER_ADMIN", List.of(
            "sidebar.home", "sidebar.map-view", "sidebar.map-layer",
            "sidebar.map-menu", "sidebar.map-permission",
            "sidebar.blog-view", "sidebar.blog-admin", "sidebar.blog-category",
            "sidebar.bot-log", "sidebar.bot-command", "sidebar.bot-schedule", "sidebar.bot-room",
            "sidebar.geoserver-publish", "sidebar.geoserver-styles",
            "sidebar.system-user", "sidebar.system-access-log", "sidebar.system-menu", "sidebar.system-permission",
            "map.panel.layer", "map.panel.image", "map.panel.etc",
            "map.tool.zoom", "map.tool.draw", "map.tool.measure-distance",
            "map.tool.measure-area", "map.tool.radius-search", "map.tool.wind", "map.tool.clear"
        ),
        "MAP_ADMIN", List.of(
            "sidebar.home", "sidebar.map-view", "sidebar.map-layer",
            "sidebar.geoserver-publish", "sidebar.geoserver-styles",
            "map.panel.layer", "map.panel.image", "map.panel.etc",
            "map.tool.zoom", "map.tool.draw", "map.tool.measure-distance",
            "map.tool.measure-area", "map.tool.radius-search", "map.tool.wind", "map.tool.clear"
        ),
        "MAP_USER_VIEWER", List.of(
            "sidebar.home", "sidebar.map-view",
            "map.panel.layer", "map.panel.etc",
            "map.tool.zoom", "map.tool.measure-distance", "map.tool.measure-area", "map.tool.wind"
        ),
        "MAP_USER_DEPT_A", List.of(
            "sidebar.home", "sidebar.map-view",
            "map.panel.layer", "map.panel.image", "map.panel.etc",
            "map.tool.zoom", "map.tool.draw", "map.tool.measure-distance",
            "map.tool.measure-area", "map.tool.radius-search", "map.tool.wind", "map.tool.clear"
        ),
        "MAP_USER_DEPT_B", List.of(
            "sidebar.home", "sidebar.map-view",
            "map.panel.layer", "map.panel.image", "map.panel.etc",
            "map.tool.zoom", "map.tool.draw", "map.tool.measure-distance",
            "map.tool.measure-area", "map.tool.radius-search", "map.tool.wind", "map.tool.clear"
        )
    );

    /**
     * role + permission 조합으로 menuIds 조회.
     * DB에 없으면 DEFAULT_MENUS에서 기본값 반환.
     */
    public List<String> getMenuIds(String roleCode, String permissionCode) {
        Optional<MenuVisibility> opt = menuVisibilityRepository.findByRoleCodeAndPermissionCode(roleCode, permissionCode);

        if (opt.isPresent()) {
            return parseMenuIds(opt.get().getMenuIds());
        }

        String defaultKey = buildDefaultKey(roleCode, permissionCode);
        List<String> defaults = DEFAULT_MENUS.get(defaultKey);
        if (defaults == null) {
            throw new CustomException(ErrorCode.NOT_FOUND);
        }
        return defaults;
    }

    /**
     * role + permission 조합으로 menuIds 저장(upsert).
     */
    @Transactional
    public void updateMenuIds(String roleCode, String permissionCode, List<String> menuIds) {
        roleService.assertSuperActionAllowed(roleCode);
        String menuIdsJson = serializeMenuIds(menuIds);

        menuVisibilityRepository.findByRoleCodeAndPermissionCode(roleCode, permissionCode)
            .ifPresentOrElse(
                existing -> existing.updateMenuIds(menuIdsJson),
                () -> menuVisibilityRepository.save(
                    MenuVisibility.builder()
                        .roleCode(roleCode)
                        .permissionCode(permissionCode)
                        .menuIds(menuIdsJson)
                        .build()
                )
            );
    }

    /* ────────── 내부 유틸 ────────── */

    private List<String> parseMenuIds(String json) {
        try {
            return objectMapper.readValue(json, new TypeReference<List<String>>() {});
        } catch (JsonProcessingException e) {
            throw new CustomException(ErrorCode.INTERNAL_SERVER_ERROR);
        }
    }

    private String serializeMenuIds(List<String> menuIds) {
        try {
            return objectMapper.writeValueAsString(menuIds);
        } catch (JsonProcessingException e) {
            throw new CustomException(ErrorCode.INTERNAL_SERVER_ERROR);
        }
    }

    private String buildDefaultKey(String roleCode, String permissionCode) {
        if ("SUPER_ADMIN".equals(roleCode)) return "SUPER_ADMIN";
        if ("MAP_ADMIN".equals(roleCode)) return "MAP_ADMIN";
        if ("MAP_USER".equals(roleCode) && permissionCode != null && !permissionCode.isBlank()) {
            return "MAP_USER_" + permissionCode;
        }
        throw new CustomException(ErrorCode.INVALID_INPUT);
    }
}
