package com.gtp.global.exception;

import com.gtp.domain.bot.log.service.BotLogService;
import com.gtp.global.response.ApiResponse;
import jakarta.servlet.http.HttpServletRequest;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

@RestControllerAdvice
@Slf4j
@RequiredArgsConstructor
public class GlobalExceptionHandler {

    private final BotLogService botLogService;

    @ExceptionHandler(CustomException.class)
    public ResponseEntity<ApiResponse<?>> handleCustomException(CustomException e,
            HttpServletRequest request) {
        log.error("CustomException: {}", e.getMessage());

        // /api/bot-log 요청이나 카카오봇 관련만 저장
        if (request.getRequestURI().startsWith("/api/bot")) {
            botLogService.saveApiError(request.getRequestURI(), e.getMessage());
        }

        return ResponseEntity.status(e.getErrorCode().getStatus())
                .body(ApiResponse.fail(e.getMessage()));
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<ApiResponse<?>> handleException(Exception e,
            HttpServletRequest request) {
        log.error("Exception: {}", e.getMessage());

        // /api/bot-log 요청이나 카카오봇 관련만 저장
        if (request.getRequestURI().startsWith("/api/bot")) {
            botLogService.saveApiError(request.getRequestURI(), e.getMessage());
        }

        return ResponseEntity.status(500)
                .body(ApiResponse.fail("서버 오류가 발생했습니다."));
    }
}
