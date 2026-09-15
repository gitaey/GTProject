package com.gtp.domain.mymap.entity;

import jakarta.persistence.*;
import lombok.*;

/**
 * 나만의지도를 특정 역할(role)에게 공유 — roleCode는 문자열로만 저장하고
 * Role 엔티티는 참조하지 않는다 (문자열 비교만 수행).
 */
@Entity
@Table(name = "tbl_user_map_permission_access",
        uniqueConstraints = @UniqueConstraint(columnNames = {"role_code", "user_map_id"}))
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@Builder
@AllArgsConstructor
public class UserMapPermissionAccess {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "role_code", nullable = false, length = 50)
    private String roleCode;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "user_map_id", nullable = false)
    private UserMap userMap;
}
