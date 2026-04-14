package com.gtp.domain.lostark.controller;

import com.gtp.domain.lostark.dto.CharacterResponse;
import com.gtp.domain.lostark.service.LostarkService;
import com.gtp.global.response.ApiResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/lostark")
@RequiredArgsConstructor
public class LostarkController {

    private final LostarkService lostarkService;

    @GetMapping("/character/{name}")
    public ApiResponse<CharacterResponse> getCharacter(@PathVariable String name) {
        return ApiResponse.ok(lostarkService.getCharacter(name));
    }
}