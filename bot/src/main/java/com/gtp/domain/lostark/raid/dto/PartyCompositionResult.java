package com.gtp.domain.lostark.raid.dto;

import lombok.AllArgsConstructor;
import lombok.Getter;

import java.util.List;

@Getter
@AllArgsConstructor
public class PartyCompositionResult {
    private int partyCount;
    private int totalMembers;
    private List<List<PartyMember>> parties;
    /** 파티별 딜러 로펙 평균 문자열 (예: "[D]평균 L7044") — 시트 H8에 기입되는 값과 동일 */
    private List<String> partyAverages;
}
