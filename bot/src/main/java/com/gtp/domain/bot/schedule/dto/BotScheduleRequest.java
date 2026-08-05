package com.gtp.domain.bot.schedule.dto;

import lombok.Getter;
import lombok.NoArgsConstructor;

@Getter
@NoArgsConstructor
public class BotScheduleRequest {
    private String title;
    private String message;
    private String targetRoom;
    private Integer dayOfWeek;
    private String sendTime;
    private boolean active;
}
