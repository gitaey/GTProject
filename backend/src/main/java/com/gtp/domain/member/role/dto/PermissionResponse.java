package com.gtp.domain.member.role.dto;

import com.gtp.domain.member.role.entity.PermissionEntity;
import lombok.Getter;

@Getter
public class PermissionResponse {
    private final String code;
    private final String roleCode;
    private final String label;
    private final int sortOrder;

    public PermissionResponse(PermissionEntity e) {
        this.code = e.getCode();
        this.roleCode = e.getRoleCode();
        this.label = e.getLabel();
        this.sortOrder = e.getSortOrder();
    }
}
