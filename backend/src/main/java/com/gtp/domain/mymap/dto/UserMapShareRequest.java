package com.gtp.domain.mymap.dto;

import lombok.Getter;
import lombok.NoArgsConstructor;

import java.util.List;

@Getter
@NoArgsConstructor
public class UserMapShareRequest {
    private List<String> userIds;
    private List<String> roleCodes;
}
