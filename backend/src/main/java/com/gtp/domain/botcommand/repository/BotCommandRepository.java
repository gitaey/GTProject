package com.gtp.domain.botcommand.repository;

import com.gtp.domain.botcommand.entity.BotCommand;
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
