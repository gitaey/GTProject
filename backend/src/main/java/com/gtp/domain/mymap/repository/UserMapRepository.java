package com.gtp.domain.mymap.repository;

import com.gtp.domain.mymap.entity.UserMap;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Collection;
import java.util.List;

public interface UserMapRepository extends JpaRepository<UserMap, Long> {
    List<UserMap> findAllByOwnerIdOrderByCreatedAtDesc(String ownerId);
    List<UserMap> findAllByOrderByCreatedAtDesc();

    long countByOwnerId(String ownerId);

    long countByOwnerIdAndStatus(String ownerId, String status);

    List<UserMap> findAllByOwnerIdAndFileHashOrderByCreatedAtDesc(String ownerId, String fileHash);

    /**
     * 내가 볼 수 있는 레이어 = 내 것 OR 나에게 공유 OR 내 역할에 공유. 한 번의 SQL로 가린다
     * (예전에는 전체 레이어를 읽어 자바에서 걸렀다). roleCodes는 비어 있으면 안 된다 — 빈 IN 목록을 피하려고
     * 호출하는 쪽이 자리 값을 넣는다(UserMapService.NO_ROLE).
     */
    @Query("""
            select m from UserMap m
            where m.ownerId = :userId
               or m.id in (select a.userMap.id from UserMapUserAccess a where a.userId = :userId)
               or m.id in (select p.userMap.id from UserMapPermissionAccess p where p.roleCode in :roleCodes)
            order by m.createdAt desc, m.id desc
            """)
    List<UserMap> findVisibleTo(@Param("userId") String userId, @Param("roleCodes") Collection<String> roleCodes);
}
