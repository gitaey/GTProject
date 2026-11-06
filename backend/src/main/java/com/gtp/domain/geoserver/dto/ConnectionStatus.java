package com.gtp.domain.geoserver.dto;

import lombok.AllArgsConstructor;
import lombok.Getter;

/** 현재 연결 상태. password·번호표 필드는 없다. 시각은 ISO-8601 UTC 문자열(Instant.toString). */
@Getter
@AllArgsConstructor
public class ConnectionStatus {
    private final String url;
    private final String username;
    private final String version;
    private final boolean insecureTls;
    private final String connectedAt;
    private final String lastUsedAt;
    private final String expiresAt;
    private final int idleMinutes;
}
