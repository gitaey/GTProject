package com.gtp.domain.geoserver.dto;

import lombok.Getter;

@Getter
public class LayerItem {
    private final String name;
    private final boolean published;

    public LayerItem(String name, boolean published) {
        this.name = name;
        this.published = published;
    }
}
