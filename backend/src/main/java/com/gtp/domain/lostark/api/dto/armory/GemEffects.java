package com.gtp.domain.lostark.api.dto.armory;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.Getter;

import java.util.List;

@Getter
@JsonIgnoreProperties(ignoreUnknown = true)
public class GemEffects {

    @JsonProperty("Description")
    private String description;

    @JsonProperty("Skills")
    private List<GemEffect> skills;
}
