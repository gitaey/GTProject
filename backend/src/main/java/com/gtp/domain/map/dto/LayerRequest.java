package com.gtp.domain.map.dto;

import jakarta.validation.constraints.NotBlank;
import lombok.Getter;

@Getter
public class LayerRequest {

    @NotBlank
    private String name;

    @NotBlank
    private String type;

    @NotBlank
    private String sourceType;

    @NotBlank
    private String url;

    private String layerName;
    private String styleName;
    private String styleConfig;
    private String format;
    private String projection;
    private Integer minZoom;
    private Integer maxZoom;
    private double opacity = 1.0;
    private boolean visible = true;
    private int sortOrder = 0;
    private Long groupId;
    private String description;
}
