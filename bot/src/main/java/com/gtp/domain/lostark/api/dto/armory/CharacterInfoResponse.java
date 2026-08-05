package com.gtp.domain.lostark.api.dto.armory;

import lombok.AllArgsConstructor;
import lombok.Getter;

@Getter
@AllArgsConstructor
public class CharacterInfoResponse {

    private ArmoryProfile profile;
    private ArmoryArkPassive arkPassive;
    private ArmoryEngraving engraving;
    private ArmoryArkGrid arkGrid;
}
