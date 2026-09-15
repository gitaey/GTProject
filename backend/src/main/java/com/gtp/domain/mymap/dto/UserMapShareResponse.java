package com.gtp.domain.mymap.dto;

import lombok.Builder;
import lombok.Getter;

import java.util.List;

@Getter
@Builder
public class UserMapShareResponse {
    private List<String> userIds;
    private List<String> roleCodes;
}
