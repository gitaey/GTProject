package com.gtp.domain.mymap.repository;

import com.gtp.domain.mymap.entity.UserMap;
import com.gtp.domain.mymap.entity.UserMapFeature;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;

import java.util.List;

public interface UserMapFeatureRepository extends JpaRepository<UserMapFeature, Long> {
    List<UserMapFeature> findAllByUserMap(UserMap userMap);
    long countByUserMap(UserMap userMap);

    /** 피처가 수만~수십만 건일 수 있어 엔티티를 하나씩 로드해 지우지 않고 벌크 삭제로 처리 */
    @Modifying
    @Query("delete from UserMapFeature f where f.userMap = :userMap")
    void deleteByUserMap(UserMap userMap);
}
