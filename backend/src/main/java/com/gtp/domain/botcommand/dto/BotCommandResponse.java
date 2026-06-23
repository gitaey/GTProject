package com.gtp.domain.botcommand.dto;

import com.gtp.domain.botcommand.entity.BotCommand;
import lombok.Getter;

import java.time.LocalDateTime;

@Getter
public class BotCommandResponse {
    private final Long id;
    private final String keyword;
    private final String description;
    private final String response;
    private final boolean active;
    private final LocalDateTime createdAt;
    private final LocalDateTime updatedAt;

    public BotCommandResponse(BotCommand c) {
        this.id          = c.getId();
        this.keyword     = c.getKeyword();
        this.description = c.getDescription();
        this.response    = c.getResponse();
        this.active      = c.isActive();
        this.createdAt   = c.getCreatedAt();
        this.updatedAt   = c.getUpdatedAt();
    }
}
