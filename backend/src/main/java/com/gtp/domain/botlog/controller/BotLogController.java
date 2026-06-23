package com.gtp.domain.botlog.controller;

import com.gtp.domain.botlog.dto.BotLogRequest;
import com.gtp.domain.botlog.dto.BotLogResponse;
import com.gtp.domain.botlog.entity.BotLogType;
import com.gtp.domain.botlog.service.BotLogService;
import com.gtp.global.response.ApiResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/bot-log")
@RequiredArgsConstructor
public class BotLogController {

    private final BotLogService botLogService;

    /** POST /api/bot-log — 봇에서 로그 저장 */
    @PostMapping
    public ApiResponse<Void> save(@RequestBody BotLogRequest request) {
        botLogService.save(request);
        return ApiResponse.ok(null);
    }

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
    public ApiResponse<com.gtp.domain.botlog.dto.BotLogStatsResponse> getDailyStats(
            @RequestParam String date,
            @RequestParam(required = false) BotLogType type) {
        return ApiResponse.ok(botLogService.getDailyStats(date, type));
    }

    /** GET /api/bot-log/stats/monthly?month=2026-06&type=COMMAND */
    @GetMapping("/stats/monthly")
    public ApiResponse<com.gtp.domain.botlog.dto.BotLogStatsResponse> getMonthlyStats(
            @RequestParam String month,
            @RequestParam(required = false) BotLogType type) {
        return ApiResponse.ok(botLogService.getMonthlyStats(month, type));
    }
}
