package com.gtp.domain.blog.dto;

import com.fasterxml.jackson.annotation.JsonFormat;
import com.gtp.domain.blog.entity.Post;
import lombok.Getter;

import java.time.LocalDateTime;
import java.util.Arrays;
import java.util.List;

@Getter
public class PostResponse {

    private final Long   id;
    private final String slug;
    private final String title;
    private final String excerpt;
    private final String content;
    private final String category;
    private final String categoryLabel;
    private final List<String> tags;
    private final String gradient;
    private final boolean featured;
    private final String status;
    private final String statusLabel;
    private final String authorId;

    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private final LocalDateTime createdAt;

    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private final LocalDateTime updatedAt;

    public PostResponse(Post post, String categoryLabel) {
        this.id            = post.getId();
        this.slug          = post.getSlug();
        this.title         = post.getTitle();
        this.excerpt       = post.getExcerpt();
        this.content       = post.getContent();
        this.category      = post.getCategory();
        this.categoryLabel = categoryLabel;
        this.tags          = parseTags(post.getTags());
        this.gradient      = post.getGradient();
        this.featured      = post.isFeatured();
        this.status        = post.getStatus().name();
        this.statusLabel   = post.getStatus().getLabel();
        this.authorId      = post.getAuthorId();
        this.createdAt     = post.getCreatedAt();
        this.updatedAt     = post.getUpdatedAt();
    }

    /* content 제외한 요약 응답 (목록용) */
    public static PostResponse summary(Post post, String categoryLabel) {
        return new PostResponse(post, categoryLabel) {
            @Override public String getContent() { return null; }
        };
    }

    private static List<String> parseTags(String tags) {
        if (tags == null || tags.isBlank()) return List.of();
        return Arrays.stream(tags.split(","))
                .map(String::trim)
                .filter(t -> !t.isEmpty())
                .toList();
    }
}
