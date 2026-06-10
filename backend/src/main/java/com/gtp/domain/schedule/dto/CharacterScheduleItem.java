package com.gtp.domain.schedule.dto;

import lombok.AllArgsConstructor;
import lombok.Getter;

import java.util.List;

@Getter
@AllArgsConstructor
public class CharacterScheduleItem {
    private String raidName;
    private String schedule;
    private String selfDisplay;        // 본인 포맷 (예: "[D] 기빵핑 [1785.83]")
    private List<String> participants; // 다른 참가자 목록 (본인 제외)
}
