package com.gtp.domain.botroom.dto;

import com.gtp.domain.botroom.entity.BotRoomStatus;
import lombok.Getter;
import lombok.NoArgsConstructor;

@Getter
@NoArgsConstructor
public class BotRoomRequest {
    private String roomName;
    private BotRoomStatus status;
    private String memo;
}
