package com.gtp.domain.bot.message.dto;

import lombok.Getter;
import lombok.NoArgsConstructor;

@Getter
@NoArgsConstructor
public class BotMessageRequest {
    private String room;
    private String message;
    private String sender;
}
