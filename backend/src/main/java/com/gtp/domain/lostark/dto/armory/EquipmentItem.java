package com.gtp.domain.lostark.dto.armory;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.Getter;

@Getter
@JsonIgnoreProperties(ignoreUnknown = true)
public class EquipmentItem {

    @JsonProperty("Slot")
    private String slot;

    @JsonProperty("Name")
    private String name;

    @JsonProperty("Icon")
    private String icon;

    @JsonProperty("Grade")
    private String grade;

    @JsonProperty("Type")
    private String type;
}
