package com.gtp.domain.mymap.controller;

import com.gtp.domain.mymap.dto.UserMapListItem;
import com.gtp.domain.mymap.service.UserMapService;
import com.gtp.global.response.ApiResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/** 관리자 전용 오버사이트 — 전체 사용자의 나만의지도 목록/강제 삭제. */
@RestController
@RequestMapping("/api/admin/mymap")
@RequiredArgsConstructor
public class UserMapAdminController {

    private final UserMapService userMapService;

    @GetMapping
    public ApiResponse<List<UserMapListItem>> listAll() {
        return ApiResponse.ok(userMapService.findAllForAdmin());
    }

    @DeleteMapping("/{id}")
    public ApiResponse<Void> forceDelete(@PathVariable Long id) {
        userMapService.deleteAsAdmin(id);
        return ApiResponse.ok(null);
    }
}
