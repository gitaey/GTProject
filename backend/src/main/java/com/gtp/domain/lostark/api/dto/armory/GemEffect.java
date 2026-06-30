package com.gtp.domain.lostark.api.dto.armory;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.Getter;

import java.util.List;

@Getter
@JsonIgnoreProperties(ignoreUnknown = true)
public class GemEffect {

    @JsonProperty("GemSlot")
    private int gemSlot;

    @JsonProperty("Name")
    private String name;

    @JsonProperty("Description")
    private List<String> description;

    @JsonProperty("Option")
    private String option;

    @JsonProperty("Icon")
    private String icon;
}
