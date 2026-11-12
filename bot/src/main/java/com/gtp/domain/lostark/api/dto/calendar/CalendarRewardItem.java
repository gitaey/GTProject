package com.gtp.domain.lostark.api.dto.calendar;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.Getter;

import java.util.List;

@Getter
@JsonIgnoreProperties(ignoreUnknown = true)
public class CalendarRewardItem {
    @JsonProperty("ItemLevel")
    private Integer itemLevel;
    @JsonProperty("Items")
    private List<CalendarRewardEntry> items;
}
