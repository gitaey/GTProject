package com.gtp.domain.wind.dto;

import com.gtp.domain.wind.entity.WindFrameEntity;
import lombok.Getter;

import java.time.LocalDateTime;

@Getter
public class WindFrameMeta {
    private final Long id;
    private final int forecastHour;
    private final LocalDateTime validTime;

    public WindFrameMeta(WindFrameEntity e) {
        this.id = e.getId();
        this.forecastHour = e.getForecastHour();
        this.validTime = e.getValidTime();
    }
}
