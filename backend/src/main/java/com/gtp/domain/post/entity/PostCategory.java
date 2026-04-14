package com.gtp.domain.post.entity;

import lombok.Getter;
import lombok.RequiredArgsConstructor;

@Getter
@RequiredArgsConstructor
public enum PostCategory {
    DEV("개발"),
    PARENTING("육아"),
    DAILY("일상");

    private final String label;
}
