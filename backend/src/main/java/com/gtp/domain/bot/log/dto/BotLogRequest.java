package com.gtp.domain.bot.log.dto;

import com.gtp.domain.bot.log.entity.BotLogType;
import lombok.Getter;
import lombok.NoArgsConstructor;

@Getter
@NoArgsConstructor
public class BotLogRequest {
    private BotLogType type;
    private String room;
    private String sender;
    private String command;
    private String detail;
    private boolean success;
}
