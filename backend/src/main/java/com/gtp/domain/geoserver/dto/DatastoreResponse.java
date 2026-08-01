package com.gtp.domain.geoserver.dto;

import lombok.Getter;

import java.util.List;

@Getter
public class DatastoreResponse {
    private final List<String> datastores;

    public DatastoreResponse(List<String> datastores) {
        this.datastores = datastores;
    }
}
