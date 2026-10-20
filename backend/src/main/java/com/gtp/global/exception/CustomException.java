package com.gtp.global.exception;

import lombok.Getter;

@Getter
public class CustomException extends RuntimeException {
    private final BaseErrorCode errorCode;

    public CustomException(BaseErrorCode errorCode) {
        super(errorCode.getMessage());
        this.errorCode = errorCode;
    }

    /** 에러 코드는 그대로 두고 메시지에만 값(한도 수 등)을 채울 때 쓴다. HTTP 상태는 errorCode의 것이다. */
    public CustomException(BaseErrorCode errorCode, String message) {
        super(message);
        this.errorCode = errorCode;
    }
}
