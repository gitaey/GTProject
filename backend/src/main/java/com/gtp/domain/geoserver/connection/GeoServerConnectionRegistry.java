package com.gtp.domain.geoserver.connection;

import com.gtp.global.exception.CustomException;
import com.gtp.global.gis.GisErrorCode;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.security.SecureRandom;
import java.time.Clock;
import java.time.Instant;
import java.util.ArrayDeque;
import java.util.Base64;
import java.util.Comparator;
import java.util.Deque;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicLong;
import java.util.regex.Pattern;

/**
 * 번호표(토큰) → 연결 보관소. 서버 메모리에만 있다(재시작하면 모두 사라짐, 여러 인스턴스 미지원).
 * 번호표는 32바이트 SecureRandom → Base64url 43자이고 로그에 쓰지 않는다.
 * 만료는 마지막 사용 후 idle 시간(슬라이딩) + 연결 후 max 시간(절대). 정리는 스케줄러 없이 issue/resolve 때 지연 실행한다.
 */
@Slf4j
@Component
public class GeoServerConnectionRegistry {

    public static final int TOKEN_LENGTH = 43;
    private static final Pattern TOKEN_FORMAT = Pattern.compile("^[A-Za-z0-9_-]{" + TOKEN_LENGTH + "}$");
    private static final long CLEANUP_INTERVAL_MS = 60_000L;
    private static final long ATTEMPT_WINDOW_MS = 60_000L;

    /** 번호표 하나의 보관 항목. */
    private static final class Entry {
        final String userId;
        final GeoServerConnection conn;
        final long connectedAtMillis;
        volatile long lastUsedMillis;

        Entry(String userId, GeoServerConnection conn, long now) {
            this.userId = userId;
            this.conn = conn;
            this.connectedAtMillis = now;
            this.lastUsedMillis = now;
        }
    }

    /** 연결 상태 조회용(N3). 값 복사본이라 이후 갱신과 무관하다. */
    public record Snapshot(GeoServerConnection conn, Instant connectedAt, Instant lastUsedAt, Instant expiresAt, int idleMinutes) {
    }

    private final long idleMillis;
    private final long maxMillis;
    private final int idleMinutes;
    private final int perUserMax;
    private final int totalMax;
    private final int attemptsPerMinute;
    private final Clock clock;

    private final Map<String, Entry> entries = new ConcurrentHashMap<>();
    private final Map<String, Deque<Long>> attempts = new ConcurrentHashMap<>();
    private final SecureRandom random = new SecureRandom();
    private final AtomicLong lastCleanup;

    @Autowired
    public GeoServerConnectionRegistry(
            @Value("${geoserver.connection.idle-minutes:120}") int idleMinutes,
            @Value("${geoserver.connection.max-hours:12}") int maxHours,
            @Value("${geoserver.connection.per-user-max:5}") int perUserMax,
            @Value("${geoserver.connection.total-max:200}") int totalMax,
            @Value("${geoserver.connection.attempts-per-minute:10}") int attemptsPerMinute) {
        this(idleMinutes, maxHours, perUserMax, totalMax, attemptsPerMinute, Clock.systemUTC());
    }

    /** 시험용: 시계를 바꿔 끼울 수 있다. */
    public GeoServerConnectionRegistry(int idleMinutes, int maxHours, int perUserMax, int totalMax,
                                       int attemptsPerMinute, Clock clock) {
        this.idleMinutes = idleMinutes;
        this.idleMillis = idleMinutes * 60_000L;
        this.maxMillis = maxHours * 3_600_000L;
        // 0 이하면 발급 루프가 끝나지 않으므로 최소 1로 보정한다
        this.perUserMax = Math.max(1, perUserMax);
        this.totalMax = Math.max(1, totalMax);
        this.attemptsPerMinute = attemptsPerMinute;
        this.clock = clock;
        this.lastCleanup = new AtomicLong(clock.millis());
    }

    // ── 발급·해석·폐기 ────────────────────────────────────────────

    /** 새 번호표 발급. previousToken이 같은 사용자 것이면 먼저 폐기한다. */
    public synchronized String issue(String userId, GeoServerConnection conn, String previousToken) {
        long now = clock.millis();
        maybeCleanup(now);
        if (previousToken != null) {
            Entry prev = entries.get(previousToken);
            if (prev != null && prev.userId.equals(userId)) entries.remove(previousToken, prev);
        }
        // 사용자당 상한: 마지막 사용이 가장 오래된 것부터 제거(새 탭이 실패하지 않게)
        while (true) {
            List<Map.Entry<String, Entry>> mine = entries.entrySet().stream()
                    .filter(e -> e.getValue().userId.equals(userId)).toList();
            if (mine.size() < perUserMax) break;
            mine.stream().min(Comparator.comparingLong(e -> e.getValue().lastUsedMillis))
                    .ifPresent(e -> entries.remove(e.getKey(), e.getValue()));
        }
        if (entries.size() >= totalMax) {
            entries.entrySet().removeIf(e -> isExpired(e.getValue(), now)); // 만료 항목을 먼저 치우고 다시 판정
        }
        if (entries.size() >= totalMax) {
            throw new CustomException(GisErrorCode.GEOSERVER_CONNECTION_LIMIT);
        }
        String token;
        do {
            byte[] bytes = new byte[32];
            random.nextBytes(bytes);
            token = Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
        } while (entries.containsKey(token));
        entries.put(token, new Entry(userId, conn, now));
        return token;
    }

    /** 번호표 → 연결. 실패는 전부 같은 428(남의 번호표인지 알려 주지 않음). 성공하면 마지막 사용 시각 갱신. */
    public GeoServerConnection resolve(String token, String userId) {
        return resolveSnapshot(token, userId).conn();
    }

    public Snapshot resolveSnapshot(String token, String userId) {
        long now = clock.millis();
        maybeCleanup(now);
        if (token == null || userId == null || !TOKEN_FORMAT.matcher(token).matches()) {
            throw new CustomException(GisErrorCode.GEOSERVER_NOT_CONNECTED);
        }
        Entry e = entries.get(token);
        if (e == null) throw new CustomException(GisErrorCode.GEOSERVER_NOT_CONNECTED);
        if (isExpired(e, now)) {
            entries.remove(token, e);
            throw new CustomException(GisErrorCode.GEOSERVER_NOT_CONNECTED);
        }
        // 남의 번호표는 지우지 않고 428만(알아도 지울 수 없게)
        if (!e.userId.equals(userId)) throw new CustomException(GisErrorCode.GEOSERVER_NOT_CONNECTED);
        e.lastUsedMillis = now;
        long expires = Math.min(now + idleMillis, e.connectedAtMillis + maxMillis);
        return new Snapshot(e.conn, Instant.ofEpochMilli(e.connectedAtMillis), Instant.ofEpochMilli(now),
                Instant.ofEpochMilli(expires), idleMinutes);
    }

    /** 같은 사용자 번호표일 때만 제거. 없거나 남의 것이면 아무 일도 하지 않는다(멱등). */
    public void revoke(String token, String userId) {
        if (token == null || userId == null) return;
        Entry e = entries.get(token);
        if (e != null && e.userId.equals(userId)) entries.remove(token, e);
    }

    /** GeoServer가 401을 준 연결을 폐기(연결 객체 동일성으로 찾음). */
    public void invalidateByConnection(GeoServerConnection conn) {
        entries.entrySet().removeIf(e -> e.getValue().conn == conn);
    }

    // ── 시도 제한(연결 시험·연결 공통, 사용자당 1분) ─────────────────────

    public void checkAttempt(String userId) {
        long now = clock.millis();
        maybeCleanup(now);
        boolean[] limited = {false};
        attempts.compute(userId, (k, dq) -> {
            Deque<Long> d = dq == null ? new ArrayDeque<>() : dq;
            while (!d.isEmpty() && now - d.peekFirst() >= ATTEMPT_WINDOW_MS) d.pollFirst();
            if (d.size() >= attemptsPerMinute) {
                limited[0] = true;
            } else {
                d.addLast(now);
            }
            return d;
        });
        if (limited[0]) throw new CustomException(GisErrorCode.GEOSERVER_RATE_LIMITED);
    }

    // ── 내부 ────────────────────────────────────────────────────

    private boolean isExpired(Entry e, long now) {
        return now - e.lastUsedMillis > idleMillis || now - e.connectedAtMillis > maxMillis;
    }

    /** 마지막 정리 후 60초가 지났으면(CAS로 한 스레드만) 만료 항목·빈 시도 기록을 치운다. */
    private void maybeCleanup(long now) {
        long last = lastCleanup.get();
        if (now - last < CLEANUP_INTERVAL_MS || !lastCleanup.compareAndSet(last, now)) return;
        entries.entrySet().removeIf(e -> isExpired(e.getValue(), now));
        for (String userId : List.copyOf(attempts.keySet())) {
            // compute와 같은 키 단위 잠금 안에서 판단해 방금 쌓인 시도를 잃지 않는다
            attempts.computeIfPresent(userId,
                    (k, d) -> d.isEmpty() || now - d.peekLast() >= ATTEMPT_WINDOW_MS ? null : d);
        }
    }

    /** 시험·점검용: 현재 보관 개수. */
    public int size() {
        return entries.size();
    }
}
