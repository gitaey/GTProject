package com.gtp.domain.map.dto;

import com.gtp.domain.map.entity.LayerGroup;
import lombok.Getter;

import java.util.ArrayList;
import java.util.List;

@Getter
public class LayerGroupResponse {

    private final Long id;
    private final String name;
    private final Long parentId;
    private final int sortOrder;
    private final List<LayerGroupResponse> children;
    private final List<LayerResponse> layers;

    public LayerGroupResponse(LayerGroup g) {
        this.id        = g.getId();
        this.name      = g.getName();
        this.parentId  = g.getParentId();
        this.sortOrder = g.getSortOrder();
        this.children  = new ArrayList<>();
        this.layers    = new ArrayList<>();
    }
}
