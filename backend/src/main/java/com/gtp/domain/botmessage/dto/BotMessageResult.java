package com.gtp.domain.botmessage.dto;

import lombok.AllArgsConstructor;
import lombok.Getter;

@Getter
@AllArgsConstructor
public class BotMessageResult {
    /** null 이면 무응답 */
    private final String reply;

    public static BotMessageResult of(String reply) {
        return new BotMessageResult(reply);
    }

    public static BotMessageResult silent() {
        return new BotMessageResult(null);
    }
}
