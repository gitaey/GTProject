package com.gtp.domain.lostark.dto.armory;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.Getter;

@Getter
@JsonIgnoreProperties(ignoreUnknown = true)
public class SkillItem {

    @JsonProperty("Name")
    private String name;

    @JsonProperty("Icon")
    private String icon;

    @JsonProperty("Level")
    private int level;

    @JsonProperty("Type")
    private String type;

    @JsonProperty("IsAwakening")
    private boolean isAwakening;
}
