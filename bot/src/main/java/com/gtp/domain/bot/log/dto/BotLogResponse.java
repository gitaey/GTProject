package com.gtp.domain.bot.log.dto;

import com.gtp.domain.bot.log.entity.BotLog;
import com.gtp.domain.bot.log.entity.BotLogType;
import lombok.Getter;

import java.time.LocalDateTime;

@Getter
public class BotLogResponse {
    private Long id;
    private BotLogType type;
    private String room;
    private String sender;
    private String command;
    private String detail;
    private boolean success;
    private LocalDateTime createdAt;

    public BotLogResponse(BotLog log) {
        this.id = log.getId();
        this.type = log.getType();
        this.room = log.getRoom();
        this.sender = log.getSender();
        this.command = log.getCommand();
        this.detail = log.getDetail();
        this.success = log.isSuccess();
        this.createdAt = log.getCreatedAt();
    }
}
