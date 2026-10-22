package com.gtp.global.gis;

import org.springframework.security.core.Authentication;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.List;

/**
 * GTProject용 GisUserContext 구현. JwtFilter가 넣은 인증 정보
 * (principal = userId 문자열, 권한 = "ROLE_" + role, 세부권한이 있으면 "PERM_" + permission)를 읽는다.
 */
@Component
public class SecurityContextGisUserContext implements GisUserContext {

    private static final String ROLE_PREFIX = "ROLE_";
    private static final String PERM_PREFIX = "PERM_";
    /** 그룹 코드 구분자 — 세부권한 코드에는 ':'를 쓸 수 없다(RoleService.createPermission) */
    static final String GROUP_SEPARATOR = ":";
    private static final String ANONYMOUS_USER = "anonymousUser";

    @Override
    public String currentUserId() {
        Authentication auth = loggedInAuthentication();
        return auth != null ? auth.getName() : null;
    }

    @Override
    public List<String> currentRoleCodes() {
        Authentication auth = loggedInAuthentication();
        if (auth == null) return List.of();
        return withPrefix(auth, ROLE_PREFIX);
    }

    @Override
    public List<String> currentShareGroupCodes() {
        Authentication auth = loggedInAuthentication();
        if (auth == null) return List.of();
        List<String> roles = withPrefix(auth, ROLE_PREFIX);
        List<String> perms = withPrefix(auth, PERM_PREFIX);
        List<String> groups = new ArrayList<>(roles);
        for (String role : roles) {
            for (String perm : perms) {
                groups.add(role + GROUP_SEPARATOR + perm);
            }
        }
        return List.copyOf(groups);
    }

    /** 해당 접두사로 시작하는 권한의 접두사를 뗀 값들(다른 종류의 권한은 건너뛴다) */
    private static List<String> withPrefix(Authentication auth, String prefix) {
        return auth.getAuthorities().stream()
                .map(GrantedAuthority::getAuthority)
                .filter(a -> a != null && a.startsWith(prefix) && a.length() > prefix.length())
                .map(a -> a.substring(prefix.length()))
                .toList();
    }

    private Authentication loggedInAuthentication() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth == null || !auth.isAuthenticated() || ANONYMOUS_USER.equals(auth.getName())) return null;
        return auth;
    }
}
