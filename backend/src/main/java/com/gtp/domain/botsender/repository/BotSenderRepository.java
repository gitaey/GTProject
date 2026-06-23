package com.gtp.domain.botsender.repository;

import com.gtp.domain.botsender.entity.BotSender;
import com.gtp.domain.botsender.entity.BotSenderRole;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface BotSenderRepository extends JpaRepository<BotSender, Long> {
    List<BotSender> findAllByOrderByLastSeenAtDesc();
    List<BotSender> findBySenderRole(BotSenderRole role);
    Optional<BotSender> findBySenderName(String senderName);
    boolean existsBySenderName(String senderName);
}
