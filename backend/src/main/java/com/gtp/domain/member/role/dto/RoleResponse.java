package com.gtp.domain.member.role.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import com.gtp.domain.member.role.entity.RoleEntity;
import lombok.Getter;

import java.util.List;

@Getter
public class RoleResponse {
    private final String code;
    private final String label;
    @JsonProperty("hasSubPermission")
    private final boolean hasSubPermission;
    @JsonProperty("isSuper")
    private final boolean isSuper;
    private final int sortOrder;
    private List<PermissionResponse> permissions;

    public RoleResponse(RoleEntity e) {
        this.code = e.getCode();
        this.label = e.getLabel();
        this.hasSubPermission = e.isHasSubPermission();
        this.isSuper = e.isSuper();
        this.sortOrder = e.getSortOrder();
    }

    public RoleResponse withPermissions(List<PermissionResponse> permissions) {
        this.permissions = permissions;
        return this;
    }
}
