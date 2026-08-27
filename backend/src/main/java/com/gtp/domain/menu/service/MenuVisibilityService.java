package com.gtp.domain.menu.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.gtp.domain.member.user.entity.Permission;
import com.gtp.domain.member.user.entity.Role;
import com.gtp.domain.menu.entity.MenuVisibility;
import com.gtp.domain.menu.repository.MenuVisibilityRepository;
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

    // DB에 없을 때 반환할 기본 메뉴 목록
    private static final Map<String, List<String>> DEFAULT_MENUS = Map.of(
        "SUPER_ADMIN", List.of(
            "sidebar.home", "sidebar.map-view", "sidebar.map-layer",
            "sidebar.map-menu", "sidebar.map-permission",
            "sidebar.blog-view", "sidebar.blog-admin", "sidebar.blog-category",
            "sidebar.bot-log", "sidebar.bot-command", "sidebar.bot-schedule", "sidebar.bot-room",
            "sidebar.geoserver-publish", "sidebar.geoserver-styles",
            "sidebar.system-user", "sidebar.system-access-log", "sidebar.system-menu",
            "map.panel.layer", "map.panel.image", "map.panel.etc",
            "map.tool.zoom", "map.tool.draw", "map.tool.measure-distance",
            "map.tool.measure-area", "map.tool.radius-search", "map.tool.clear"
        ),
        "MAP_ADMIN", List.of(
            "sidebar.home", "sidebar.map-view", "sidebar.map-layer",
            "sidebar.geoserver-publish", "sidebar.geoserver-styles",
            "map.panel.layer", "map.panel.image", "map.panel.etc",
            "map.tool.zoom", "map.tool.draw", "map.tool.measure-distance",
            "map.tool.measure-area", "map.tool.radius-search", "map.tool.clear"
        ),
        "MAP_USER_VIEWER", List.of(
            "sidebar.home", "sidebar.map-view",
            "map.panel.layer", "map.panel.etc",
            "map.tool.zoom", "map.tool.measure-distance", "map.tool.measure-area"
        ),
        "MAP_USER_DEPT_A", List.of(
            "sidebar.home", "sidebar.map-view",
            "map.panel.layer", "map.panel.image", "map.panel.etc",
            "map.tool.zoom", "map.tool.draw", "map.tool.measure-distance",
            "map.tool.measure-area", "map.tool.radius-search", "map.tool.clear"
        ),
        "MAP_USER_DEPT_B", List.of(
            "sidebar.home", "sidebar.map-view",
            "map.panel.layer", "map.panel.image", "map.panel.etc",
            "map.tool.zoom", "map.tool.draw", "map.tool.measure-distance",
            "map.tool.measure-area", "map.tool.radius-search", "map.tool.clear"
        )
    );

    /**
     * role + permission 조합으로 menuIds 조회.
     * DB에 없으면 DEFAULT_MENUS에서 기본값 반환.
     */
    public List<String> getMenuIds(Role role, Permission permission) {
        Optional<MenuVisibility> opt = menuVisibilityRepository.findByRoleAndPermission(role, permission);

        if (opt.isPresent()) {
            return parseMenuIds(opt.get().getMenuIds());
        }

        // 기본값 키 생성: SUPER_ADMIN, MAP_ADMIN, MAP_USER_VIEWER, MAP_USER_DEPT_A, MAP_USER_DEPT_B
        String defaultKey = buildDefaultKey(role, permission);
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
    public void updateMenuIds(Role role, Permission permission, List<String> menuIds) {
        String menuIdsJson = serializeMenuIds(menuIds);

        menuVisibilityRepository.findByRoleAndPermission(role, permission)
            .ifPresentOrElse(
                existing -> existing.updateMenuIds(menuIdsJson),
                () -> menuVisibilityRepository.save(
                    MenuVisibility.builder()
                        .role(role)
                        .permission(permission)
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

    private String buildDefaultKey(Role role, Permission permission) {
        if (role == Role.SUPER_ADMIN) return "SUPER_ADMIN";
        if (role == Role.MAP_ADMIN) return "MAP_ADMIN";
        if (role == Role.MAP_USER && permission != null) {
            return "MAP_USER_" + permission.name();
        }
        throw new CustomException(ErrorCode.INVALID_INPUT);
    }
}
