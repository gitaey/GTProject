package com.gtp.domain.auth.controller;

import com.gtp.domain.auth.dto.LoginRequest;
import com.gtp.domain.auth.dto.LoginResponse;
import com.gtp.domain.auth.service.AuthService;
import com.gtp.global.response.ApiResponse;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/auth")
@RequiredArgsConstructor
public class AuthController {

    private final AuthService authService;

    /* 로그인 */
    @PostMapping("/login")
    public ApiResponse<LoginResponse> login(@Valid @RequestBody LoginRequest req) {
        return ApiResponse.ok(authService.login(req));
    }

    /* 내 정보 조회 (토큰 갱신 포함) */
    @GetMapping("/me")
    public ApiResponse<LoginResponse> me() {
        String userId = (String) SecurityContextHolder.getContext().getAuthentication().getPrincipal();
        return ApiResponse.ok(authService.getMe(userId));
    }
}
