package com.gtp.domain.mymap.dto;

import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/** 부분 수정: null인 필드는 그대로 둔다(예전에는 모든 필드를 덮어써서 이름이 null이면 실패했다). */
@Getter
@Setter
@NoArgsConstructor
public class UserMapUpdateRequest {
    private String name;
    private String description;
    private String styleConfig;
    private Boolean visible;
}
