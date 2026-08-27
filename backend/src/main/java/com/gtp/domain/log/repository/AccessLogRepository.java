package com.gtp.domain.log.repository;

import com.gtp.domain.log.entity.AccessLog;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import java.util.List;

public interface AccessLogRepository extends JpaRepository<AccessLog, Long> {

    Page<AccessLog> findAllByOrderByAccessedAtDesc(Pageable pageable);

    @Query("SELECT a.userId, COUNT(a) FROM AccessLog a GROUP BY a.userId ORDER BY COUNT(a) DESC")
    List<Object[]> countByUserId();
}
