package com.gtp.domain.map.entity;

import jakarta.persistence.*;
import lombok.*;

@Entity
@Table(name = "tbl_layer_permission_access",
        uniqueConstraints = @UniqueConstraint(columnNames = {"permission", "layer_id"}))
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@Builder
@AllArgsConstructor
public class LayerPermissionAccess {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, length = 20)
    private String permission; // VIEWER, DEPT_A, DEPT_B

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "layer_id", nullable = false)
    private Layer layer;
}
