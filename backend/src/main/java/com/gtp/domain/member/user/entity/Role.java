package com.gtp.domain.member.user.entity;

import lombok.Getter;
import lombok.RequiredArgsConstructor;

@Getter
@RequiredArgsConstructor
public enum Role {

    SUPER_ADMIN("슈퍼관리자"),
    MAP_ADMIN("지도관리자"),
    MAP_USER("지도사용자");

    private final String label;
}
