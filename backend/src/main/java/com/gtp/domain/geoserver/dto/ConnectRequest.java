package com.gtp.domain.geoserver.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.Getter;
import lombok.Setter;

/** 연결 시험·연결 요청. 비밀번호가 로그에 섞이지 않도록 toString에서 제외한다(@Data·@ToString 쓰지 않음). */
@Getter
@Setter
public class ConnectRequest {
    private String url;
    private String username;
    @JsonProperty(access = JsonProperty.Access.WRITE_ONLY) // 요청으로는 받되 JSON으로 내보내지 않는다
    private String password;
    private boolean insecureTls;

    @Override
    public String toString() {
        return "ConnectRequest[password=***]";
    }
}
