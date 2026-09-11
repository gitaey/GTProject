package com.gtp.domain.member.user.service;

import com.gtp.domain.member.role.service.RoleService;
import com.gtp.domain.member.user.dto.UserCreateRequest;
import com.gtp.domain.member.user.dto.UserResponse;
import com.gtp.domain.member.user.dto.UserUpdateRequest;
import com.gtp.domain.member.user.entity.User;
import com.gtp.domain.member.user.entity.UserStatus;
import com.gtp.domain.member.user.repository.UserRepository;
import com.gtp.global.exception.CustomException;
import com.gtp.global.exception.ErrorCode;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.util.List;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class UserService {

    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;
    private final RoleService roleService;

    /* 목록 조회 (검색 + 필터 + 페이징) */
    public Page<UserResponse> getUsers(String keyword, String role, String status, Pageable pageable) {
        String roleCode   = StringUtils.hasText(role) ? role : null;
        UserStatus statusEnum = parseStatus(status);
        String kw         = StringUtils.hasText(keyword) ? keyword : null;

        return userRepository.search(kw, roleCode, statusEnum, pageable)
                .map(UserResponse::new);
    }

    /* 단건 조회 */
    public UserResponse getUser(String userId) {
        return new UserResponse(findById(userId));
    }

    /* 사용자 생성 */
    @Transactional
    public UserResponse createUser(UserCreateRequest req) {
        if (userRepository.existsByUserId(req.getUserId())) {
            throw new CustomException(ErrorCode.DUPLICATE_USER_ID);
        }
        if (StringUtils.hasText(req.getNickname()) && userRepository.existsByNickname(req.getNickname())) {
            throw new CustomException(ErrorCode.DUPLICATE_NICKNAME);
        }
        if (StringUtils.hasText(req.getEmail()) && userRepository.existsByEmail(req.getEmail())) {
            throw new CustomException(ErrorCode.DUPLICATE_EMAIL);
        }

        roleService.assertSuperActionAllowed(req.getRole());
        roleService.validateRolePermission(req.getRole(), req.getPermission());

        User user = User.builder()
                .userId(req.getUserId())
                .userName(StringUtils.hasText(req.getUserName()) ? req.getUserName() : null)
                .nickname(StringUtils.hasText(req.getNickname()) ? req.getNickname() : null)
                .email(StringUtils.hasText(req.getEmail()) ? req.getEmail() : null)
                .password(passwordEncoder.encode(req.getPassword()))
                .roleCode(req.getRole())
                .permissionCode(req.getPermission())
                .status(UserStatus.ACTIVE)
                .build();

        return new UserResponse(userRepository.save(user));
    }

    /* 사용자 수정 */
    @Transactional
    public UserResponse updateUser(String userId, UserUpdateRequest req) {
        User user = findById(userId);
        roleService.assertSuperActionAllowed(user.getRoleCode());
        roleService.assertSuperActionAllowed(req.getRole());

        if (StringUtils.hasText(req.getNickname())
                && !req.getNickname().equals(user.getNickname())
                && userRepository.existsByNickname(req.getNickname())) {
            throw new CustomException(ErrorCode.DUPLICATE_NICKNAME);
        }
        if (StringUtils.hasText(req.getEmail())
                && !req.getEmail().equals(user.getEmail())
                && userRepository.existsByEmail(req.getEmail())) {
            throw new CustomException(ErrorCode.DUPLICATE_EMAIL);
        }

        roleService.validateRolePermission(req.getRole(), req.getPermission());

        user.update(
                StringUtils.hasText(req.getUserName()) ? req.getUserName() : null,
                StringUtils.hasText(req.getNickname()) ? req.getNickname() : null,
                StringUtils.hasText(req.getEmail())    ? req.getEmail()    : null,
                req.getRole(),
                req.getPermission()
        );

        if (StringUtils.hasText(req.getPassword())) {
            user.changePassword(passwordEncoder.encode(req.getPassword()));
        }

        return new UserResponse(user);
    }

    /* 상태 토글 (활성 ↔ 비활성) */
    @Transactional
    public UserResponse toggleStatus(String userId) {
        User user = findById(userId);
        roleService.assertSuperActionAllowed(user.getRoleCode());
        user.toggleStatus();
        return new UserResponse(user);
    }

    /* 사용자 단건 삭제 */
    @Transactional
    public void deleteUser(String userId) {
        User user = findById(userId);
        roleService.assertSuperActionAllowed(user.getRoleCode());
        userRepository.delete(user);
    }

    /* 사용자 일괄 삭제 */
    @Transactional
    public int deleteUsers(List<String> userIds) {
        List<User> users = userRepository.findAllById(userIds);
        if (users.isEmpty()) {
            throw new CustomException(ErrorCode.USER_NOT_FOUND);
        }
        users.forEach(u -> roleService.assertSuperActionAllowed(u.getRoleCode()));
        userRepository.deleteAll(users);
        return users.size();
    }

    /* ────────── 내부 유틸 ────────── */

    private User findById(String userId) {
        return userRepository.findById(userId)
                .orElseThrow(() -> new CustomException(ErrorCode.USER_NOT_FOUND));
    }

    private UserStatus parseStatus(String status) {
        if (!StringUtils.hasText(status)) return null;
        try { return UserStatus.valueOf(status); }
        catch (IllegalArgumentException e) { throw new CustomException(ErrorCode.INVALID_STATUS); }
    }
}
