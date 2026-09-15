package com.gtp.domain.mymap.dto;

import com.gtp.domain.mymap.entity.UserMap;
import lombok.Getter;

import java.time.LocalDateTime;

@Getter
public class UserMapListItem {
    private final Long id;
    private final String name;
    private final String description;
    private final String sourceType;
    private final String geomType;
    private final String status;
    private final boolean visible;
    private final int featureCount;
    private final boolean owner;
    private final String styleConfig;
    private final LocalDateTime createdAt;

    public UserMapListItem(UserMap m, boolean owner) {
        this.id = m.getId();
        this.name = m.getName();
        this.description = m.getDescription();
        this.sourceType = m.getSourceType();
        this.geomType = m.getGeomType();
        this.status = m.getStatus();
        this.visible = m.isVisible();
        this.featureCount = m.getFeatureCount();
        this.owner = owner;
        this.styleConfig = m.getStyleConfig();
        this.createdAt = m.getCreatedAt();
    }
}
