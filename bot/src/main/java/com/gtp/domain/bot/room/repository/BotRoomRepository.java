package com.gtp.domain.bot.room.repository;

import com.gtp.domain.bot.room.entity.BotRoom;
import com.gtp.domain.bot.room.entity.BotRoomStatus;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface BotRoomRepository extends JpaRepository<BotRoom, Long> {
    List<BotRoom> findAllByOrderByLastSeenAtDesc();
    List<BotRoom> findByStatus(BotRoomStatus status);
    Optional<BotRoom> findByRoomName(String roomName);
    boolean existsByRoomName(String roomName);
}
