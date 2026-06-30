package com.gtp.domain.lostark.api.dto.armory;

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

    // 아크패시브 캐릭터의 각인 정보
    @JsonProperty("ArkPassiveEffects")
    private List<ArkPassiveEngraving> arkPassiveEffects;
}
