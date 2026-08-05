package com.gtp.domain.lostark.api.dto.armory;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.Getter;

import java.util.List;

@Getter
@JsonIgnoreProperties(ignoreUnknown = true)
public class ArkGridSlot {

    @JsonProperty("Index")
    private int index;

    @JsonProperty("Icon")
    private String icon;

    @JsonProperty("Name")
    private String name;

    @JsonProperty("Point")
    private int point;

    @JsonProperty("Grade")
    private String grade;

    @JsonProperty("Tooltip")
    private String tooltip;

    @JsonProperty("Gems")
    private List<ArkGridSlotGem> gems;
}
