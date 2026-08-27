package com.gtp.domain.log.dto;

import lombok.Getter;
import lombok.NoArgsConstructor;

@Getter
@NoArgsConstructor
public class AccessLogRequest {
    private String path;
    private String pageTitle;
}
