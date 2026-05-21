package com.gtp.domain.lostark.dto.armory;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.Getter;

import java.util.List;

@Getter
@JsonIgnoreProperties(ignoreUnknown = true)
public class ArmoryArkPassive {

    @JsonProperty("Title")
    private String title;

    // 아크패시브 해금 여부
    @JsonProperty("IsArkPassive")
    private boolean isArkPassive;

    // 진화 / 깨달음 / 도약 포인트
    @JsonProperty("Points")
    private List<ArkPassivePoint> points;

    // 실제 노드 효과 목록 (Name = 카테고리: 깨달음/진화/도약)
    @JsonProperty("Effects")
    private List<ArkPassiveEffect> effects;
}
