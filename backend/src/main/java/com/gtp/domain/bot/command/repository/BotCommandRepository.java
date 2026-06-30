package com.gtp.domain.bot.command.repository;

import com.gtp.domain.bot.command.entity.BotCommand;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface BotCommandRepository extends JpaRepository<BotCommand, Long> {
    List<BotCommand> findAllByOrderByCreatedAtDesc();
    List<BotCommand> findByActiveTrue();
    Optional<BotCommand> findByKeyword(String keyword);
    boolean existsByKeyword(String keyword);
    boolean existsByKeywordAndIdNot(String keyword, Long id);
}
