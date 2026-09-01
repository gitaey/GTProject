package com.gtp.domain.member.role.dto;

import jakarta.validation.constraints.NotBlank;
import lombok.Getter;

@Getter
public class PermissionCreateRequest {
    @NotBlank private String code;
    @NotBlank private String label;
    private int sortOrder;
}
