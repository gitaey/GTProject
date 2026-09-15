package com.gtp.domain.mymap.dto;

import lombok.Getter;
import lombok.NoArgsConstructor;

@Getter
@NoArgsConstructor
public class UserMapUpdateRequest {
    private String name;
    private String description;
    private String styleConfig;
    private boolean visible;
}
