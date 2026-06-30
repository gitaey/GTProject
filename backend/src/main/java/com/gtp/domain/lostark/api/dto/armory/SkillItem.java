package com.gtp.domain.lostark.api.dto.armory;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.Getter;

import java.util.List;

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

    @JsonProperty("Tripods")
    private List<SkillTripod> tripods;

    @JsonProperty("Rune")
    private SkillRune rune;
}
