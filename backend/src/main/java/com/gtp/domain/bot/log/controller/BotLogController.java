package com.gtp.domain.bot.log.controller;

import com.gtp.domain.bot.log.dto.BotLogResponse;
import com.gtp.domain.bot.log.dto.BotLogStatsResponse;
import com.gtp.domain.bot.log.entity.BotLogType;
import com.gtp.domain.bot.log.service.BotLogService;
import com.gtp.global.response.ApiResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.web.bind.annotation.*;

/**
 * bot_log 테이블 조회 전용 컨트롤러 (대시보드/관리자 페이지용).
 * 로그 저장(POST)은 bot 서비스에서 처리하므로 여기에는 포함하지 않는다.
 */
@RestController
@RequestMapping("/api/bot-log")
@RequiredArgsConstructor
public class BotLogController {

    private final BotLogService botLogService;

    /** GET /api/bot-log?type=COMMAND&page=0&size=50 — 로그 조회 */
    @GetMapping
    public ApiResponse<Page<BotLogResponse>> getLogs(
            @RequestParam(required = false) BotLogType type,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "50") int size) {
        return ApiResponse.ok(botLogService.getLogs(type, page, size));
    }

    /** GET /api/bot-log/stats/daily?date=2026-06-23&type=COMMAND */
    @GetMapping("/stats/daily")
    public ApiResponse<BotLogStatsResponse> getDailyStats(
            @RequestParam String date,
            @RequestParam(required = false) BotLogType type) {
        return ApiResponse.ok(botLogService.getDailyStats(date, type));
    }

    /** GET /api/bot-log/stats/monthly?month=2026-06&type=COMMAND */
    @GetMapping("/stats/monthly")
    public ApiResponse<BotLogStatsResponse> getMonthlyStats(
            @RequestParam String month,
            @RequestParam(required = false) BotLogType type) {
        return ApiResponse.ok(botLogService.getMonthlyStats(month, type));
    }
}
