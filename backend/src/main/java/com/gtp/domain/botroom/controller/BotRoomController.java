package com.gtp.domain.botroom.controller;

import com.gtp.domain.botroom.dto.BotRoomRequest;
import com.gtp.domain.botroom.dto.BotRoomResponse;
import com.gtp.domain.botroom.service.BotRoomService;
import com.gtp.global.response.ApiResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/bot/rooms")
@RequiredArgsConstructor
public class BotRoomController {

    private final BotRoomService service;

    @GetMapping
    public ApiResponse<List<BotRoomResponse>> getAll() {
        return ApiResponse.ok(service.getAll());
    }

    @GetMapping("/{roomName}/status")
    public ApiResponse<String> getRoomStatus(@PathVariable String roomName) {
        return ApiResponse.ok(service.getRoomStatus(roomName));
    }

    @PostMapping("/upsert")
    public ApiResponse<Void> upsert(@RequestParam String roomName) {
        service.upsert(roomName);
        return ApiResponse.ok(null);
    }

    @PostMapping
    public ApiResponse<BotRoomResponse> create(@RequestBody BotRoomRequest req) {
        return ApiResponse.ok(service.create(req));
    }

    @PutMapping("/{id}")
    public ApiResponse<BotRoomResponse> update(@PathVariable Long id, @RequestBody BotRoomRequest req) {
        return ApiResponse.ok(service.update(id, req));
    }

    @PatchMapping("/{id}/toggle")
    public ApiResponse<BotRoomResponse> toggle(@PathVariable Long id) {
        return ApiResponse.ok(service.toggle(id));
    }

    @DeleteMapping("/{id}")
    public ApiResponse<Void> delete(@PathVariable Long id) {
        service.delete(id);
        return ApiResponse.ok(null);
    }
}
