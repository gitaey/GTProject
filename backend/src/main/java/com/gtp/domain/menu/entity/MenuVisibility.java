package com.gtp.domain.menu.entity;

import com.gtp.domain.member.user.entity.Permission;
import com.gtp.domain.member.user.entity.Role;
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

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private Role role;

    @Enumerated(EnumType.STRING)
    @Column(nullable = true)
    private Permission permission; // MAP_USER일 때만 사용, 나머지는 null

    @Column(columnDefinition = "TEXT", nullable = false)
    private String menuIds; // JSON array: ["sidebar.home","map.panel.layer",...]

    public void updateMenuIds(String menuIds) {
        this.menuIds = menuIds;
    }
}
