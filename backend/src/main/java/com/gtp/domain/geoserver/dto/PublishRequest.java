package com.gtp.domain.geoserver.dto;

import lombok.Getter;

import java.util.List;

@Getter
public class PublishRequest {
    private String workspace;
    private String datastore;
    private List<String> layers;
}
