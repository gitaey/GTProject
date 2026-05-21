package com.gtp.domain.lostark.dto.armory;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.Getter;

@Getter
@JsonIgnoreProperties(ignoreUnknown = true)
public class ArkPassiveNode {

    @JsonProperty("Tier")
    private int tier;

    @JsonProperty("Slot")
    private int slot;

    @JsonProperty("Name")
    private String name;

    @JsonProperty("Description")
    private String description;

    @JsonProperty("Icon")
    private String icon;

    @JsonProperty("Level")
    private int level;

    @JsonProperty("MaxLevel")
    private int maxLevel;

    @JsonProperty("Type")
    private String type;
}
