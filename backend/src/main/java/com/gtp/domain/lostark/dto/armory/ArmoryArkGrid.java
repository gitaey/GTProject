package com.gtp.domain.lostark.dto.armory;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.Getter;

import java.util.List;

@Getter
@JsonIgnoreProperties(ignoreUnknown = true)
public class ArmoryArkGrid {

    @JsonProperty("IsUnlocked")
    private boolean isUnlocked;

    @JsonProperty("Presets")
    private List<ArkGridPreset> presets;
}
