package com.gtp.domain.botschedule.controller;

import com.gtp.domain.botschedule.dto.BotScheduleRequest;
import com.gtp.domain.botschedule.dto.BotScheduleResponse;
import com.gtp.domain.botschedule.service.BotScheduleService;
import com.gtp.global.response.ApiResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/bot/schedules")
@RequiredArgsConstructor
public class BotScheduleController {

    private final BotScheduleService service;

    @GetMapping
    public ApiResponse<List<BotScheduleResponse>> getAll() {
        return ApiResponse.ok(service.getAll());
    }

    @GetMapping("/active")
    public ApiResponse<List<BotScheduleResponse>> getActive() {
        return ApiResponse.ok(service.getActive());
    }

    @PostMapping
    public ApiResponse<BotScheduleResponse> create(@RequestBody BotScheduleRequest req) {
        return ApiResponse.ok(service.create(req));
    }

    @PutMapping("/{id}")
    public ApiResponse<BotScheduleResponse> update(@PathVariable Long id, @RequestBody BotScheduleRequest req) {
        return ApiResponse.ok(service.update(id, req));
    }

    @PatchMapping("/{id}/toggle")
    public ApiResponse<BotScheduleResponse> toggle(@PathVariable Long id) {
        return ApiResponse.ok(service.toggle(id));
    }

    @PatchMapping("/{id}/sent")
    public ApiResponse<BotScheduleResponse> markSent(@PathVariable Long id) {
        return ApiResponse.ok(service.markSent(id));
    }

    @DeleteMapping("/{id}")
    public ApiResponse<Void> delete(@PathVariable Long id) {
        service.delete(id);
        return ApiResponse.ok(null);
    }
}
