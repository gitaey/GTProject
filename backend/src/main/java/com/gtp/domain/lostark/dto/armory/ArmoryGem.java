package com.gtp.domain.lostark.dto.armory;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.Getter;

import java.util.List;
@Getter
@JsonIgnoreProperties(ignoreUnknown = true)
public class ArmoryGem {

    @JsonProperty("Gems")
    private List<GemItem> gems;

    @JsonProperty("Effects")
    private GemEffects effects;
}
