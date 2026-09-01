package com.gtp.domain.menu.repository;

import com.gtp.domain.menu.entity.MenuVisibility;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface MenuVisibilityRepository extends JpaRepository<MenuVisibility, Long> {
    Optional<MenuVisibility> findByRoleCodeAndPermissionCode(String roleCode, String permissionCode);
}
