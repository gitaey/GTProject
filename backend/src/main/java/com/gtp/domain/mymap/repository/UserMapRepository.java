package com.gtp.domain.mymap.repository;

import com.gtp.domain.mymap.entity.UserMap;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface UserMapRepository extends JpaRepository<UserMap, Long> {
    List<UserMap> findAllByOwnerIdOrderByCreatedAtDesc(String ownerId);
    List<UserMap> findAllByOrderByCreatedAtDesc();
}
