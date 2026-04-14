package com.gtp.domain.post.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import lombok.Getter;

import java.util.List;

@Getter
public class PostRequest {

    @NotBlank(message = "슬러그를 입력해주세요.")
    private String slug;

    @NotBlank(message = "제목을 입력해주세요.")
    private String title;

    private String excerpt;

    private String content;

    @NotNull(message = "카테고리를 선택해주세요.")
    private String category;

    private List<String> tags;

    private String emoji;

    private String gradient;

    private boolean featured;

    private String status;
}
