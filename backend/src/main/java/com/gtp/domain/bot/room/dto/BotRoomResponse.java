package com.gtp.domain.bot.room.dto;

import com.gtp.domain.bot.room.entity.BotRoom;
import com.gtp.domain.bot.room.entity.BotRoomStatus;
import lombok.Getter;

import java.time.LocalDateTime;

@Getter
public class BotRoomResponse {
    private final Long id;
    private final String roomName;
    private final BotRoomStatus status;
    private final String statusLabel;
    private final String memo;
    private final LocalDateTime lastSeenAt;
    private final LocalDateTime createdAt;

    public BotRoomResponse(BotRoom r) {
        this.id          = r.getId();
        this.roomName    = r.getRoomName();
        this.status      = r.getStatus();
        this.statusLabel = r.getStatus() == BotRoomStatus.ALLOWED ? "허용" : "차단";
        this.memo        = r.getMemo();
        this.lastSeenAt  = r.getLastSeenAt();
        this.createdAt   = r.getCreatedAt();
    }
}
