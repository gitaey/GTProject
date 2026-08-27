package com.gtp.domain.log.controller;

import com.gtp.domain.log.dto.AccessLogRequest;
import com.gtp.domain.log.dto.AccessLogResponse;
import com.gtp.domain.log.dto.AccessLogStatsResponse;
import com.gtp.domain.log.service.AccessLogService;
import com.gtp.global.response.ApiResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.data.web.PageableDefault;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/access-log")
@RequiredArgsConstructor
public class AccessLogController {

    private final AccessLogService accessLogService;

    /* 방문 로그 저장 */
    @PostMapping
    public ApiResponse<Void> save(@RequestBody AccessLogRequest req) {
        String userId = (String) SecurityContextHolder.getContext().getAuthentication().getPrincipal();
        accessLogService.save(userId, req);
        return ApiResponse.ok(null);
    }

    /* 전체 로그 조회 (페이징, 최신순) */
    @GetMapping
    public ApiResponse<Page<AccessLogResponse>> getAll(
            @PageableDefault(size = 20, sort = "accessedAt", direction = Sort.Direction.DESC) Pageable pageable) {
        return ApiResponse.ok(accessLogService.findAll(pageable));
    }

    /* 유저별 방문 횟수 통계 */
    @GetMapping("/stats")
    public ApiResponse<List<AccessLogStatsResponse>> getStats() {
        return ApiResponse.ok(accessLogService.getStats());
    }
}
