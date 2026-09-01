package com.gtp.domain.menu.entity;

import jakarta.persistence.*;
import lombok.*;

@Entity
@Table(name = "tbl_menu_visibility",
    uniqueConstraints = @UniqueConstraint(columnNames = {"role", "permission"}))
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class MenuVisibility {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "role", nullable = false, length = 30)
    private String roleCode;

    @Column(name = "permission", nullable = true, length = 30)
    private String permissionCode;

    @Column(columnDefinition = "TEXT", nullable = false)
    private String menuIds; // JSON array: ["sidebar.home","map.panel.layer",...]

    public void updateMenuIds(String menuIds) {
        this.menuIds = menuIds;
    }
}
