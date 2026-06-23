package com.gtp.domain.botschedule.repository;

import com.gtp.domain.botschedule.entity.BotSchedule;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface BotScheduleRepository extends JpaRepository<BotSchedule, Long> {
    List<BotSchedule> findAllByOrderByCreatedAtDesc();
    List<BotSchedule> findByActiveTrue();
}
