package com.gtp.domain.member.role.repository;

import com.gtp.domain.member.role.entity.RoleEntity;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface RoleRepository extends JpaRepository<RoleEntity, String> {
    List<RoleEntity> findAllByOrderBySortOrderAsc();
}
