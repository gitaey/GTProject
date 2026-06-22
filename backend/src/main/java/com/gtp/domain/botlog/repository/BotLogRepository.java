package com.gtp.domain.botlog.repository;

import com.gtp.domain.botlog.entity.BotLog;
import com.gtp.domain.botlog.entity.BotLogType;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

public interface BotLogRepository extends JpaRepository<BotLog, Long> {
    Page<BotLog> findByTypeOrderByCreatedAtDesc(BotLogType type, Pageable pageable);
    Page<BotLog> findAllByOrderByCreatedAtDesc(Pageable pageable);
}
