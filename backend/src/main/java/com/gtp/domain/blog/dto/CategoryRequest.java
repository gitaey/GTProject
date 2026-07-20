package com.gtp.domain.blog.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import lombok.Getter;

@Getter
public class CategoryRequest {

    @NotBlank(message = "카테고리 코드를 입력해주세요.")
    @Pattern(regexp = "^[A-Z0-9_]{1,50}$", message = "코드는 영문 대문자, 숫자, 언더스코어만 사용 가능합니다.")
    private String code;

    @NotBlank(message = "카테고리 표시명을 입력해주세요.")
    private String label;

    private int sortOrder;
}
