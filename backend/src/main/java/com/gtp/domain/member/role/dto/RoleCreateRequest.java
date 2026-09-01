package com.gtp.domain.member.role.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import lombok.Getter;

@Getter
public class RoleCreateRequest {
    @NotBlank private String code;
    @NotBlank private String label;
    @NotNull private Boolean hasSubPermission;
    @JsonProperty("isSuper")
    @NotNull private Boolean isSuper;
    private int sortOrder;
}
