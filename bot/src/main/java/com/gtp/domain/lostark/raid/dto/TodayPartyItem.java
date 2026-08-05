package com.gtp.domain.lostark.raid.dto;

import lombok.AllArgsConstructor;
import lombok.Getter;

import java.util.List;

@Getter
@AllArgsConstructor
public class TodayPartyItem {
    private String raidName;
    private String time;
    private List<String> members;
}
