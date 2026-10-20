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

    /** 같은 PNU가 두 번 이상 들어간 만큼(= PNU가 있는 피처 수 - 서로 다른 PNU 수) */
    @Query("select count(f) - count(distinct f.pnu) from UserMapFeature f where f.userMap.id = :id and f.pnu is not null")
    long countDuplicatePnu(@org.springframework.data.repository.query.Param("id") Long userMapId);

    /** 피처가 수만~수십만 건일 수 있어 엔티티를 하나씩 로드해 지우지 않고 벌크 삭제로 처리 */
    @Modifying
    @Query("delete from UserMapFeature f where f.userMap = :userMap")
    void deleteByUserMap(UserMap userMap);
}
