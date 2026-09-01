package com.gtp.domain.member.role.repository;

import com.gtp.domain.member.role.entity.PermissionEntity;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface PermissionRepository extends JpaRepository<PermissionEntity, String> {
    List<PermissionEntity> findByRoleCodeOrderBySortOrderAsc(String roleCode);
    List<PermissionEntity> findAllByOrderBySortOrderAsc();
    boolean existsByRoleCode(String roleCode);
}
