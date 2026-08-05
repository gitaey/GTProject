package com.gtp.domain.bot.log.repository;

import com.gtp.domain.bot.log.entity.BotLog;
import com.gtp.domain.bot.log.entity.BotLogType;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

import java.time.LocalDateTime;
import java.util.List;

public interface BotLogRepository extends JpaRepository<BotLog, Long> {
    Page<BotLog> findByTypeOrderByCreatedAtDesc(BotLogType type, Pageable pageable);
    Page<BotLog> findAllByOrderByCreatedAtDesc(Pageable pageable);

    List<BotLog> findByCreatedAtBetweenOrderByCreatedAtDesc(
            LocalDateTime from, LocalDateTime to);

    List<BotLog> findByTypeAndCreatedAtBetweenOrderByCreatedAtDesc(
            BotLogType type, LocalDateTime from, LocalDateTime to);
}
