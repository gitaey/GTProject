package com.gtp.domain.lostark.dto.armory;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.Getter;

import java.util.List;

@Getter
@JsonIgnoreProperties(ignoreUnknown = true)
public class ArmoryProfile {

    @JsonProperty("CharacterName")
    private String characterName;

    @JsonProperty("ServerName")
    private String serverName;

    @JsonProperty("CharacterClassName")
    private String characterClassName;

    @JsonProperty("CharacterLevel")
    private int characterLevel;

    @JsonProperty("ItemAvgLevel")
    private String itemAvgLevel;

    @JsonProperty("ItemMaxLevel")
    private String itemMaxLevel;

    @JsonProperty("CharacterImage")
    private String characterImage;

    @JsonProperty("ExpeditionLevel")
    private int expeditionLevel;

    @JsonProperty("GuildName")
    private String guildName;

    @JsonProperty("Title")
    private String title;

    @JsonProperty("TownName")
    private String townName;

    @JsonProperty("TownLevel")
    private int townLevel;

    @JsonProperty("GuildMemberGrade")
    private String guildMemberGrade;

    @JsonProperty("UsingSkillPoint")
    private int usingSkillPoint;

    @JsonProperty("TotalSkillPoint")
    private int totalSkillPoint;

    @JsonProperty("CombatPower")
    private String combatPower;

    @JsonProperty("HonorPoint")
    private int honorPoint;

    @JsonProperty("Stats")
    private List<CharacterStat> stats;

    @JsonProperty("Tendencies")
    private List<CharacterTendency> tendencies;
}
