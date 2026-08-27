package com.gtp.domain.log.dto;

import lombok.AllArgsConstructor;
import lombok.Getter;

@Getter
@AllArgsConstructor
public class AccessLogStatsResponse {
    private String userId;
    private Long visitCount;
}
