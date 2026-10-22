package com.gtp.domain.mymap.repository;

import com.gtp.domain.mymap.entity.UserMap;
import com.gtp.domain.mymap.entity.UserMapPermissionAccess;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Collection;
import java.util.List;

public interface UserMapPermissionAccessRepository extends JpaRepository<UserMapPermissionAccess, Long> {
    List<UserMapPermissionAccess> findAllByRoleCodeIn(List<String> roleCodes);
    List<UserMapPermissionAccess> findAllByUserMap(UserMap userMap);
    List<UserMapPermissionAccess> findAllByUserMapIn(Collection<UserMap> userMaps);
    void deleteByUserMap(UserMap userMap);

    /** 레이어별 그룹(역할) 공유 수 — [user_map_id, count] 쌍 */
    @Query("select p.userMap.id, count(p) from UserMapPermissionAccess p where p.userMap.id in :ids group by p.userMap.id")
    List<Object[]> countByUserMapIds(@Param("ids") Collection<Long> ids);
}
