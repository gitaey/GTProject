package com.gtp.domain.lostark.api.dto.armory;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.Getter;

import java.util.List;

@Getter
@JsonIgnoreProperties(ignoreUnknown = true)
public class ArmoryResponse {

    @JsonProperty("ArmoryProfile")
    private ArmoryProfile armoryProfile;

    @JsonProperty("ArmoryEquipment")
    private List<EquipmentItem> armoryEquipment;

    @JsonProperty("ArmorySkills")
    private List<SkillItem> armorySkills;

    @JsonProperty("ArmoryEngraving")
    private ArmoryEngraving armoryEngraving;

    @JsonProperty("ArmoryGem")
    private ArmoryGem armoryGem;

    @JsonProperty("Collectibles")
    private List<CollectibleItem> collectibles;
}
