package com.gtp.domain.lostark.api.dto.calendar;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.Getter;

import java.util.List;

@Getter
@JsonIgnoreProperties(ignoreUnknown = true)
public class CalendarContent {
    @JsonProperty("CategoryName")
    private String categoryName;
    @JsonProperty("CategoryCode")
    private Integer categoryCode;
    @JsonProperty("ContentsName")
    private String contentsName;
    @JsonProperty("MinItemLevel")
    private Integer minItemLevel;
    @JsonProperty("StartTimes")
    private List<String> startTimes;
    @JsonProperty("RewardItems")
    private List<CalendarRewardItem> rewardItems;
}
