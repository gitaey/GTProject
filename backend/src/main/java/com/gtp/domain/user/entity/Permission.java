package com.gtp.domain.user.entity;

import lombok.Getter;
import lombok.RequiredArgsConstructor;

@Getter
@RequiredArgsConstructor
public enum Permission {

    // 일반 사용자 세부 권한
    USER_PERMISSION_1("권한1", Role.USER),
    USER_PERMISSION_2("권한2", Role.USER),
    USER_PERMISSION_3("권한3", Role.USER),

    // 로스트아크 세부 권한
    LOSTARK_OPERATOR("운영진", Role.LOSTARK),
    LOSTARK_GUILD("길드원", Role.LOSTARK),
    LOSTARK_GUEST("손님", Role.LOSTARK);

    private final String label;
    private final Role role; // 해당 권한이 속한 역할

    /* 특정 Role에 속하는 세부 권한 목록 반환 */
    public static Permission[] getByRole(Role role) {
        return java.util.Arrays.stream(values())
                .filter(p -> p.role == role)
                .toArray(Permission[]::new);
    }

    /* 해당 Permission이 role에 속하는지 검증 */
    public boolean belongsTo(Role role) {
        return this.role == role;
    }
}
