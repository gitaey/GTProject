package com.gtp.domain.botsender.dto;

import com.gtp.domain.botsender.entity.BotSenderRole;
import lombok.Getter;
import lombok.NoArgsConstructor;

@Getter
@NoArgsConstructor
public class BotSenderRequest {
    private String senderName;
    private BotSenderRole senderRole;
    private String memo;
}
