package com.gtp.domain.lostark.raid.dto;

import lombok.AllArgsConstructor;
import lombok.Getter;

import java.util.List;

@Getter
@AllArgsConstructor
public class ExpeditionScheduleResponse {
    private String expeditionName;
    private List<MemberSchedule> members;

    @Getter
    @AllArgsConstructor
    public static class MemberSchedule {
        private String characterName;
        private List<CharacterScheduleItem> schedules; // 빈 리스트면 이번 주 일정 없음
    }
}
