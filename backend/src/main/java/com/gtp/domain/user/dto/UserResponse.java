package com.gtp.domain.user.dto;

import com.fasterxml.jackson.annotation.JsonFormat;
import com.gtp.domain.user.entity.Permission;
import com.gtp.domain.user.entity.Role;
import com.gtp.domain.user.entity.User;
import com.gtp.domain.user.entity.UserStatus;
import lombok.Getter;

import java.time.LocalDateTime;

@Getter
public class UserResponse {

    private final String userId;
    private final String userName;
    private final String nickname;
    private final String email;
    private final Role role;
    private final String roleLabel;
    private final Permission permission;
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
        this.role            = user.getRole();
        this.roleLabel       = user.getRole().getLabel();
        this.permission      = user.getPermission();
        this.permissionLabel = user.getPermission() != null ? user.getPermission().getLabel() : null;
        this.status          = user.getStatus();
        this.lastLoginAt     = user.getLastLoginAt();
        this.createdAt       = user.getCreatedAt();
        this.updatedAt       = user.getUpdatedAt();
    }
}
