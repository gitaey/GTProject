package com.gtp.domain.member.role.service;

import com.gtp.domain.member.role.dto.PermissionCreateRequest;
import com.gtp.domain.member.role.entity.PermissionEntity;
import com.gtp.domain.member.role.entity.RoleEntity;
import com.gtp.domain.member.role.repository.PermissionRepository;
import com.gtp.domain.member.role.repository.RoleRepository;
import com.gtp.global.exception.CustomException;
import com.gtp.global.exception.ErrorCode;
import org.junit.jupiter.api.Test;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.test.util.ReflectionTestUtils;

import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/** 공유 그룹 코드가 "역할:세부권한"이라 세부권한 코드에는 ':'를 쓸 수 없다. */
class RoleServicePermissionCodeTest {

    RoleRepository roles = mock(RoleRepository.class);
    PermissionRepository perms = mock(PermissionRepository.class);
    RoleService service = new RoleService(roles, perms);

    private static PermissionCreateRequest req(String code) {
        PermissionCreateRequest r = new PermissionCreateRequest();
        ReflectionTestUtils.setField(r, "code", code);
        ReflectionTestUtils.setField(r, "label", "라벨");
        return r;
    }

    @Test
    void 콜론이_든_세부권한_코드는_만들_수_없다() {
        when(roles.findById("MAP_USER")).thenReturn(Optional.of(mock(RoleEntity.class)));
        assertThatThrownBy(() -> service.createPermission("MAP_USER", req("DEPT:X")))
                .isInstanceOfSatisfying(CustomException.class, e -> assertThat(e.getErrorCode()).isEqualTo(ErrorCode.INVALID_PERMISSION_CODE));
        verify(perms, never()).save(any());
    }

    @Test
    void 현재_사용자의_슈퍼_판정은_ROLE_권한만_역할_표에서_조회한다() {
        SecurityContextHolder.getContext().setAuthentication(new UsernamePasswordAuthenticationToken("alice", null,
                List.of(new SimpleGrantedAuthority("ROLE_MAP_USER"), new SimpleGrantedAuthority("PERM_DEPT_A"))));
        try {
            when(roles.findById("MAP_USER")).thenReturn(Optional.of(RoleEntity.builder().code("MAP_USER").isSuper(false).build()));
            assertThat(service.isCurrentUserSuper()).isFalse();
            verify(roles).findById("MAP_USER");
            verify(roles, never()).findById("PERM_DEPT_A");
            verify(roles, never()).findById("DEPT_A");
            when(roles.findById("SUPER_ADMIN")).thenReturn(Optional.of(RoleEntity.builder().code("SUPER_ADMIN").isSuper(true).build()));
            SecurityContextHolder.getContext().setAuthentication(new UsernamePasswordAuthenticationToken("root", null,
                    List.of(new SimpleGrantedAuthority("ROLE_SUPER_ADMIN"))));
            assertThat(service.isCurrentUserSuper()).isTrue();
        } finally {
            SecurityContextHolder.clearContext();
        }
    }

    @Test
    void 콜론이_없으면_그대로_만든다() {
        when(roles.findById("MAP_USER")).thenReturn(Optional.of(mock(RoleEntity.class)));
        when(perms.existsById("DEPT_C")).thenReturn(false);
        when(perms.save(any())).thenAnswer(i -> i.getArgument(0, PermissionEntity.class));
        assertThat(service.createPermission("MAP_USER", req("DEPT_C")).getCode()).isEqualTo("DEPT_C");
        verify(perms).save(any());
    }
}
