package com.gtp.domain.botcommand.dto;

import lombok.Getter;
import lombok.NoArgsConstructor;

@Getter
@NoArgsConstructor
public class BotCommandRequest {
    private String keyword;
    private String description;
    private String response;
    private boolean active;
}
