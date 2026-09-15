package com.gtp.domain.mymap.controller;

import com.gtp.domain.mymap.dto.*;
import com.gtp.domain.mymap.service.UserMapService;
import com.gtp.domain.mymap.service.UserMapUploadService;
import com.gtp.global.response.ApiResponse;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.http.MediaType;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.util.List;

/**
 * 나만의지도 API. 다른 도메인 컨트롤러를 참조하지 않는 독립 엔드포인트 —
 * 인증 정보(userId/role)는 SecurityContextHolder에서만 뽑아 쓴다.
 */
@RestController
@RequestMapping("/api/mymap")
@RequiredArgsConstructor
public class UserMapController {

    private final UserMapService userMapService;
    private final UserMapUploadService uploadService;

    @GetMapping
    public ApiResponse<List<UserMapListItem>> list() {
        return ApiResponse.ok(userMapService.findVisibleTo(currentUserId(), currentRoleCodes()));
    }

    @GetMapping("/srid-options")
    public ApiResponse<List<String>> sridOptions() {
        return ApiResponse.ok(uploadService.supportedSrids());
    }

    @GetMapping("/{id}/status")
    public ApiResponse<UserMapStatusResponse> status(@PathVariable Long id) {
        return ApiResponse.ok(userMapService.getStatus(id, currentUserId(), currentRoleCodes()));
    }

    // StreamingResponseBody(비동기 디스패치)로 만들면 Spring Security 필터 체인과의 상호작용에서
    // 응답이 끝까지 안 쓰이고 잘리는 문제(ERR_INCOMPLETE_CHUNKED_ENCODING)가 있어서,
    // 컨테이너 스레드를 그대로 점유하는 동기 방식으로 직접 응답 스트림에 쓴다.
    @GetMapping(value = "/{id}/geojson", produces = MediaType.APPLICATION_JSON_VALUE)
    public void geojson(@PathVariable Long id, HttpServletResponse response) throws IOException {
        // 응답 Writer를 열기 전에 먼저 검증한다 — 열고 나서 예외가 나면 응답이 이미 커밋돼
        // GlobalExceptionHandler가 정상적으로 에러를 못 만든다 (스택트레이스가 그대로 노출됨).
        userMapService.assertCanStreamGeoJson(id, currentUserId(), currentRoleCodes());
        response.setContentType(MediaType.APPLICATION_JSON_VALUE);
        response.setCharacterEncoding("UTF-8");
        userMapService.streamGeoJson(id, response.getWriter());
    }

    @PostMapping(value = "/upload/shp", consumes = "multipart/form-data")
    public ApiResponse<UserMapUploadResponse> uploadShp(
            @RequestParam("files") List<MultipartFile> files,
            @RequestParam("name") String name,
            @RequestParam(value = "description", required = false) String description,
            @RequestParam(value = "sourceSrid", required = false) String sourceSrid) {
        return ApiResponse.ok(uploadService.uploadShp(files, name, description, sourceSrid, currentUserId()));
    }

    @PostMapping(value = "/upload/excel/preview", consumes = "multipart/form-data")
    public ApiResponse<ExcelPreviewResponse> previewExcel(@RequestParam("file") MultipartFile file) {
        return ApiResponse.ok(uploadService.previewExcel(file));
    }

    @PostMapping("/upload/excel/confirm")
    public ApiResponse<UserMapUploadResponse> confirmExcel(@RequestBody ExcelConfirmRequest req) {
        return ApiResponse.ok(uploadService.confirmExcel(req, currentUserId()));
    }

    @PatchMapping("/{id}")
    public ApiResponse<Void> update(@PathVariable Long id, @RequestBody UserMapUpdateRequest req) {
        userMapService.update(id, currentUserId(), req);
        return ApiResponse.ok(null);
    }

    @DeleteMapping("/{id}")
    public ApiResponse<Void> delete(@PathVariable Long id) {
        userMapService.delete(id, currentUserId());
        return ApiResponse.ok(null);
    }

    @GetMapping("/{id}/share")
    public ApiResponse<UserMapShareResponse> getShare(@PathVariable Long id) {
        return ApiResponse.ok(userMapService.getShare(id, currentUserId()));
    }

    @PutMapping("/{id}/share")
    public ApiResponse<Void> share(@PathVariable Long id, @RequestBody UserMapShareRequest req) {
        userMapService.share(id, currentUserId(), req);
        return ApiResponse.ok(null);
    }

    private String currentUserId() {
        return (String) SecurityContextHolder.getContext().getAuthentication().getPrincipal();
    }

    private List<String> currentRoleCodes() {
        return SecurityContextHolder.getContext().getAuthentication().getAuthorities().stream()
                .map(GrantedAuthority::getAuthority)
                .map(a -> a.startsWith("ROLE_") ? a.substring(5) : a)
                .toList();
    }
}
