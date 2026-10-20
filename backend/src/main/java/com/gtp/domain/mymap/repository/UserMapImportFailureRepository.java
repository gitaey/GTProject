package com.gtp.domain.mymap.repository;

import com.gtp.domain.mymap.entity.UserMapImportFailure;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;

public interface UserMapImportFailureRepository extends JpaRepository<UserMapImportFailure, Long> {

    Page<UserMapImportFailure> findByUserMapId(Long userMapId, Pageable pageable);

    Page<UserMapImportFailure> findByUserMapIdAndReasonCode(Long userMapId, String reasonCode, Pageable pageable);

    /** [사유 코드, 건수] 목록 */
    @Query("select f.reasonCode, count(f) from UserMapImportFailure f where f.userMapId = :id group by f.reasonCode")
    List<Object[]> countByReason(@Param("id") Long userMapId);

    @Modifying
    @Query("delete from UserMapImportFailure f where f.userMapId = :id")
    int deleteByUserMapId(@Param("id") Long userMapId);
}
