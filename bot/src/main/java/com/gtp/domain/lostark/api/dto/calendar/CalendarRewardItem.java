package com.gtp.domain.lostark.api.dto.calendar;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.Getter;

@Getter
@JsonIgnoreProperties(ignoreUnknown = true)
public class CalendarRewardItem {
    @JsonProperty("Name")
    private String name;
    @JsonProperty("Grade")
    private String grade;
}
