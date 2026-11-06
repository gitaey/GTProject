package com.gtp.domain.geoserver.dto;

import lombok.Builder;
import lombok.Getter;

/** 연결 시험·연결 결과. 실패도 예외가 아니라 ok=false + reason으로 돌려준다. 비밀번호·번호표(성공 시 token 제외)를 담지 않는다. */
@Getter
@Builder
public class ConnectionAttempt {
    private final boolean ok;
    private final String reason;
    private final String message;
    private final String normalizedUrl;
    private final boolean urlAdjusted;
    private final String version;
    private final Integer httpStatus;
    private final String redirectLocation;
    private final String token;
    private final ConnectionStatus status;
}
