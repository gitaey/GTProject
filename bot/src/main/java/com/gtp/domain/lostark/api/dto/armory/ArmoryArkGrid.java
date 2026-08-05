package com.gtp.domain.lostark.api.dto.armory;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.Getter;

import java.util.List;

@Getter
@JsonIgnoreProperties(ignoreUnknown = true)
public class ArmoryArkGrid {

    // 슬롯 목록 (장착된 아크그리드 아이템)
    @JsonProperty("Slots")
    private List<ArkGridSlot> slots;

    // 발동 중인 효과 목록 (Name + Level)
    @JsonProperty("Effects")
    private List<ArkGridEffect> effects;
}
