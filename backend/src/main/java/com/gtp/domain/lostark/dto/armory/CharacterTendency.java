package com.gtp.domain.lostark.dto.armory;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.Getter;

@Getter
@JsonIgnoreProperties(ignoreUnknown = true)
public class CharacterTendency {

    @JsonProperty("Type")
    private String type;

    @JsonProperty("Point")
    private int point;

    @JsonProperty("MaxPoint")
    private int maxPoint;
}
