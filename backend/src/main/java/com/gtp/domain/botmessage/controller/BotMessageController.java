package com.gtp.domain.botmessage.controller;

import com.gtp.domain.botmessage.dto.BotMessageRequest;
import com.gtp.domain.botmessage.dto.BotMessageResult;
import com.gtp.domain.botmessage.service.BotMessageService;
import com.gtp.global.response.ApiResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/bot/message")
@RequiredArgsConstructor
public class BotMessageController {

    private final BotMessageService botMessageService;

    @PostMapping
    public ApiResponse<BotMessageResult> handle(@RequestBody BotMessageRequest request) {
        BotMessageResult result = botMessageService.handle(request);
        return ApiResponse.ok(result);
    }
}
