package com.gtp.domain.map.dto;

import jakarta.validation.constraints.NotBlank;
import lombok.Getter;

@Getter
public class LayerGroupRequest {

    @NotBlank
    private String name;

    private Long parentId;

    private int sortOrder;
}
