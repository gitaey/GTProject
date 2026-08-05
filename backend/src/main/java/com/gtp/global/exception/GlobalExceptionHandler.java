package com.gtp.global.exception;

import com.gtp.global.response.ApiResponse;
import jakarta.servlet.http.HttpServletRequest;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

@RestControllerAdvice
@Slf4j
public class GlobalExceptionHandler {

    @ExceptionHandler(CustomException.class)
    public ResponseEntity<ApiResponse<?>> handleCustomException(CustomException e,
            HttpServletRequest request) {
        log.error("CustomException: {}", e.getMessage());
        return ResponseEntity.status(e.getErrorCode().getStatus())
                .body(ApiResponse.fail(e.getMessage()));
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<ApiResponse<?>> handleException(Exception e,
            HttpServletRequest request) {
        log.error("Exception: {}", e.getMessage());
        return ResponseEntity.status(500)
                .body(ApiResponse.fail("서버 오류가 발생했습니다."));
    }
}
