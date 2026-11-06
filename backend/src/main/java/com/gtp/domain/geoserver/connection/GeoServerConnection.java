package com.gtp.domain.geoserver.connection;

import java.net.URI;

/**
 * 사용자가 연결한 GeoServer 하나(불변). 서버 메모리의 {@link GeoServerConnectionRegistry}에만 보관된다.
 * Lombok @Data/@ToString을 쓰지 않는다 — toString에 비밀번호가 섞이면 안 된다.
 */
public final class GeoServerConnection {

    private final String baseUrl;
    private final String username;
    private final String password;
    private final boolean insecureTls;
    private final String version;
    /** 범례 미리보기에 쓸 레이어(처음 요청할 때 서버의 첫 레이어로 고르고 기억). */
    private volatile String legendLayer;

    /** @param baseUrl 정규화된 기준 주소(끝 / 없음, 예 https://host/geoserver) */
    public GeoServerConnection(String baseUrl, String username, String password, boolean insecureTls, String version) {
        this.baseUrl = baseUrl;
        this.username = username;
        this.password = password;
        this.insecureTls = insecureTls;
        this.version = version;
    }

    public String baseUrl() { return baseUrl; }
    public String username() { return username; }
    public String password() { return password; }
    public boolean insecureTls() { return insecureTls; }
    public String version() { return version; }
    public String legendLayer() { return legendLayer; }
    public void legendLayer(String layer) { this.legendLayer = layer; }

    /** 로그용 호스트(경로·사용자 정보 없음). */
    public String host() {
        try {
            String h = URI.create(baseUrl).getHost();
            return h == null ? "?" : h;
        } catch (RuntimeException e) {
            return "?";
        }
    }

    @Override
    public String toString() {
        return "GeoServerConnection[host=" + host() + ", username=" + username + ", password=***, insecureTls=" + insecureTls + "]";
    }
}
