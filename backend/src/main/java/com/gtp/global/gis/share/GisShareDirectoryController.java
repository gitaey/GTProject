package com.gtp.global.gis.share;

import com.gtp.global.exception.CustomException;
import com.gtp.global.gis.GisErrorCode;
import com.gtp.global.gis.GisUserContext;
import com.gtp.global.response.ApiResponse;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * 공유 상대 디렉터리(공통) — 사용자 검색, 공유 가능한 그룹 목록. 조회 전용.
 * SecurityConfig가 /api/gis/** 를 authenticated()로 막고, 여기서도 한 번 더 확인한다(이중 방어).
 */
@RestController
@RequestMapping("/api/gis/share-directory")
public class GisShareDirectoryController {

    static final int QUERY_MIN = 2;
    static final int QUERY_MAX = 50;
    static final int LIMIT_DEFAULT = 10;
    static final int LIMIT_MAX = 20;
    static final int CALLS_PER_MINUTE = 60;

    private final GisShareDirectory directory;
    private final GisUserContext userContext;
    private final ShareSearchRateLimiter limiter = new ShareSearchRateLimiter(CALLS_PER_MINUTE, 60_000L, System::currentTimeMillis);

    public GisShareDirectoryController(GisShareDirectory directory, GisUserContext userContext) {
        this.directory = directory;
        this.userContext = userContext;
    }

    @GetMapping("/users")
    public ApiResponse<List<ShareUserResponse>> users(@RequestParam(required = false) String q,
                                                       @RequestParam(required = false) String limit) {
        String me = requireLogin();
        String query = q == null ? "" : q.trim();
        if (query.length() < QUERY_MIN || query.length() > QUERY_MAX) {
            throw new CustomException(GisErrorCode.SHARE_QUERY_INVALID);
        }
        if (!limiter.tryAcquire(me)) {
            throw new CustomException(GisErrorCode.SHARE_DIRECTORY_RATE_LIMITED);
        }
        return ApiResponse.ok(directory.searchUsers(query, me, clampLimit(limit)));
    }

    @GetMapping("/groups")
    public ApiResponse<List<ShareGroupResponse>> groups() {
        requireLogin();
        return ApiResponse.ok(directory.groups());
    }

    /** 숫자가 아니거나 1 미만이면 기본값, 최대값을 넘으면 최대값으로 자른다. */
    static int clampLimit(String raw) {
        if (raw == null || raw.isBlank()) return LIMIT_DEFAULT;
        try {
            int n = Integer.parseInt(raw.trim());
            if (n < 1) return LIMIT_DEFAULT;
            return Math.min(n, LIMIT_MAX);
        } catch (NumberFormatException e) {
            return LIMIT_DEFAULT;
        }
    }

    private String requireLogin() {
        String me = userContext.currentUserId();
        if (me == null) throw new CustomException(GisErrorCode.UNAUTHORIZED);
        return me;
    }
}
