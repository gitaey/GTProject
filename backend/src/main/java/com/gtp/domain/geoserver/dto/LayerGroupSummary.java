package com.gtp.domain.geoserver.dto;

import lombok.AllArgsConstructor;
import lombok.Getter;

/** 레이어 그룹 목록의 한 줄. workspace가 null이면 전역 그룹. */
@Getter
@AllArgsConstructor
public class LayerGroupSummary {
    private final String name;
    private final String workspace;
}
