package com.gtp.domain.botsender.controller;

import com.gtp.domain.botsender.dto.BotSenderRequest;
import com.gtp.domain.botsender.dto.BotSenderResponse;
import com.gtp.domain.botsender.service.BotSenderService;
import com.gtp.global.response.ApiResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/bot/senders")
@RequiredArgsConstructor
public class BotSenderController {

    private final BotSenderService service;

    @GetMapping
    public ApiResponse<List<BotSenderResponse>> getAll() {
        return ApiResponse.ok(service.getAll());
    }

    @GetMapping("/{senderName}/role")
    public ApiResponse<String> getSenderRole(@PathVariable String senderName) {
        return ApiResponse.ok(service.getSenderRole(senderName));
    }

    @PostMapping("/upsert")
    public ApiResponse<Void> upsert(@RequestParam String senderName) {
        service.upsert(senderName);
        return ApiResponse.ok(null);
    }

    @PostMapping
    public ApiResponse<BotSenderResponse> create(@RequestBody BotSenderRequest req) {
        return ApiResponse.ok(service.create(req));
    }

    @PutMapping("/{id}")
    public ApiResponse<BotSenderResponse> update(@PathVariable Long id, @RequestBody BotSenderRequest req) {
        return ApiResponse.ok(service.update(id, req));
    }

    @DeleteMapping("/{id}")
    public ApiResponse<Void> delete(@PathVariable Long id) {
        service.delete(id);
        return ApiResponse.ok(null);
    }
}
