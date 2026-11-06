package com.gtp.domain.geoserver.dto;

import lombok.AllArgsConstructor;
import lombok.Getter;

/** 그룹 영역. crs는 'EPSG:4326' 같은 글자, 못 읽으면 null. */
@Getter
@AllArgsConstructor
public class LayerGroupBounds {
    private final double minx;
    private final double miny;
    private final double maxx;
    private final double maxy;
    private final String crs;
}
