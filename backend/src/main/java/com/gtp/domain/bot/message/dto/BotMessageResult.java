package com.gtp.domain.bot.message.dto;

import lombok.AllArgsConstructor;
import lombok.Getter;

@Getter
@AllArgsConstructor
public class BotMessageResult {
    /** null 이면 무응답 */
    private final String reply;
    /** 이미지 URL (null 이면 이미지 없음) */
    private final String imageUrl;

    public static BotMessageResult of(String reply) {
        return new BotMessageResult(reply, null);
    }

    public static BotMessageResult of(String reply, String imageUrl) {
        return new BotMessageResult(reply, imageUrl);
    }

    public static BotMessageResult silent() {
        return new BotMessageResult(null, null);
    }
}
