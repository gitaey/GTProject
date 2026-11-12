package com.gtp.domain.lostark.api.dto.calendar;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import lombok.Getter;

@Getter
@JsonIgnoreProperties(ignoreUnknown = true)
public class CalendarRewardItem {
    private String Name;
    private String Grade;
}
