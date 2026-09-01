package com.gtp.domain.member.role.entity;

import jakarta.persistence.*;
import lombok.*;

@Entity
@Table(name = "tbl_role")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class RoleEntity {

    @Id
    @Column(name = "code", length = 30)
    private String code;

    @Column(name = "label", nullable = false, length = 50)
    private String label;

    @Column(name = "has_sub_permission", nullable = false)
    private boolean hasSubPermission;

    @Column(name = "is_super", nullable = false)
    private boolean isSuper;

    @Column(name = "sort_order", nullable = false)
    private int sortOrder;

    public void update(String label, boolean hasSubPermission, boolean isSuper, int sortOrder) {
        this.label = label;
        this.hasSubPermission = hasSubPermission;
        this.isSuper = isSuper;
        this.sortOrder = sortOrder;
    }
}
