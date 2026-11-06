package com.gtp.domain.geoserver.controller;

import com.gtp.domain.geoserver.connection.GeoServerConnectionArgumentResolver;
import com.gtp.domain.geoserver.connection.GeoServerConnectionRegistry;
import com.gtp.domain.geoserver.dto.ConnectRequest;
import com.gtp.domain.geoserver.dto.ConnectionAttempt;
import com.gtp.domain.geoserver.dto.ConnectionStatus;
import com.gtp.domain.geoserver.service.GeoServerConnectionService;
import com.gtp.global.exception.CustomException;
import com.gtp.global.gis.GisErrorCode;
import com.gtp.global.gis.GisUserContext;
import com.gtp.global.response.ApiResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * GeoServer 연결 관리: 시험·연결·상태·해제. 권한은 SecurityConfig(SUPER_ADMIN·MAP_ADMIN).
 * 번호표는 헤더 X-GeoServer-Connection으로만 받는다(URL·쿼리 금지 — 접근 로그에 남는다).
 */
@RestController
@RequestMapping("/api/geoserver/connection")
@RequiredArgsConstructor
public class GeoServerConnectionController {

    private static final String HEADER = GeoServerConnectionArgumentResolver.HEADER;

    private final GeoServerConnectionService connectionService;
    private final GeoServerConnectionRegistry registry;
    private final GisUserContext userContext;

    /** N1 연결 시험(보관 안 함). 실패도 200 + ok=false. */
    @PostMapping("/test")
    public ApiResponse<ConnectionAttempt> test(@RequestBody ConnectRequest req) {
        return ApiResponse.ok(connectionService.test(userId(), req));
    }

    /** N2 연결(성공하면 보관 + 번호표). 번호표 헤더가 있고 같은 사용자 것이면 먼저 폐기한다. */
    @PostMapping
    public ApiResponse<ConnectionAttempt> connect(
            @RequestBody ConnectRequest req,
            @RequestHeader(value = HEADER, required = false) String previousToken) {
        return ApiResponse.ok(connectionService.connect(userId(), req, previousToken));
    }

    /** N3 현재 연결 상태. 없음·틀림·만료·남의 것은 428. 성공하면 마지막 사용 시각이 갱신된다. */
    @GetMapping
    public ApiResponse<ConnectionStatus> status(@RequestHeader(value = HEADER, required = false) String token) {
        return ApiResponse.ok(GeoServerConnectionService.toStatus(registry.resolveSnapshot(token, userId())));
    }

    /** N4 연결 해제. 없거나 남의 것이어도 200(멱등 — 존재 여부를 알려 주지 않는다). */
    @DeleteMapping
    public ApiResponse<Void> disconnect(@RequestHeader(value = HEADER, required = false) String token) {
        registry.revoke(token, userId());
        return ApiResponse.ok(null);
    }

    private String userId() {
        String id = userContext.currentUserId();
        if (id == null) throw new CustomException(GisErrorCode.UNAUTHORIZED);
        return id;
    }
}
