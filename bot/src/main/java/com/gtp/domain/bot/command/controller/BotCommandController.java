package com.gtp.domain.bot.command.controller;

import com.gtp.domain.bot.command.dto.BotCommandRequest;
import com.gtp.domain.bot.command.dto.BotCommandResponse;
import com.gtp.domain.bot.command.service.BotCommandService;
import com.gtp.global.response.ApiResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/bot/commands")
@RequiredArgsConstructor
public class BotCommandController {

    private final BotCommandService service;

    @GetMapping
    public ApiResponse<List<BotCommandResponse>> getAll() {
        return ApiResponse.ok(service.getAll());
    }

    @GetMapping("/active")
    public ApiResponse<List<BotCommandResponse>> getActive() {
        return ApiResponse.ok(service.getActive());
    }

    @PostMapping
    public ApiResponse<BotCommandResponse> create(@RequestBody BotCommandRequest req) {
        return ApiResponse.ok(service.create(req));
    }

    @PutMapping("/{id}")
    public ApiResponse<BotCommandResponse> update(@PathVariable Long id, @RequestBody BotCommandRequest req) {
        return ApiResponse.ok(service.update(id, req));
    }

    @PatchMapping("/{id}/toggle")
    public ApiResponse<BotCommandResponse> toggle(@PathVariable Long id) {
        return ApiResponse.ok(service.toggle(id));
    }

    @DeleteMapping("/{id}")
    public ApiResponse<Void> delete(@PathVariable Long id) {
        service.delete(id);
        return ApiResponse.ok(null);
    }
}
