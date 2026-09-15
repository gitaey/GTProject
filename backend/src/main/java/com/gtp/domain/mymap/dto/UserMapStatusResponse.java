package com.gtp.domain.mymap.dto;

import lombok.Builder;
import lombok.Getter;

@Getter
@Builder
public class UserMapStatusResponse {
    private Long id;
    private String status;
    private String errorMessage;
    private int featureCount;
}
