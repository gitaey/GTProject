package com.gtp.domain.mymap.entity;

import jakarta.persistence.*;
import lombok.*;

/**
 * 나만의지도를 특정 사용자에게 공유 — userId는 문자열(JWT principal)로만 저장하고
 * 다른 도메인의 User 엔티티는 참조하지 않는다.
 */
@Entity
@Table(name = "tbl_user_map_user_access",
        uniqueConstraints = @UniqueConstraint(columnNames = {"user_id", "user_map_id"}))
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@Builder
@AllArgsConstructor
public class UserMapUserAccess {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "user_id", nullable = false, length = 50)
    private String userId;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "user_map_id", nullable = false)
    private UserMap userMap;
}
