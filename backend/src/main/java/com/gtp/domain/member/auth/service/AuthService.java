package com.gtp.domain.member.auth.service;

import com.gtp.domain.member.auth.dto.LoginRequest;
import com.gtp.domain.member.auth.dto.LoginResponse;
import com.gtp.domain.member.role.entity.RoleEntity;
import com.gtp.domain.member.role.repository.PermissionRepository;
import com.gtp.domain.member.role.repository.RoleRepository;
import com.gtp.domain.member.user.entity.User;
import com.gtp.domain.member.user.entity.UserStatus;
import com.gtp.domain.member.user.repository.UserRepository;
import com.gtp.global.exception.CustomException;
import com.gtp.global.exception.ErrorCode;
import com.gtp.global.jwt.JwtUtil;
import lombok.RequiredArgsConstructor;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;

@Service
@RequiredArgsConstructor
public class AuthService {

    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;
    private final JwtUtil jwtUtil;
    private final RoleRepository roleRepository;
    private final PermissionRepository permissionRepository;

    /* 로그인 */
    @Transactional
    public LoginResponse login(LoginRequest req) {
        User user = userRepository.findById(req.getUserId())
                .orElseThrow(() -> new CustomException(ErrorCode.INVALID_CREDENTIALS));

        if (!passwordEncoder.matches(req.getPassword(), user.getPassword())) {
            throw new CustomException(ErrorCode.INVALID_CREDENTIALS);
        }

        if (user.getStatus() == UserStatus.INACTIVE) {
            throw new CustomException(ErrorCode.ACCOUNT_INACTIVE);
        }

        user.updateLastLogin(LocalDateTime.now());

        String token = jwtUtil.generateToken(user.getUserId(), user.getRoleCode());
        return toResponse(token, user);
    }

    /* 내 정보 조회 */
    @Transactional(readOnly = true)
    public LoginResponse getMe(String userId) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new CustomException(ErrorCode.USER_NOT_FOUND));

        String token = jwtUtil.generateToken(user.getUserId(), user.getRoleCode());
        return toResponse(token, user);
    }

    private LoginResponse toResponse(String token, User user) {
        String roleLabel = roleRepository.findById(user.getRoleCode())
                .map(RoleEntity::getLabel)
                .orElse(user.getRoleCode());

        String permissionLabel = null;
        if (user.getPermissionCode() != null) {
            permissionLabel = permissionRepository.findById(user.getPermissionCode())
                    .map(p -> p.getLabel())
                    .orElse(user.getPermissionCode());
        }

        return new LoginResponse(
                token,
                user.getUserId(),
                user.getUserName(),
                user.getNickname(),
                user.getRoleCode(),
                roleLabel,
                user.getPermissionCode()
        );
    }
}
