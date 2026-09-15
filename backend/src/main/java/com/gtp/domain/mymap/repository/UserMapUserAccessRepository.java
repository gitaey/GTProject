package com.gtp.domain.mymap.repository;

import com.gtp.domain.mymap.entity.UserMap;
import com.gtp.domain.mymap.entity.UserMapUserAccess;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface UserMapUserAccessRepository extends JpaRepository<UserMapUserAccess, Long> {
    List<UserMapUserAccess> findAllByUserId(String userId);
    List<UserMapUserAccess> findAllByUserMap(UserMap userMap);
    void deleteByUserMap(UserMap userMap);
}
