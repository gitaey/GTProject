package com.gtp.domain.geoserver.dto;

import lombok.AllArgsConstructor;
import lombok.Getter;

@Getter
@AllArgsConstructor
public class LayerWithStyle {
    private String name;
    private String currentStyle;
}
