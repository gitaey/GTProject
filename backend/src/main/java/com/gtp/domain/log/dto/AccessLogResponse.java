package com.gtp.domain.log.dto;

import com.gtp.domain.log.entity.AccessLog;
import lombok.Getter;

import java.time.LocalDateTime;

@Getter
public class AccessLogResponse {

    private final Long id;
    private final String userId;
    private final String path;
    private final String pageTitle;
    private final LocalDateTime accessedAt;

    public AccessLogResponse(AccessLog log) {
        this.id          = log.getId();
        this.userId      = log.getUserId();
        this.path        = log.getPath();
        this.pageTitle   = log.getPageTitle();
        this.accessedAt  = log.getAccessedAt();
    }
}
