package com.gtp.domain.bot.schedule.dto;

import com.gtp.domain.bot.schedule.entity.BotSchedule;
import lombok.Getter;

import java.time.LocalDateTime;

@Getter
public class BotScheduleResponse {
    private final Long id;
    private final String title;
    private final String message;
    private final String targetRoom;
    private final Integer dayOfWeek;
    private final String dayOfWeekLabel;
    private final String sendTime;
    private final boolean active;
    private final LocalDateTime lastSentAt;
    private final LocalDateTime createdAt;
    private final LocalDateTime updatedAt;

    private static final String[] DAY_LABELS = {"매일", "월", "화", "수", "목", "금", "토", "일"};

    public BotScheduleResponse(BotSchedule s) {
        this.id            = s.getId();
        this.title         = s.getTitle();
        this.message       = s.getMessage();
        this.targetRoom    = s.getTargetRoom();
        this.dayOfWeek     = s.getDayOfWeek();
        this.dayOfWeekLabel = s.getDayOfWeek() == null ? "매일" : DAY_LABELS[s.getDayOfWeek()];
        this.sendTime      = s.getSendTime();
        this.active        = s.isActive();
        this.lastSentAt    = s.getLastSentAt();
        this.createdAt     = s.getCreatedAt();
        this.updatedAt     = s.getUpdatedAt();
    }
}
