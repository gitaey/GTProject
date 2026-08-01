package com.gtp.domain.map.dto;

import lombok.Getter;
import lombok.RequiredArgsConstructor;

import java.util.List;

@Getter
@RequiredArgsConstructor
public class LayerTreeResponse {
    private final List<LayerGroupResponse> groups;
    private final List<LayerResponse> ungroupedLayers;
}
