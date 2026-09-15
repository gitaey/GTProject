package com.gtp.domain.mymap.dto;

import lombok.Builder;
import lombok.Getter;

@Getter
@Builder
public class UserMapUploadResponse {
    private Long id;
    private String name;
    private String status;
}
