package com.gtp.domain.member.role.entity;

import jakarta.persistence.*;
import lombok.*;

@Entity
@Table(name = "tbl_permission")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class PermissionEntity {

    @Id
    @Column(name = "code", length = 30)
    private String code;

    @Column(name = "role_code", nullable = false, length = 30)
    private String roleCode;

    @Column(name = "label", nullable = false, length = 50)
    private String label;

    @Column(name = "sort_order", nullable = false)
    private int sortOrder;

    public void update(String label, int sortOrder) {
        this.label = label;
        this.sortOrder = sortOrder;
    }
}
