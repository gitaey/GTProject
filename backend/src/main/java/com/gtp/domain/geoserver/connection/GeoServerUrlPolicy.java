package com.gtp.domain.geoserver.connection;

import java.net.IDN;
import java.net.Inet4Address;
import java.net.Inet6Address;
import java.net.InetAddress;
import java.net.URI;
import java.net.URISyntaxException;
import java.net.UnknownHostException;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Locale;
import java.util.Set;

/**
 * GeoServer 주소 정규화 + 주소(IP) 검사(SSRF). 상태가 없는 순수 함수 모음이다.
 * DNS 해석기는 {@link HostResolver}로 주입받아 시험에서 바꿀 수 있다.
 */
public final class GeoServerUrlPolicy {

    private GeoServerUrlPolicy() {
    }

    /** 호스트 이름 → 모든 IP. 운영은 InetAddress::getAllByName. */
    @FunctionalInterface
    public interface HostResolver {
        InetAddress[] resolve(String host) throws UnknownHostException;
    }

    public static final HostResolver SYSTEM_RESOLVER = InetAddress::getAllByName;

    /** 정규화 결과. error가 null이 아니면 실패(url은 null). */
    public record Normalized(String url, String error) {
        public boolean ok() {
            return error == null;
        }
    }

    private static final int MAX_URL_LENGTH = 2048;
    private static final Set<String> SERVICE_SEGMENTS = Set.of("ows", "wms", "wfs", "wcs", "wmts", "gwc", "index.html");

    private static Normalized fail(String msg) {
        return new Normalized(null, msg);
    }

    /** 6.3절 순서대로. 실패하면 사용자에게 보일 힌트(값 자체는 넣지 않음)가 error에 든다. */
    public static Normalized normalize(String input) {
        if (input == null) return fail("주소를 입력하세요.");
        String s = input.strip();
        if (s.isEmpty()) return fail("주소를 입력하세요.");
        if (s.length() > MAX_URL_LENGTH) return fail("주소는 " + MAX_URL_LENGTH + "자 이하여야 합니다.");
        for (int i = 0; i < s.length(); i++) {
            char c = s.charAt(i);
            if (Character.isWhitespace(c) || Character.isISOControl(c)) {
                return fail("주소에 공백이나 제어 문자를 넣을 수 없습니다.");
            }
        }
        int sep = s.indexOf("://");
        if (sep <= 0 || !s.substring(0, sep).matches("[A-Za-z][A-Za-z0-9+.\\-]*")) {
            return fail("주소는 http:// 또는 https://로 시작해야 합니다.");
        }
        String scheme = s.substring(0, sep).toLowerCase(Locale.ROOT);
        if (!scheme.equals("http") && !scheme.equals("https")) {
            return fail("http:// 또는 https:// 주소만 쓸 수 있습니다.");
        }

        // 비ASCII 호스트(한글 도메인)는 java.net.URI가 호스트로 인정하지 않으므로 먼저 punycode로 바꾼다.
        String rest = s.substring(sep + 3);
        int authEnd = indexOfAny(rest, "/?#");
        String authority = authEnd < 0 ? rest : rest.substring(0, authEnd);
        String tail = authEnd < 0 ? "" : rest.substring(authEnd);
        if (authority.indexOf('@') >= 0) return fail("주소에 아이디·비밀번호를 넣지 마세요.");
        if (!isAscii(authority)) {
            authority = idnAuthority(authority);
            if (authority == null) return fail("호스트 이름을 해석할 수 없습니다.");
        }

        URI uri;
        try {
            uri = new URI(scheme + "://" + authority + tail);
        } catch (URISyntaxException e) {
            return fail("주소 형식이 올바르지 않습니다.");
        }
        if (uri.getRawUserInfo() != null) return fail("주소에 아이디·비밀번호를 넣지 마세요.");
        String host = uri.getHost();
        if (host == null || host.isEmpty()) {
            if (authority.indexOf('_') >= 0) {
                return fail("호스트 이름에 _를 쓸 수 없습니다. IP 주소로 입력하세요.");
            }
            return fail("호스트 이름을 읽을 수 없습니다.");
        }
        host = host.toLowerCase(Locale.ROOT);
        int port = uri.getPort();
        if (port != -1 && (port < 1 || port > 65535)) return fail("포트 번호가 올바르지 않습니다(1~65535).");
        if ((scheme.equals("http") && port == 80) || (scheme.equals("https") && port == 443)) port = -1;

        List<String> segments = new ArrayList<>();
        String rawPath = uri.getRawPath() == null ? "" : uri.getRawPath();
        for (String seg : rawPath.split("/")) {
            if (seg.isEmpty()) continue;
            if (seg.equals(".") || seg.equals("..")) return fail("주소 경로에 . 또는 ..를 쓸 수 없습니다.");
            segments.add(seg);
        }
        for (int i = 0; i < segments.size(); i++) {
            String low = segments.get(i).toLowerCase(Locale.ROOT);
            if (low.equals("web") || low.equals("rest")) {
                segments = new ArrayList<>(segments.subList(0, i));
                break;
            }
        }
        if (!segments.isEmpty()
                && SERVICE_SEGMENTS.contains(segments.get(segments.size() - 1).toLowerCase(Locale.ROOT))) {
            segments.remove(segments.size() - 1);
        }

        StringBuilder out = new StringBuilder(scheme).append("://").append(host);
        if (port != -1) out.append(':').append(port);
        for (String seg : segments) out.append('/').append(seg);
        return new Normalized(out.toString(), null);
    }

    /** 정규화된 주소에서 시험해 볼 기준 주소 후보(중복 없음, 입력 주소가 먼저). 6.6절. */
    public static List<String> candidates(String normalized) {
        List<String> out = new ArrayList<>();
        out.add(normalized);
        int schemeEnd = normalized.indexOf("://") + 3;
        int pathStart = normalized.indexOf('/', schemeEnd);
        if (pathStart < 0) {
            out.add(normalized + "/geoserver");
        } else {
            String path = normalized.substring(pathStart + 1);
            int segCount = path.split("/").length;
            if (segCount >= 2) out.add(normalized.substring(0, normalized.lastIndexOf('/')));
        }
        return out;
    }

    /**
     * 풀린 모든 IP 중 하나라도 차단 대상이면 true(fail closed). 이름을 못 찾으면 UnknownHostException.
     * 문자열이 아니라 IP로 판정하므로 표기 장난(10진수 등)도 풀린 뒤에 걸린다.
     */
    public static boolean isBlockedHost(String host, HostResolver resolver) throws UnknownHostException {
        InetAddress[] addrs = resolver.resolve(host);
        if (addrs == null || addrs.length == 0) throw new UnknownHostException(host);
        for (InetAddress a : addrs) {
            if (isBlocked(a)) return true;
        }
        return false;
    }

    /** 차단 대상: 링크로컬(메타데이터 169.254.169.254 포함)·알려진 메타데이터 단일 주소·미지정·멀티캐스트·브로드캐스트. 사설망·loopback은 허용. */
    public static boolean isBlocked(InetAddress a) {
        if (a instanceof Inet4Address) {
            return isBlockedV4(a.getAddress());
        }
        if (a instanceof Inet6Address) {
            byte[] b = a.getAddress();
            if (a.isLoopbackAddress()) return false; // ::1
            if (a.isAnyLocalAddress() || a.isLinkLocalAddress() || a.isMulticastAddress()) return true;
            // AWS IPv6 메타데이터 fd00:ec2::254 (fd00::/8 전체는 사설망이라 막지 않는다)
            if ((b[0] & 0xff) == 0xfd && b[1] == 0x00 && b[2] == 0x0e && (b[3] & 0xff) == 0xc2
                    && allZero(b, 4, 14) && b[14] == 0x02 && (b[15] & 0xff) == 0x54) {
                return true;
            }
            // IPv4-매핑(::ffff:a.b.c.d) — Java가 보통 Inet4Address로 풀지만 방어
            if (allZero(b, 0, 10) && (b[10] & 0xff) == 0xff && (b[11] & 0xff) == 0xff) {
                return isBlockedV4(Arrays.copyOfRange(b, 12, 16));
            }
            // IPv4-호환(::a.b.c.d)
            if (allZero(b, 0, 12)) {
                return isBlockedV4(Arrays.copyOfRange(b, 12, 16));
            }
            // NAT64 64:ff9b::/96
            if (b[0] == 0x00 && b[1] == 0x64 && (b[2] & 0xff) == 0xff && (b[3] & 0xff) == 0x9b && allZero(b, 4, 12)) {
                return isBlockedV4(Arrays.copyOfRange(b, 12, 16));
            }
            // 6to4 2002::/16 — 안에 든 IPv4는 b[2..5]
            if (b[0] == 0x20 && b[1] == 0x02) {
                return isBlockedV4(Arrays.copyOfRange(b, 2, 6));
            }
        }
        return false;
    }

    private static boolean isBlockedV4(byte[] b) {
        int o0 = b[0] & 0xff;
        int o1 = b[1] & 0xff;
        int o2 = b[2] & 0xff;
        int o3 = b[3] & 0xff;
        if (o0 == 0) return true;                                           // 0.0.0.0/8
        if (o0 == 169 && o1 == 254) return true;                            // 링크로컬(클라우드 메타데이터)
        if (o0 == 100 && o1 == 100 && o2 == 100 && o3 == 200) return true;  // 알리바바 메타데이터
        return o0 >= 224;                                                   // 멀티캐스트 224/4, 예약 240/4, 브로드캐스트
    }

    private static boolean allZero(byte[] b, int from, int to) {
        for (int i = from; i < to; i++) {
            if (b[i] != 0) return false;
        }
        return true;
    }

    private static boolean isAscii(String s) {
        for (int i = 0; i < s.length(); i++) {
            if (s.charAt(i) > 127) return false;
        }
        return true;
    }

    private static int indexOfAny(String s, String chars) {
        for (int i = 0; i < s.length(); i++) {
            if (chars.indexOf(s.charAt(i)) >= 0) return i;
        }
        return -1;
    }

    /** host[:port]에서 host만 punycode로. IPv6 리터럴 안의 비ASCII는 실패. */
    private static String idnAuthority(String authority) {
        if (authority.startsWith("[")) return null;
        String host = authority;
        String port = "";
        int colon = authority.lastIndexOf(':');
        if (colon >= 0) {
            host = authority.substring(0, colon);
            port = authority.substring(colon);
        }
        try {
            return IDN.toASCII(host, IDN.ALLOW_UNASSIGNED) + port;
        } catch (IllegalArgumentException e) {
            return null;
        }
    }
}
