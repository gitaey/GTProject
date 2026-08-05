package com.gtp.domain.bot.room.dto;

import com.gtp.domain.bot.room.entity.BotRoomStatus;
import lombok.Getter;
import lombok.NoArgsConstructor;

@Getter
@NoArgsConstructor
public class BotRoomRequest {
    private String roomName;
    private BotRoomStatus status;
    private String memo;
}
