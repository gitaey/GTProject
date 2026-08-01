package com.gtp.domain.map.dto;

import com.gtp.domain.map.entity.Layer;
import lombok.Getter;

import java.time.LocalDateTime;

@Getter
public class LayerResponse {

    private final Long id;
    private final String name;
    private final String type;
    private final String sourceType;
    private final String url;
    private final String layerName;
    private final String styleName;
    private final String styleConfig;
    private final String format;
    private final String projection;
    private final Integer minZoom;
    private final Integer maxZoom;
    private final double opacity;
    private final boolean visible;
    private final int sortOrder;
    private final Long groupId;
    private final String groupName;
    private final String description;
    private final LocalDateTime createdAt;
    private final LocalDateTime updatedAt;

    public LayerResponse(Layer l) {
        this.id          = l.getId();
        this.name        = l.getName();
        this.type        = l.getType();
        this.sourceType  = l.getSourceType();
        this.url         = l.getUrl();
        this.layerName   = l.getLayerName();
        this.styleName   = l.getStyleName();
        this.styleConfig = l.getStyleConfig();
        this.format      = l.getFormat();
        this.projection  = l.getProjection();
        this.minZoom     = l.getMinZoom();
        this.maxZoom     = l.getMaxZoom();
        this.opacity     = l.getOpacity();
        this.visible     = l.isVisible();
        this.sortOrder   = l.getSortOrder();
        this.groupId     = l.getGroup() != null ? l.getGroup().getId() : null;
        this.groupName   = l.getGroupName();
        this.description = l.getDescription();
        this.createdAt   = l.getCreatedAt();
        this.updatedAt   = l.getUpdatedAt();
    }
}
