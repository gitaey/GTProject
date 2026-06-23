package com.gtp.domain.user.entity;

import lombok.Getter;
import lombok.RequiredArgsConstructor;

@Getter
@RequiredArgsConstructor
public enum Permission {

    // 지도 사용자 세부 권한 (MAP_USER 전용)
    VIEWER("뷰어", Role.MAP_USER),   // 보기 전용, 레이어 컨트롤 불가
    DEPT_A("부서A", Role.MAP_USER),  // 레이어 컨트롤 가능
    DEPT_B("부서B", Role.MAP_USER);  // 레이어 컨트롤 가능

    private final String label;
    private final Role role;

    /* 특정 Role에 속하는 세부 권한 목록 반환 */
    public static Permission[] getByRole(Role role) {
        return java.util.Arrays.stream(values())
                .filter(p -> p.role == role)
                .toArray(Permission[]::new);
    }

    /* 레이어 직접 컨트롤 가능 여부 */
    public boolean canControlLayer() {
        return this != VIEWER;
    }

    /* 해당 Permission이 role에 속하는지 검증 */
    public boolean belongsTo(Role role) {
        return this.role == role;
    }
}
