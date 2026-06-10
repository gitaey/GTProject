package com.gtp.domain.schedule.controller;

import com.gtp.domain.schedule.dto.CharacterScheduleItem;
import com.gtp.domain.schedule.service.GoogleSheetsService;
import com.gtp.global.response.ApiResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/schedule")
@RequiredArgsConstructor
public class ScheduleController {

    private final GoogleSheetsService googleSheetsService;

    /**
     * GET /api/schedule/character/{name}
     * 캐릭터 이름으로 이번 주 레이드 일정 조회
     */
    @GetMapping("/character/{name}")
    public ApiResponse<List<CharacterScheduleItem>> getCharacterSchedule(
            @PathVariable String name) {
        List<CharacterScheduleItem> schedule = googleSheetsService.getCharacterSchedule(name);
        return ApiResponse.ok(schedule);
    }

    @GetMapping("/debug")
    public ApiResponse<List<List<Object>>> debug() {
        return ApiResponse.ok(googleSheetsService.getRawData());
    }

    @PostMapping("/refresh")
    public ApiResponse<String> refresh() {
        googleSheetsService.clearCache();
        return ApiResponse.ok("캐시가 초기화되었습니다.");
    }
}
