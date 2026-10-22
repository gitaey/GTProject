package com.gtp.global.gis.share;

import lombok.extern.slf4j.Slf4j;

import java.util.concurrent.ConcurrentHashMap;
import java.util.function.LongSupplier;

/**
 * 사용자별 고정 창(window) 호출 횟수 제한 — 사용자 검색으로 계정을 훑는 것을 늦춘다.
 * 상태는 인스턴스(컨트롤러 빈)에 둔다. 서버를 여러 대 두면 서버별로 센다(대략적 제한이면 충분).
 */
@Slf4j
class ShareSearchRateLimiter {

    private static final int CLEANUP_THRESHOLD = 2000;

    private final int limit;
    private final long windowMillis;
    private final LongSupplier clock;
    private final ConcurrentHashMap<String, Window> windows = new ConcurrentHashMap<>();

    ShareSearchRateLimiter(int limit, long windowMillis, LongSupplier clock) {
        this.limit = limit;
        this.windowMillis = windowMillis;
        this.clock = clock;
    }

    /** 이번 호출을 세고, 한도 안이면 true. 한도를 넘으면 false(창이 바뀔 때까지). */
    boolean tryAcquire(String userId) {
        long now = clock.getAsLong();
        if (windows.size() > CLEANUP_THRESHOLD) {
            windows.entrySet().removeIf(e -> now - e.getValue().start >= windowMillis);
        }
        Window w = windows.compute(userId, (k, old) -> {
            if (old == null || now - old.start >= windowMillis) return new Window(now, 1);
            return new Window(old.start, old.count + 1);
        });
        if (w.count > limit) {
            if (w.count == limit + 1) {   // 창마다 한 번만 기록(로그 폭주 방지) — 사용자 id와 횟수만
                log.warn("공유 상대 검색 호출 한도 초과: userId={}, 한도={}", userId, limit);
            }
            return false;
        }
        return true;
    }

    private record Window(long start, int count) {
    }
}
