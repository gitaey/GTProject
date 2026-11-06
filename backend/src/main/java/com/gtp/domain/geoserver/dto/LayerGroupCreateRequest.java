package com.gtp.domain.geoserver.dto;

import lombok.Getter;

import java.util.List;

/** 레이어 그룹 만들기 요청. workspace가 null이면 전역. layers는 'ws:layer', 그리는 순서(0 = 맨 아래). */
@Getter
public class LayerGroupCreateRequest {
    private String workspace;
    private String name;
    private String title;
    private String description;
    private String mode;
    private List<String> layers;
}
