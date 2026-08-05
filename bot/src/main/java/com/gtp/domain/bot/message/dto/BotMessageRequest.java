package com.gtp.domain.bot.message.dto;

import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;

@Getter
@NoArgsConstructor
@AllArgsConstructor
public class BotMessageRequest {
    private String room;
    private String message;
    private String sender;
}
