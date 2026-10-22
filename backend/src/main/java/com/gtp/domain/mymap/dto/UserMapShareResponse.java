package com.gtp.domain.mymap.dto;

import lombok.Builder;
import lombok.Getter;

import java.util.List;

/**
 * 단일 레이어의 현재 공유. userIds·roleCodes는 옛 호스트용(그대로 유지),
 * users·roles는 같은 순서에 이름·상태를 붙인 것.
 */
@Getter
@Builder
public class UserMapShareResponse {
    private List<String> userIds;
    private List<String> roleCodes;
    private List<ShareUserState> users;
    private List<ShareRoleState> roles;
}
