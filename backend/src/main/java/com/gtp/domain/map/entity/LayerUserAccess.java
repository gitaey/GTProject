package com.gtp.domain.map.entity;

import jakarta.persistence.*;
import lombok.*;

/**
 * 사용자별 레이어 접근 설정 — userId는 문자열(JWT principal)로만 저장하고
 * 다른 도메인의 User 엔티티는 참조하지 않는다.
 */
@Entity
@Table(name = "tbl_layer_user_access",
        uniqueConstraints = @UniqueConstraint(columnNames = {"user_id", "layer_id"}))
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@Builder
@AllArgsConstructor
public class LayerUserAccess {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "user_id", nullable = false, length = 50)
    private String userId;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "layer_id", nullable = false)
    private Layer layer;
}
