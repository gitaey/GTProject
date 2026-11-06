package com.gtp.domain.geoserver.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.gtp.domain.geoserver.connection.GeoServerConnection;
import com.gtp.domain.geoserver.connection.GeoServerConnectionRegistry;
import com.gtp.domain.geoserver.connection.GeoServerConnectionRegistry.Snapshot;
import com.gtp.domain.geoserver.connection.GeoServerHttp;
import com.gtp.domain.geoserver.connection.GeoServerHttp.HttpFailure;
import com.gtp.domain.geoserver.connection.GeoServerHttp.Req;
import com.gtp.domain.geoserver.connection.GeoServerHttp.Resp;
import com.gtp.domain.geoserver.connection.GeoServerUrlPolicy;
import com.gtp.domain.geoserver.dto.ConnectRequest;
import com.gtp.domain.geoserver.dto.ConnectionAttempt;
import com.gtp.domain.geoserver.dto.ConnectionStatus;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.net.URI;
import java.time.Duration;
import java.util.regex.Pattern;

/**
 * 연결 시험·연결 판정(6.6절). 실패는 예외가 아니라 {@link ConnectionAttempt}의 reason으로 돌려준다.
 * 시도 제한(429)·보관 상한(429)만 예외다. 비밀번호·번호표는 로그와 메시지에 쓰지 않는다.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class GeoServerConnectionService {

    private static final Duration OVERALL_DEADLINE = Duration.ofSeconds(20);
    private static final Pattern VERSION_FORMAT = Pattern.compile("^[0-9A-Za-z._-]{1,40}$");
    private static final String JSON = "application/json";

    private final GeoServerHttp http;
    private final GeoServerConnectionRegistry registry;
    private final ObjectMapper objectMapper = new ObjectMapper();

    /** 시험만 한다(보관 안 함). */
    public ConnectionAttempt test(String userId, ConnectRequest req) {
        return attempt(userId, req, null, false);
    }

    /** 시험 + 성공하면 보관하고 번호표 발급. previousToken이 같은 사용자 것이면 폐기한다. */
    public ConnectionAttempt connect(String userId, ConnectRequest req, String previousToken) {
        return attempt(userId, req, previousToken, true);
    }

    public static ConnectionStatus toStatus(Snapshot s) {
        GeoServerConnection c = s.conn();
        return new ConnectionStatus(c.baseUrl(), c.username(), c.version(), c.insecureTls(),
                s.connectedAt().toString(), s.lastUsedAt().toString(), s.expiresAt().toString(), s.idleMinutes());
    }

    // ── 판정 ────────────────────────────────────────────────────

    private ConnectionAttempt attempt(String userId, ConnectRequest req, String previousToken, boolean save) {
        registry.checkAttempt(userId); // 429

        String inputError = validate(req);
        if (inputError != null) return fail("INPUT_INVALID", inputError);

        String input = req.getUrl().strip();
        GeoServerUrlPolicy.Normalized norm = GeoServerUrlPolicy.normalize(input);
        if (!norm.ok()) return fail("URL_INVALID", norm.error());

        long deadline = System.nanoTime() + OVERALL_DEADLINE.toNanos();
        String username = req.getUsername().strip();
        Probe last = null;
        for (String base : GeoServerUrlPolicy.candidates(norm.url())) {
            Probe p = probe(base, username, req.getPassword(), req.isInsecureTls(), deadline);
            last = p;
            if (!p.tryNext) break;
        }

        ConnectionAttempt result;
        if (last.ok) {
            String adjustedTo = last.base;
            if (save) {
                GeoServerConnection conn = new GeoServerConnection(last.base, username, req.getPassword(),
                        req.isInsecureTls(), last.version);
                String token = registry.issue(userId, conn, previousToken); // 429 (전체 상한)
                ConnectionStatus status = toStatus(registry.resolveSnapshot(token, userId));
                result = ConnectionAttempt.builder().ok(true).reason("OK")
                        .message(okMessage(last.version, !input.equals(adjustedTo), adjustedTo))
                        .normalizedUrl(adjustedTo).urlAdjusted(!input.equals(adjustedTo))
                        .version(last.version).token(token).status(status).build();
            } else {
                result = ConnectionAttempt.builder().ok(true).reason("OK")
                        .message(okMessage(last.version, !input.equals(adjustedTo), adjustedTo))
                        .normalizedUrl(adjustedTo).urlAdjusted(!input.equals(adjustedTo))
                        .version(last.version).build();
            }
        } else {
            result = ConnectionAttempt.builder().ok(false).reason(last.reason)
                    .message(failMessage(last))
                    .normalizedUrl(last.base).urlAdjusted(!input.equals(last.base))
                    .version(null).httpStatus(last.httpStatus).redirectLocation(last.redirectLocation).build();
        }
        log.info("[GeoServer] {} userId={} host={} insecureTls={} reason={}", save ? "연결" : "연결 시험",
                userId, hostOf(last.base), req.isInsecureTls(), result.getReason());
        return result;
    }

    /** 후보 주소 하나에 대한 판정 결과. tryNext=true면 다음 후보를 시도한다(둘 다 404일 때만). */
    private static final class Probe {
        boolean ok;
        boolean tryNext;
        String base;
        String reason;
        Integer httpStatus;
        String redirectLocation;
        String version;
    }

    private Probe probe(String base, String username, String password, boolean insecure, long deadline) {
        Probe p = new Probe();
        p.base = base;
        GeoServerConnection tmp = new GeoServerConnection(base, username, password, insecure, null);

        // a. 버전
        Resp a = fetch(tmp, p, base + "/rest/about/version.json", deadline);
        if (a == null) return p;
        boolean aMissing = false;
        String version = null;
        if (a.status() == 200) {
            JsonNode root = parseJson(a);
            if (root == null || !root.has("about")) return end(p, "NOT_GEOSERVER", a.status());
            version = parseVersion(root);
        } else if (a.status() == 404) {
            aMissing = true;
        } else if (!classifyStatus(p, a, base)) {
            aMissing = true; // 그 밖의 4xx — 버전 API가 없는 서버일 수 있으니 b에서 확인한다
        } else {
            return p;
        }

        // b. 관리 권한 확인 겸 workspaces
        Resp b = fetch(tmp, p, base + "/rest/workspaces.json", deadline);
        if (b == null) return p;
        if (b.status() == 200) {
            JsonNode root = parseJson(b);
            if (root == null || !root.has("workspaces")) return end(p, "NOT_GEOSERVER", b.status());
            p.ok = true;
            p.reason = "OK";
            p.version = version;
            return p;
        }
        if (b.status() == 404) {
            p.reason = "NOT_FOUND";
            p.httpStatus = 404;
            p.tryNext = aMissing;
            return p;
        }
        if (classifyStatus(p, b, base)) return p;
        return end(p, "NOT_GEOSERVER", b.status());
    }

    /**
     * 401·403·3xx·5xx를 reason으로 바꿔 p에 기록한다. 기록했으면 true(여기서 끝).
     * 200·404·그 밖의 4xx는 false(호출자가 판단).
     */
    private boolean classifyStatus(Probe p, Resp r, String base) {
        int s = r.status();
        if (s == 401) { end(p, "AUTH_FAILED", s); return true; }
        if (s == 403) { end(p, "FORBIDDEN", s); return true; }
        if (r.is3xx()) {
            end(p, "REDIRECTED", s);
            p.redirectLocation = GeoServerHttp.safeLocation(r.location(), URI.create(base + "/rest"));
            return true;
        }
        if (s >= 500) { end(p, "SERVER_ERROR", s); return true; }
        return false;
    }

    private static Probe end(Probe p, String reason, Integer httpStatus) {
        p.reason = reason;
        p.httpStatus = httpStatus;
        return p;
    }

    /** 요청 하나. 전송 실패는 p에 reason을 기록하고 null을 돌려준다. */
    private Resp fetch(GeoServerConnection tmp, Probe p, String url, long deadline) {
        long remainingNanos = deadline - System.nanoTime();
        if (remainingNanos <= 0) {
            end(p, "TIMEOUT", null);
            return null;
        }
        Duration timeout = Duration.ofNanos(Math.min(remainingNanos, GeoServerHttp.TIMEOUT_TEST.toNanos()));
        try {
            return http.send(tmp, Req.get(url, JSON, timeout, GeoServerHttp.MAX_TEXT_BYTES));
        } catch (HttpFailure f) {
            end(p, switch (f.failure()) {
                case URL_BLOCKED -> "URL_BLOCKED";
                case DNS_FAILED -> "DNS_FAILED";
                case CONNECT_FAILED -> "CONNECT_FAILED";
                case TIMEOUT -> "TIMEOUT";
                case TLS_FAILED -> "TLS_FAILED";
                case TOO_LARGE -> "RESPONSE_TOO_LARGE";
            }, null);
            return null;
        }
    }

    /** JSON 객체면 파싱 결과, 아니면(HTML·빈 본문 등) null. */
    private JsonNode parseJson(Resp r) {
        try {
            JsonNode n = objectMapper.readTree(r.body());
            return n != null && n.isObject() ? n : null;
        } catch (IOException e) {
            return null;
        }
    }

    /**
     * about.resource는 배열이거나 단일 객체일 수 있다(2.x 차이). 이름이 GeoServer인 원소의 Version을 읽는다.
     * 형식이 맞지 않거나 못 찾으면 null(about이 있으면 GeoServer로는 인정).
     */
    static String parseVersion(JsonNode root) {
        for (JsonNode el : GeoServerService.asList(root.path("about").path("resource"))) {
            String name = firstText(el, "@name", "name");
            if (name != null && name.equalsIgnoreCase("GeoServer")) {
                String v = firstText(el, "Version", "version");
                if (v != null && VERSION_FORMAT.matcher(v).matches()) return v;
            }
        }
        return null;
    }

    private static String firstText(JsonNode el, String... keys) {
        for (String k : keys) {
            JsonNode n = el.path(k);
            if (n.isValueNode() && !n.isNull()) return n.asText();
        }
        return null;
    }

    // ── 입력 검사 ───────────────────────────────────────────────

    /** 문제가 있으면 어느 칸이 왜인지(값 제외) 문구, 없으면 null. */
    static String validate(ConnectRequest req) {
        if (req == null) return "요청 내용이 비었습니다.";
        String url = req.getUrl();
        if (url == null || url.isBlank()) return "주소를 입력하세요.";
        if (url.length() > 2048) return "주소는 2048자 이하여야 합니다.";
        String user = req.getUsername() == null ? "" : req.getUsername().strip();
        if (user.isEmpty()) return "아이디를 입력하세요.";
        if (user.length() > 200) return "아이디는 200자 이하여야 합니다.";
        if (user.indexOf(':') >= 0) return "아이디에는 :를 쓸 수 없습니다(Basic 인증 형식).";
        if (hasControl(user)) return "아이디에 제어 문자를 넣을 수 없습니다.";
        String pw = req.getPassword();
        if (pw == null || pw.isEmpty()) return "비밀번호를 입력하세요.";
        if (pw.length() > 1024) return "비밀번호는 1024자 이하여야 합니다.";
        if (hasControl(pw)) return "비밀번호에 줄바꿈 같은 제어 문자를 넣을 수 없습니다.";
        return null;
    }

    private static boolean hasControl(String s) {
        for (int i = 0; i < s.length(); i++) {
            if (Character.isISOControl(s.charAt(i))) return true;
        }
        return false;
    }

    // ── 문구(6.6절 표) — 제목과 힌트는 줄바꿈 하나로 이어 붙인다 ─────────────────

    private ConnectionAttempt fail(String reason, String detail) {
        String title = switch (reason) {
            case "INPUT_INVALID" -> "입력값을 확인하세요";
            case "URL_INVALID" -> "주소 형식이 올바르지 않습니다";
            default -> reason;
        };
        return ConnectionAttempt.builder().ok(false).reason(reason).message(title + "\n" + detail)
                .urlAdjusted(false).build();
    }

    private static String okMessage(String version, boolean adjusted, String adjustedTo) {
        String title = "연결할 수 있습니다 — GeoServer " + (version == null ? "(버전 정보 없음)" : version);
        return adjusted ? title + "\n주소를 " + adjustedTo + "로 고쳤습니다." : title;
    }

    private static String failMessage(Probe p) {
        String code = p.httpStatus == null ? "" : String.valueOf(p.httpStatus);
        String[] tp = switch (p.reason) {
            case "URL_BLOCKED" -> new String[]{"이 주소로는 연결할 수 없습니다", "링크로컬·클라우드 메타데이터 주소는 막혀 있습니다."};
            case "DNS_FAILED" -> new String[]{"서버 이름을 찾을 수 없습니다", "철자를 확인하고, 백엔드 서버에서 이 이름이 풀리는지(내부 DNS) 확인하세요."};
            case "CONNECT_FAILED" -> new String[]{"서버에 연결할 수 없습니다", "포트·방화벽, 백엔드 서버에서 나갈 수 있는지 확인하세요."};
            case "TIMEOUT" -> new String[]{"응답 시간이 초과되었습니다", "서버가 느리거나 방화벽이 연결을 버리고 있을 수 있습니다."};
            case "TLS_FAILED" -> new String[]{"인증서를 확인할 수 없습니다", "자체 서명 인증서면 '인증서 검증 안 함'을 켜세요. http·https가 바뀌었을 수도 있습니다."};
            case "REDIRECTED" -> new String[]{"서버가 다른 주소로 보냅니다: " + p.redirectLocation, "그 주소로 다시 입력하세요(자동으로 따라가지 않습니다)."};
            case "AUTH_FAILED" -> new String[]{"인증 실패 (HTTP 401)", "아이디·비밀번호를 확인하세요. 외부 인증 서버를 쓰면 REST Basic 인증이 허용되는지 확인하세요."};
            case "FORBIDDEN" -> new String[]{"이 계정에는 REST 관리 권한이 없습니다 (HTTP 403)", "GeoServer 관리자 역할 계정이 필요합니다."};
            case "NOT_FOUND" -> new String[]{"이 주소에서 GeoServer REST를 찾지 못했습니다 (HTTP 404)", "주소 끝 경로(/geoserver)를 확인하세요."};
            case "NOT_GEOSERVER" -> new String[]{"GeoServer 응답이 아닙니다", "로그인 페이지나 다른 웹 서버일 수 있습니다."};
            case "SERVER_ERROR" -> new String[]{"GeoServer 서버 오류 (HTTP " + code + ")", "GeoServer 로그를 확인하세요."};
            case "RESPONSE_TOO_LARGE" -> new String[]{"응답이 너무 큽니다", "GeoServer가 아닌 주소일 수 있습니다."};
            default -> new String[]{p.reason, ""};
        };
        return tp[1].isEmpty() ? tp[0] : tp[0] + "\n" + tp[1];
    }

    private static String hostOf(String base) {
        try {
            String h = URI.create(base).getHost();
            return h == null ? "?" : h;
        } catch (RuntimeException e) {
            return "?";
        }
    }
}
