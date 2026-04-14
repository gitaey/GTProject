package com.gtp.domain.user.dto;

import jakarta.validation.constraints.NotEmpty;
import lombok.Getter;

import java.util.List;

@Getter
public class UserBatchDeleteRequest {

    @NotEmpty(message = "삭제할 사용자를 선택해주세요.")
    private List<String> ids;
}
