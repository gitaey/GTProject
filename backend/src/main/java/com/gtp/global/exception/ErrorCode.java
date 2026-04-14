package com.gtp.global.exception;

import lombok.Getter;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;

@Getter
@RequiredArgsConstructor
public enum ErrorCode {
    NOT_FOUND(HttpStatus.NOT_FOUND, "리소스를 찾을 수 없습니다."),
    INVALID_INPUT(HttpStatus.BAD_REQUEST, "잘못된 입력입니다."),
    INTERNAL_SERVER_ERROR(HttpStatus.INTERNAL_SERVER_ERROR, "서버 오류가 발생했습니다."),
    LOSTARK_API_ERROR(HttpStatus.BAD_GATEWAY, "로스트아크 API 오류가 발생했습니다."),

    // 사용자 관련
    USER_NOT_FOUND(HttpStatus.NOT_FOUND, "사용자를 찾을 수 없습니다."),
    DUPLICATE_USER_ID(HttpStatus.CONFLICT, "이미 사용 중인 아이디입니다."),
    DUPLICATE_NICKNAME(HttpStatus.CONFLICT, "이미 사용 중인 닉네임입니다."),
    DUPLICATE_EMAIL(HttpStatus.CONFLICT, "이미 사용 중인 이메일입니다."),
    INVALID_ROLE(HttpStatus.BAD_REQUEST, "유효하지 않은 역할입니다."),
    INVALID_STATUS(HttpStatus.BAD_REQUEST, "유효하지 않은 상태입니다."),
    INVALID_PERMISSION(HttpStatus.BAD_REQUEST, "해당 역할에 유효하지 않은 세부 권한입니다."),
    PERMISSION_REQUIRED(HttpStatus.BAD_REQUEST, "해당 역할은 세부 권한이 필요합니다."),

    // 포스트 관련
    POST_NOT_FOUND(HttpStatus.NOT_FOUND, "포스트를 찾을 수 없습니다."),
    DUPLICATE_SLUG(HttpStatus.CONFLICT, "이미 사용 중인 슬러그입니다."),

    // 인증 관련
    INVALID_CREDENTIALS(HttpStatus.UNAUTHORIZED, "아이디 또는 비밀번호가 올바르지 않습니다."),
    ACCOUNT_INACTIVE(HttpStatus.FORBIDDEN, "비활성화된 계정입니다."),
    UNAUTHORIZED(HttpStatus.UNAUTHORIZED, "인증이 필요합니다."),
    INVALID_TOKEN(HttpStatus.UNAUTHORIZED, "유효하지 않은 토큰입니다.");

    private final HttpStatus status;
    private final String message;
}