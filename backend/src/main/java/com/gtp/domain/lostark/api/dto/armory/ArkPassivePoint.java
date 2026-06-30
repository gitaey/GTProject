package com.gtp.domain.lostark.api.dto.armory;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.Getter;

@Getter
@JsonIgnoreProperties(ignoreUnknown = true)
public class ArkPassivePoint {

    @JsonProperty("Name")
    private String name;

    @JsonProperty("Value")
    private int value;

    @JsonProperty("Tooltip")
    private String tooltip;

    // 랭크 설명 (예: "6랭크 21레벨")
    @JsonProperty("Description")
    private String description;
}
