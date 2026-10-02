package com.gtp.global.exception;

import org.springframework.http.HttpStatus;

/**
 * CustomException이 받는 에러 코드 계약.
 * 전역 {@link ErrorCode}와 지도 전용 {@code com.gtp.global.gis.GisErrorCode}가 구현한다.
 */
public interface BaseErrorCode {
    HttpStatus getStatus();

    String getMessage();
}
