package com.gtp.domain.bot.command.repository;

import com.gtp.domain.bot.command.entity.BotCommand;
import org.springframework.data.jpa.repository.JpaRepository;

public interface BotCommandRepository extends JpaRepository<BotCommand, Long> {
    java.util.List<BotCommand> findAllByOrderByCreatedAtDesc();
    boolean existsByKeyword(String keyword);
    boolean existsByKeywordAndIdNot(String keyword, Long id);
}
