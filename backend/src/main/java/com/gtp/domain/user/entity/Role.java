package com.gtp.domain.user.entity;

import lombok.Getter;
import lombok.RequiredArgsConstructor;

@Getter
@RequiredArgsConstructor
public enum Role {

    SUPER_ADMIN("슈퍼관리자"),
    USER("일반 사용자"),
    LOSTARK("로스트아크");

    private final String label;
}
