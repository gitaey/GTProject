package com.gtp.domain.botsender.dto;

import com.gtp.domain.botsender.entity.BotSender;
import com.gtp.domain.botsender.entity.BotSenderRole;
import lombok.Getter;

import java.time.LocalDateTime;

@Getter
public class BotSenderResponse {
    private final Long id;
    private final String senderName;
    private final BotSenderRole senderRole;
    private final String senderRoleLabel;
    private final String memo;
    private final LocalDateTime lastSeenAt;
    private final LocalDateTime createdAt;

    public BotSenderResponse(BotSender s) {
        this.id              = s.getId();
        this.senderName      = s.getSenderName();
        this.senderRole      = s.getSenderRole();
        this.senderRoleLabel = switch (s.getSenderRole()) {
            case ADMIN   -> "관리자";
            case BLOCKED -> "차단";
            default      -> "일반";
        };
        this.memo       = s.getMemo();
        this.lastSeenAt = s.getLastSeenAt();
        this.createdAt  = s.getCreatedAt();
    }
}
