package com.gtp.domain.lostark.dto.armory;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.Getter;

import java.util.List;

@Getter
@JsonIgnoreProperties(ignoreUnknown = true)
public class ArmoryEngraving {

    @JsonProperty("Engravings")
    private List<EngravingSlot> engravings;

    @JsonProperty("Effects")
    private List<EngravingEffect> effects;
}
