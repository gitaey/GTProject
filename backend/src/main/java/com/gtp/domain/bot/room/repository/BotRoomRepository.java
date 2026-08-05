package com.gtp.domain.bot.room.repository;

import com.gtp.domain.bot.room.entity.BotRoom;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface BotRoomRepository extends JpaRepository<BotRoom, Long> {
    List<BotRoom> findAllByOrderByLastSeenAtDesc();
    boolean existsByRoomName(String roomName);
}
