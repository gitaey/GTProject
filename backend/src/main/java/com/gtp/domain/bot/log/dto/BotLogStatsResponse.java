package com.gtp.domain.bot.log.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.util.List;
import java.util.Map;

@Getter
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class BotLogStatsResponse {

    private int total;
    private int successCount;
    private int failCount;

    /** 유형별 건수: { "COMMAND": 50, "API_ERROR": 3, "AUTO_SEND": 10 } */
    private Map<String, Long> byType;

    /** 일별 통계: date="2026-06-23", total, success, fail */
    private List<DayStat> byDay;

    /** 시간대별 통계: hour=0..23, total, success, fail */
    private List<HourStat> byHour;

    @Getter
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class DayStat {
        private String date;
        private long total;
        private long success;
        private long fail;
    }

    @Getter
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class HourStat {
        private int hour;
        private long total;
        private long success;
        private long fail;
    }
}
