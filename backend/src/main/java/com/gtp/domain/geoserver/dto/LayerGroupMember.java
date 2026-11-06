package com.gtp.domain.geoserver.dto;

import lombok.AllArgsConstructor;
import lombok.Getter;

/** 그룹 안의 항목 하나. type은 layer·layerGroup 또는 GeoServer가 준 그 밖의 값, style이 null이면 레이어 기본 스타일. */
@Getter
@AllArgsConstructor
public class LayerGroupMember {
    private final String type;
    private final String name;
    private final String style;
}
