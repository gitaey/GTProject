package com.gtp.domain.geoserver.connection;

import com.gtp.global.exception.CustomException;
import com.gtp.global.gis.GisErrorCode;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import jakarta.annotation.PreDestroy;
import javax.net.ssl.SSLContext;
import javax.net.ssl.SSLEngine;
import javax.net.ssl.SSLException;
import javax.net.ssl.TrustManager;
import javax.net.ssl.X509ExtendedTrustManager;
import java.io.IOException;
import java.io.InputStream;
import java.net.ConnectException;
import java.net.NoRouteToHostException;
import java.net.Socket;
import java.net.URI;
import java.net.UnknownHostException;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.net.http.HttpTimeoutException;
import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.cert.X509Certificate;
import java.time.Duration;
import java.util.Base64;
import java.util.Locale;
import java.util.concurrent.ScheduledFuture;
import java.util.concurrent.ScheduledThreadPoolExecutor;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * GeoServer로 나가는 HTTP의 단일 통로. 모든 외부 호출은 여기만 지난다.
 * 요청마다 호스트를 IP로 풀어 링크로컬·메타데이터 주소를 막고(fail closed), 리다이렉트를 따라가지 않으며,
 * 시간·응답 크기 제한을 건다. 요청 헤더·본문·비밀번호·번호표는 로그에 남기지 않는다.
 */
@Slf4j
@Component
public class GeoServerHttp {

    public static final Duration TIMEOUT_TEST = Duration.ofSeconds(8);
    public static final Duration TIMEOUT_NORMAL = Duration.ofSeconds(30);
    public static final Duration TIMEOUT_PUBLISH = Duration.ofSeconds(60);
    public static final Duration TIMEOUT_LEGEND = Duration.ofSeconds(15);
    public static final int MAX_TEXT_BYTES = 10 * 1024 * 1024;
    public static final int MAX_PNG_BYTES = 2 * 1024 * 1024;

    /** 요청 보내기 전 단계에서 나는 실패의 종류(시험은 reason, 작업은 에러 코드로 바뀐다). */
    public enum Failure { URL_BLOCKED, DNS_FAILED, CONNECT_FAILED, TIMEOUT, TLS_FAILED, TOO_LARGE }

    /** {@link #send}가 던지는 전송 실패. 메시지에 URL·본문을 넣지 않는다. */
    public static final class HttpFailure extends RuntimeException {
        private final Failure failure;

        public HttpFailure(Failure failure, String detail) {
            super(detail, null, false, false);
            this.failure = failure;
        }

        public Failure failure() {
            return failure;
        }
    }

    /** 요청 하나. url은 절대 주소(연결의 기준 주소 + 경로). */
    public record Req(String method, String url, String accept, String contentType, byte[] body,
                      Duration timeout, int maxBytes) {
        public static Req get(String url, String accept, Duration timeout, int maxBytes) {
            return new Req("GET", url, accept, null, null, timeout, maxBytes);
        }

        public static Req send(String method, String url, String accept, String contentType, String body, Duration timeout) {
            return new Req(method, url, accept, contentType,
                    body == null ? null : body.getBytes(StandardCharsets.UTF_8), timeout, MAX_TEXT_BYTES);
        }
    }

    /** 응답. body는 최대 Req.maxBytes. 3xx면 location에 Location 헤더 원문. */
    public record Resp(int status, byte[] body, String contentType, String location) {
        public String text() {
            return new String(body, StandardCharsets.UTF_8);
        }

        public boolean is2xx() {
            return status >= 200 && status < 300;
        }

        public boolean is3xx() {
            return status >= 300 && status < 400;
        }
    }

    private final GeoServerConnectionRegistry registry;
    private volatile GeoServerUrlPolicy.HostResolver resolver = GeoServerUrlPolicy.SYSTEM_RESOLVER;
    /** 본문 읽기 마감 감시자(데몬 스레드 1개). 마감 시각에 스트림을 닫는다. */
    private final ScheduledThreadPoolExecutor watchdogPool = newWatchdogPool();
    private HttpClient verified;
    private HttpClient insecure;

    public GeoServerHttp(GeoServerConnectionRegistry registry) {
        this.registry = registry;
    }

    @PreDestroy
    void shutdown() {
        watchdogPool.shutdownNow();
    }

    private static ScheduledThreadPoolExecutor newWatchdogPool() {
        ScheduledThreadPoolExecutor pool = new ScheduledThreadPoolExecutor(1, r -> {
            Thread t = new Thread(r, "geoserver-http-watchdog");
            t.setDaemon(true);
            return t;
        });
        pool.setRemoveOnCancelPolicy(true);
        return pool;
    }

    /** 시험용: DNS 해석기를 바꾼다. */
    public void setResolver(GeoServerUrlPolicy.HostResolver resolver) {
        this.resolver = resolver;
    }

    // ── 작업용(연결된 GeoServer 호출) ───────────────────────────────

    /**
     * 작업 호출: 전송 실패·3xx·401은 CustomException으로 바꾼다. 401이면 연결을 폐기한다.
     * 그 밖의 상태 코드(2xx·403·404·5xx)는 호출자가 판단하도록 그대로 돌려준다.
     */
    public Resp call(GeoServerConnection conn, String op, Req req) {
        Resp res;
        try {
            res = send(conn, req);
        } catch (HttpFailure f) {
            log.debug("[GeoServer] {} 전송 실패 host={} reason={}", op, conn.host(), f.failure());
            throw toCustom(f);
        }
        if (res.is3xx()) {
            log.debug("[GeoServer] {} 리다이렉트 host={} HTTP {}", op, conn.host(), res.status());
            throw GisErrorCode.GEOSERVER_REDIRECTED.exception(safeLocation(res.location(), URI.create(req.url())));
        }
        if (res.status() == 401) {
            registry.invalidateByConnection(conn);
            log.info("[GeoServer] {} — GeoServer가 계정을 거부해 연결을 폐기함 host={}", op, conn.host());
            throw new CustomException(GisErrorCode.GEOSERVER_AUTH_REJECTED);
        }
        if (!res.is2xx()) {
            log.debug("[GeoServer] {} host={} HTTP {} : {}", op, conn.host(), res.status(), preview(res.body()));
        }
        return res;
    }

    public static CustomException toCustom(HttpFailure f) {
        return switch (f.failure()) {
            case URL_BLOCKED -> new CustomException(GisErrorCode.GEOSERVER_ADDRESS_BLOCKED);
            case DNS_FAILED -> GisErrorCode.GEOSERVER_UNREACHABLE.exception("서버 이름을 찾을 수 없음");
            case CONNECT_FAILED -> GisErrorCode.GEOSERVER_UNREACHABLE.exception("연결 거부");
            case TIMEOUT -> new CustomException(GisErrorCode.GEOSERVER_TIMEOUT);
            case TLS_FAILED -> new CustomException(GisErrorCode.GEOSERVER_TLS_FAILED);
            case TOO_LARGE -> new CustomException(GisErrorCode.GEOSERVER_RESPONSE_INVALID);
        };
    }

    // ── 저수준(연결 시험도 사용) ─────────────────────────────────────

    /** 주소 검사 → 전송 → 크기 제한 읽기. 리다이렉트는 따라가지 않고 3xx 그대로 돌려준다. */
    public Resp send(GeoServerConnection conn, Req req) {
        URI uri = URI.create(req.url());
        String host = uri.getHost();
        try {
            if (host == null || GeoServerUrlPolicy.isBlockedHost(host, resolver)) {
                throw new HttpFailure(Failure.URL_BLOCKED, "blocked");
            }
        } catch (UnknownHostException e) {
            throw new HttpFailure(Failure.DNS_FAILED, "dns");
        }

        HttpRequest.Builder b = HttpRequest.newBuilder(uri)
                .timeout(req.timeout())
                .header("Authorization", basicAuth(conn))
                .header("Accept", req.accept());
        if (req.contentType() != null) b.header("Content-Type", req.contentType());
        b.method(req.method(), req.body() == null
                ? HttpRequest.BodyPublishers.noBody()
                : HttpRequest.BodyPublishers.ofByteArray(req.body()));

        long startNanos = System.nanoTime();
        AtomicBoolean timedOut = new AtomicBoolean();
        try {
            // HttpRequest.timeout은 응답 헤더까지만 덮는다 — 본문 읽기는 아래 감시자가 같은 전체 마감(req.timeout)으로 끊는다
            HttpResponse<InputStream> res = client(conn.insecureTls()).send(b.build(), HttpResponse.BodyHandlers.ofInputStream());
            try (InputStream in = res.body()) {
                long remainingNanos = req.timeout().toNanos() - (System.nanoTime() - startNanos);
                if (remainingNanos <= 0) throw new HttpFailure(Failure.TIMEOUT, "deadline");
                ScheduledFuture<?> watchdog = watchdogPool.schedule(() -> {
                    timedOut.set(true);
                    try {
                        in.close(); // 막힌 read()를 IOException으로 깨운다
                    } catch (IOException ignored) {
                        // 닫기 실패는 무시 — 읽기 쪽이 마감 초과로 처리한다
                    }
                }, remainingNanos, TimeUnit.NANOSECONDS);
                String len = res.headers().firstValue("Content-Length").orElse(null);
                if (len != null && isLongerThan(len, req.maxBytes())) {
                    throw new HttpFailure(Failure.TOO_LARGE, "too large");
                }
                byte[] body;
                try {
                    body = in.readNBytes(req.maxBytes() + 1);
                } finally {
                    watchdog.cancel(false);
                }
                if (body.length > req.maxBytes()) throw new HttpFailure(Failure.TOO_LARGE, "too large");
                return new Resp(res.statusCode(), body,
                        res.headers().firstValue("Content-Type").orElse(""),
                        res.headers().firstValue("Location").orElse(null));
            }
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new HttpFailure(Failure.TIMEOUT, "interrupted");
        } catch (IOException e) {
            throw new HttpFailure(timedOut.get() ? Failure.TIMEOUT : classify(e), "io");
        }
    }

    private static boolean isLongerThan(String contentLength, int max) {
        try {
            return Long.parseLong(contentLength.trim()) > max;
        } catch (NumberFormatException e) {
            return false;
        }
    }

    /** 원인 사슬 전체를 보고 분류한다(HttpClient가 UnknownHost 등을 ConnectException으로 감싸는 경우가 있다). */
    static Failure classify(Throwable e) {
        boolean timeout = false;
        boolean tls = false;
        for (Throwable t = e; t != null; t = t.getCause()) {
            if (t instanceof UnknownHostException) return Failure.DNS_FAILED;
            if (t instanceof HttpTimeoutException) timeout = true;
            if (t instanceof SSLException) tls = true;
        }
        if (timeout) return Failure.TIMEOUT;
        if (tls) return Failure.TLS_FAILED;
        for (Throwable t = e; t != null; t = t.getCause()) {
            if (t instanceof ConnectException || t instanceof NoRouteToHostException) return Failure.CONNECT_FAILED;
        }
        return Failure.CONNECT_FAILED;
    }

    private static String basicAuth(GeoServerConnection c) {
        String raw = c.username() + ":" + c.password();
        return "Basic " + Base64.getEncoder().encodeToString(raw.getBytes(StandardCharsets.UTF_8));
    }

    // ── 공용 클라이언트 2개(처음 쓸 때 만든다. Java 17 HttpClient는 close가 없어 연결마다 만들지 않는다) ──

    private HttpClient client(boolean insecureTls) {
        return insecureTls ? insecureClient() : verifiedClient();
    }

    private synchronized HttpClient verifiedClient() {
        if (verified == null) verified = baseBuilder().build();
        return verified;
    }

    private synchronized HttpClient insecureClient() {
        if (insecure == null) {
            try {
                SSLContext ctx = SSLContext.getInstance("TLS");
                ctx.init(null, new TrustManager[]{new TrustAll()}, null);
                insecure = baseBuilder().sslContext(ctx).build();
            } catch (GeneralSecurityException e) {
                throw new IllegalStateException("TLS 초기화 실패", e);
            }
        }
        return insecure;
    }

    private static HttpClient.Builder baseBuilder() {
        return HttpClient.newBuilder()
                .followRedirects(HttpClient.Redirect.NEVER)
                .connectTimeout(Duration.ofSeconds(5))
                .version(HttpClient.Version.HTTP_1_1);
    }

    /**
     * 인증서 체인·호스트 이름을 모두 검사하지 않는 관리자("인증서 검증 안 함" 옵션 전용 클라이언트에만 쓴다).
     * X509ExtendedTrustManager이므로 JSSE가 호스트 이름 검사를 따로 덧씌우지 않는다. JVM 전역 설정은 건드리지 않는다.
     */
    private static final class TrustAll extends X509ExtendedTrustManager {
        @Override public void checkClientTrusted(X509Certificate[] chain, String authType) { }
        @Override public void checkServerTrusted(X509Certificate[] chain, String authType) { }
        @Override public void checkClientTrusted(X509Certificate[] chain, String authType, Socket socket) { }
        @Override public void checkServerTrusted(X509Certificate[] chain, String authType, Socket socket) { }
        @Override public void checkClientTrusted(X509Certificate[] chain, String authType, SSLEngine engine) { }
        @Override public void checkServerTrusted(X509Certificate[] chain, String authType, SSLEngine engine) { }
        @Override public X509Certificate[] getAcceptedIssuers() { return new X509Certificate[0]; }
    }

    // ── 보조 ────────────────────────────────────────────────────

    /** Location을 scheme://host[:port]/path만 남긴다(쿼리·사용자 정보 제거). 읽을 수 없으면 "(알 수 없음)". */
    public static String safeLocation(String location, URI requestUri) {
        if (location == null || location.isBlank()) return "(알 수 없음)";
        try {
            URI u = requestUri.resolve(location.strip());
            String scheme = u.getScheme() == null ? "" : u.getScheme().toLowerCase(Locale.ROOT);
            if ((!scheme.equals("http") && !scheme.equals("https")) || u.getHost() == null) return "(알 수 없음)";
            StringBuilder sb = new StringBuilder(scheme).append("://").append(u.getHost());
            if (u.getPort() != -1) sb.append(':').append(u.getPort());
            if (u.getRawPath() != null) sb.append(u.getRawPath());
            String out = sb.toString();
            return out.length() > 300 ? out.substring(0, 300) : out;
        } catch (IllegalArgumentException e) {
            return "(알 수 없음)";
        }
    }

    /** DEBUG 로그용: 응답 앞 200자, 태그 제거. */
    public static String preview(byte[] body) {
        if (body == null) return "";
        String s = new String(body, 0, Math.min(body.length, 1000), StandardCharsets.UTF_8)
                .replaceAll("<[^>]*>", " ").replaceAll("\\s+", " ").strip();
        return s.length() > 200 ? s.substring(0, 200) : s;
    }
}
