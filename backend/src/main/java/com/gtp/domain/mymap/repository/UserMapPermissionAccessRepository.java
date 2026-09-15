package com.gtp.domain.mymap.repository;

import com.gtp.domain.mymap.entity.UserMap;
import com.gtp.domain.mymap.entity.UserMapPermissionAccess;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface UserMapPermissionAccessRepository extends JpaRepository<UserMapPermissionAccess, Long> {
    List<UserMapPermissionAccess> findAllByRoleCodeIn(List<String> roleCodes);
    List<UserMapPermissionAccess> findAllByUserMap(UserMap userMap);
    void deleteByUserMap(UserMap userMap);
}
