package com.gtp.domain.member.user.dto;

import com.fasterxml.jackson.annotation.JsonFormat;
import com.gtp.domain.member.user.entity.User;
import com.gtp.domain.member.user.entity.UserStatus;
import lombok.Getter;

import java.time.LocalDateTime;

@Getter
public class UserResponse {

    private final String userId;
    private final String userName;
    private final String nickname;
    private final String email;
    private final String role;
    private final String roleLabel;
    private final String permission;
    private final String permissionLabel;
    private final UserStatus status;

    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private final LocalDateTime lastLoginAt;

    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private final LocalDateTime createdAt;

    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private final LocalDateTime updatedAt;

    public UserResponse(User user) {
        this.userId          = user.getUserId();
        this.userName        = user.getUserName();
        this.nickname        = user.getNickname();
        this.email           = user.getEmail();
        this.role            = user.getRoleCode();
        this.roleLabel       = user.getRoleCode(); // 프론트에서 /api/roles로 레이블 조회
        this.permission      = user.getPermissionCode();
        this.permissionLabel = user.getPermissionCode();
        this.status          = user.getStatus();
        this.lastLoginAt     = user.getLastLoginAt();
        this.createdAt       = user.getCreatedAt();
        this.updatedAt       = user.getUpdatedAt();
    }

    public UserResponse(User user, String roleLabel, String permissionLabel) {
        this.userId          = user.getUserId();
        this.userName        = user.getUserName();
        this.nickname        = user.getNickname();
        this.email           = user.getEmail();
        this.role            = user.getRoleCode();
        this.roleLabel       = roleLabel;
        this.permission      = user.getPermissionCode();
        this.permissionLabel = permissionLabel;
        this.status          = user.getStatus();
        this.lastLoginAt     = user.getLastLoginAt();
        this.createdAt       = user.getCreatedAt();
        this.updatedAt       = user.getUpdatedAt();
    }
}
