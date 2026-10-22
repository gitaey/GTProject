package com.gtp.domain.mymap.repository;

import com.gtp.domain.mymap.entity.UserMap;
import com.gtp.domain.mymap.entity.UserMapUserAccess;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Collection;
import java.util.List;

public interface UserMapUserAccessRepository extends JpaRepository<UserMapUserAccess, Long> {
    List<UserMapUserAccess> findAllByUserId(String userId);
    List<UserMapUserAccess> findAllByUserMap(UserMap userMap);
    List<UserMapUserAccess> findAllByUserMapIn(Collection<UserMap> userMaps);
    void deleteByUserMap(UserMap userMap);

    /** 레이어별 사용자 공유 수 — [user_map_id, count] 쌍 */
    @Query("select a.userMap.id, count(a) from UserMapUserAccess a where a.userMap.id in :ids group by a.userMap.id")
    List<Object[]> countByUserMapIds(@Param("ids") Collection<Long> ids);
}
