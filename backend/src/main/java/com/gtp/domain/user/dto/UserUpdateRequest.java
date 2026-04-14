package com.gtp.domain.user.dto;

import com.gtp.domain.user.entity.Permission;
import com.gtp.domain.user.entity.Role;
import jakarta.validation.constraints.*;
import lombok.Getter;

@Getter
public class UserUpdateRequest {

    @Size(max = 50, message = "이름은 최대 50자여야 합니다.")
    private String userName; // 선택 항목

    @Size(max = 30, message = "닉네임은 최대 30자여야 합니다.")
    private String nickname; // 선택 항목

    @Email(message = "올바른 이메일 형식이 아닙니다.")
    private String email; // 선택 항목

    @NotNull(message = "역할은 필수입니다.")
    private Role role;

    /* SUPER_ADMIN은 null, USER/LOSTARK는 필수 (서비스 레이어에서 검증) */
    private Permission permission;

    /* null이면 비밀번호 변경 안 함 */
    @Size(min = 8, message = "비밀번호는 최소 8자 이상이어야 합니다.")
    private String password;
}
