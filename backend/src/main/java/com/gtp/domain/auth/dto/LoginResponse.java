package com.gtp.domain.auth.dto;

import lombok.AllArgsConstructor;
import lombok.Getter;

@Getter
@AllArgsConstructor
public class LoginResponse {

    private String token;
    private String userId;
    private String userName;
    private String nickname;
    private String role;
    private String roleLabel;
}
