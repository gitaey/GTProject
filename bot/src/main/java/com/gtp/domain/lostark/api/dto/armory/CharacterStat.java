package com.gtp.domain.lostark.api.dto.armory;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.Getter;

@Getter
@JsonIgnoreProperties(ignoreUnknown = true)
public class CharacterStat {

    @JsonProperty("Type")
    private String type;

    @JsonProperty("Value")
    private String value;
}
