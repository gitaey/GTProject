package com.gtp.domain.member.auth.service;

import com.gtp.domain.member.auth.dto.LoginRequest;
import com.gtp.domain.member.auth.dto.LoginResponse;
import com.gtp.domain.member.role.entity.PermissionEntity;
import com.gtp.domain.member.role.entity.RoleEntity;
import com.gtp.domain.member.role.repository.PermissionRepository;
import com.gtp.domain.member.role.repository.RoleRepository;
import com.gtp.domain.member.user.entity.User;
import com.gtp.domain.member.user.entity.UserStatus;
import com.gtp.domain.member.user.repository.UserRepository;
import com.gtp.global.jwt.JwtUtil;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.util.ReflectionTestUtils;

import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/** 로그인·내 정보 조회가 발급하는 토큰에 세부권한(perm)이 들어가고, 응답 본문 모양은 그대로인지 확인한다. 가짜 비밀값만 쓴다. */
class AuthServicePermClaimTest {

    UserRepository users = mock(UserRepository.class);
    PasswordEncoder encoder = mock(PasswordEncoder.class);
    RoleRepository roles = mock(RoleRepository.class);
    PermissionRepository perms = mock(PermissionRepository.class);
    JwtUtil jwt = new JwtUtil();
    AuthService service;

    @BeforeEach
    void setUp() {
        ReflectionTestUtils.setField(jwt, "secret", "test-only-secret-test-only-secret-test-only-secret-0123456789");
        ReflectionTestUtils.setField(jwt, "expiration", 3_600_000L);
        service = new AuthService(users, encoder, jwt, roles, perms);
        when(encoder.matches(any(), any())).thenReturn(true);
        when(roles.findById("MAP_USER")).thenReturn(Optional.of(RoleEntity.builder().code("MAP_USER").label("지도사용자").build()));
        when(perms.findById("DEPT_A")).thenReturn(Optional.of(PermissionEntity.builder().code("DEPT_A").label("부서A").build()));
    }

    private User user(String id, String perm) {
        return User.builder().userId(id).userName("이름").nickname("별명").password("x").roleCode("MAP_USER")
                .permissionCode(perm).status(UserStatus.ACTIVE).build();
    }

    private LoginRequest login(String id) {
        LoginRequest r = new LoginRequest();
        ReflectionTestUtils.setField(r, "userId", id);
        ReflectionTestUtils.setField(r, "password", "pw");
        return r;
    }

    @Test
    void 로그인_토큰에_세부권한이_들어가고_응답_모양은_그대로() {
        when(users.findById("alice")).thenReturn(Optional.of(user("alice", "DEPT_A")));
        LoginResponse res = service.login(login("alice"));
        assertThat(jwt.parseClaims(res.getToken()).get("role")).isEqualTo("MAP_USER");
        assertThat(jwt.parseClaims(res.getToken()).get("perm")).isEqualTo("DEPT_A");
        assertThat(res.getRole()).isEqualTo("MAP_USER");
        assertThat(res.getRoleLabel()).isEqualTo("지도사용자");
        assertThat(res.getPermission()).isEqualTo("DEPT_A");
    }

    @Test
    void 내_정보_조회가_새로_주는_토큰에도_세부권한이_들어간다() {
        when(users.findById("alice")).thenReturn(Optional.of(user("alice", "DEPT_A")));
        assertThat(jwt.parseClaims(service.getMe("alice").getToken()).get("perm")).isEqualTo("DEPT_A");
    }

    @Test
    void 세부권한이_없는_사용자의_토큰에는_perm이_없다() {
        when(users.findById("bob")).thenReturn(Optional.of(user("bob", null)));
        assertThat(jwt.parseClaims(service.login(login("bob")).getToken()).containsKey("perm")).isFalse();
        assertThat(jwt.parseClaims(service.getMe("bob").getToken()).containsKey("perm")).isFalse();
    }
}
