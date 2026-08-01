package com.gtp.domain.geoserver.dto;

import lombok.Getter;

@Getter
public class PublishResult {
    private final String layer;
    private final boolean success;
    private final String message;

    public PublishResult(String layer, boolean success, String message) {
        this.layer = layer;
        this.success = success;
        this.message = message;
    }
}
