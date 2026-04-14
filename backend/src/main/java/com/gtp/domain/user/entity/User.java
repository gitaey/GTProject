package com.gtp.domain.user.entity;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.Comment;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

import java.time.LocalDateTime;

@Entity
@Table(name = "tbl_user")
@Comment("사용자 정보")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@Builder
@AllArgsConstructor
public class User {

    @Id
    @Column(name = "user_id", nullable = false, length = 50)
    @Comment("로그인 아이디 (PK, 중복 불가, 최대 50자)")
    private String userId;

    @Column(name = "user_name", length = 50)
    @Comment("사용자 실명 (성명)")
    private String userName;

    @Column(name = "nickname", unique = true, length = 30)
    @Comment("닉네임 (선택, 중복 불가, 최대 30자)")
    private String nickname;

    @Column(name = "email", unique = true, length = 100)
    @Comment("이메일 주소 (선택, 중복 불가, 최대 100자)")
    private String email;

    @Column(name = "password", nullable = false)
    @Comment("BCrypt 암호화된 비밀번호")
    private String password;

    @Enumerated(EnumType.STRING)
    @Column(name = "role", nullable = false, length = 20)
    @Comment("사용자 역할 (SUPER_ADMIN: 슈퍼관리자, USER: 일반 사용자, LOSTARK: 로스트아크)")
    private Role role;

    @Enumerated(EnumType.STRING)
    @Column(name = "permission", length = 30)
    @Comment("역할별 세부 권한 (SUPER_ADMIN은 NULL, USER/LOSTARK는 필수)")
    private Permission permission;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, length = 20)
    @Comment("계정 상태 (ACTIVE: 활성, INACTIVE: 비활성)")
    private UserStatus status;

    @Column(name = "last_login_at")
    @Comment("마지막 로그인 일시 (미로그인 시 NULL)")
    private LocalDateTime lastLoginAt;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    @Comment("계정 생성 일시")
    private LocalDateTime createdAt;

    @UpdateTimestamp
    @Column(name = "updated_at", nullable = false)
    @Comment("계정 최종 수정 일시")
    private LocalDateTime updatedAt;

    /* 정보 수정 */
    public void update(String userName, String nickname, String email, Role role, Permission permission) {
        this.userName   = userName;
        this.nickname   = nickname;
        this.email      = email;
        this.role       = role;
        this.permission = permission;
    }

    /* 비밀번호 변경 */
    public void changePassword(String encodedPassword) {
        this.password = encodedPassword;
    }

    /* 상태 토글 */
    public void toggleStatus() {
        this.status = (this.status == UserStatus.ACTIVE) ? UserStatus.INACTIVE : UserStatus.ACTIVE;
    }

    /* 마지막 로그인 갱신 */
    public void updateLastLogin(LocalDateTime loginAt) {
        this.lastLoginAt = loginAt;
    }
}
