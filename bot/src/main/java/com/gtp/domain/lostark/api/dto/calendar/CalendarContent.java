package com.gtp.domain.lostark.api.dto.calendar;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import lombok.Getter;

import java.util.List;

@Getter
@JsonIgnoreProperties(ignoreUnknown = true)
public class CalendarContent {
    private String CategoryName;
    private Integer CategoryCode;
    private String ContentsName;
    private Integer MinItemLevel;
    private List<String> StartTimes;
    private List<CalendarRewardItem> RewardItems;
}
