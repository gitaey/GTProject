package com.gtp.domain.mymap.controller;

import com.gtp.domain.mymap.dto.ParcelBuildingsResponse;
import com.gtp.domain.mymap.service.ParcelBuildingService;
import com.gtp.global.response.ApiResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.Duration;

/**
 * 건물DB 참조 자료 읽기 API(필지 정보 카드). 모든 경로가 /api/mymap/** 아래라 SecurityConfig의 authenticated() 규칙이 그대로 적용된다
 * (새 경로를 이 밖에 만들지 말 것 — SecurityContractTest가 확인한다).
 */
@RestController
@RequestMapping("/api/mymap/ref")
@RequiredArgsConstructor
public class ParcelRefController {

    private final ParcelBuildingService parcelBuildingService;

    /** U25. 필지(PNU)에 걸린 건물. limit은 1~1000(기본 200) — 숫자가 아니면 400이라 문자열로 받아 서비스가 검사한다. */
    @GetMapping("/parcels/{pnu}/buildings")
    public ResponseEntity<ApiResponse<ParcelBuildingsResponse>> buildings(@PathVariable String pnu,
                                                                          @RequestParam(required = false) String limit) {
        ParcelBuildingsResponse body = parcelBuildingService.buildings(pnu, limit);
        return ResponseEntity.ok()
                .cacheControl(CacheControl.maxAge(Duration.ofMinutes(5)).cachePrivate())
                .body(ApiResponse.ok(body));
    }
}
