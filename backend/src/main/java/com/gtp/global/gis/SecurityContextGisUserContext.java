package com.gtp.global.gis;

import org.springframework.security.core.Authentication;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;

import java.util.List;

/**
 * GTProject용 GisUserContext 구현. JwtFilter가 넣은 인증 정보
 * (principal = userId 문자열, 권한 = "ROLE_" + role)를 읽는다.
 */
@Component
public class SecurityContextGisUserContext implements GisUserContext {

    private static final String ROLE_PREFIX = "ROLE_";
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
        return auth.getAuthorities().stream()
                .map(GrantedAuthority::getAuthority)
                .map(a -> a.startsWith(ROLE_PREFIX) ? a.substring(ROLE_PREFIX.length()) : a)
                .toList();
    }

    private Authentication loggedInAuthentication() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth == null || !auth.isAuthenticated() || ANONYMOUS_USER.equals(auth.getName())) return null;
        return auth;
    }
}
