package com.gtp.domain.post.entity;

import lombok.Getter;
import lombok.RequiredArgsConstructor;

@Getter
@RequiredArgsConstructor
public enum PostStatus {
    PUBLISHED("발행"),
    DRAFT("임시저장");

    private final String label;
}
