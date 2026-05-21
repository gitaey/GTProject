package com.gtp.domain.lostark.dto.armory;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.Getter;

@Getter
@JsonIgnoreProperties(ignoreUnknown = true)
public class ArkPassiveEffect {

    // 카테고리: "깨달음", "진화", "도약"
    @JsonProperty("Name")
    private String name;

    // HTML 태그 포함 설명 (예: "<FONT color='#83E9FF'>깨달음</FONT> 1티어 ...")
    @JsonProperty("Description")
    private String description;

    @JsonProperty("Icon")
    private String icon;

    @JsonProperty("ToolTip")
    private String toolTip;
}
