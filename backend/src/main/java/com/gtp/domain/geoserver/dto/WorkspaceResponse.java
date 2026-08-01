package com.gtp.domain.geoserver.dto;

import lombok.Getter;

import java.util.List;

@Getter
public class WorkspaceResponse {
    private final List<String> workspaces;

    public WorkspaceResponse(List<String> workspaces) {
        this.workspaces = workspaces;
    }
}
