package com.gtp.domain.post.entity;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.Comment;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

import java.time.LocalDateTime;

@Entity
@Table(name = "tbl_post")
@Comment("블로그 포스트")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@Builder
@AllArgsConstructor
public class Post {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Comment("포스트 ID (PK, 자동증가)")
    private Long id;

    @Column(name = "slug", unique = true, nullable = false, length = 200)
    @Comment("URL 슬러그 (중복 불가)")
    private String slug;

    @Column(name = "title", nullable = false, length = 500)
    @Comment("포스트 제목")
    private String title;

    @Column(name = "excerpt", length = 1000)
    @Comment("포스트 요약")
    private String excerpt;

    @Column(name = "content", columnDefinition = "TEXT")
    @Comment("포스트 본문 (마크다운)")
    private String content;

    @Enumerated(EnumType.STRING)
    @Column(name = "category", nullable = false, length = 20)
    @Comment("카테고리 (DEV: 개발, PARENTING: 육아, DAILY: 일상)")
    private PostCategory category;

    @Column(name = "tags", length = 500)
    @Comment("태그 목록 (쉼표 구분)")
    private String tags;

    @Column(name = "emoji", length = 20)
    @Comment("커버 이모지")
    private String emoji;

    @Column(name = "gradient", length = 200)
    @Comment("Tailwind 그라디언트 클래스")
    private String gradient;

    @Column(name = "featured", nullable = false)
    @Comment("추천 포스트 여부")
    @Builder.Default
    private boolean featured = false;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, length = 20)
    @Comment("포스트 상태 (PUBLISHED: 발행, DRAFT: 임시저장)")
    @Builder.Default
    private PostStatus status = PostStatus.PUBLISHED;

    @Column(name = "author_id", length = 50)
    @Comment("작성자 ID (tbl_user 참조)")
    private String authorId;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    @Comment("작성 일시")
    private LocalDateTime createdAt;

    @UpdateTimestamp
    @Column(name = "updated_at", nullable = false)
    @Comment("최종 수정 일시")
    private LocalDateTime updatedAt;

    /* 내용 수정 */
    public void update(String slug, String title, String excerpt, String content,
                       PostCategory category, String tags, String emoji, String gradient,
                       boolean featured, PostStatus status) {
        this.slug     = slug;
        this.title    = title;
        this.excerpt  = excerpt;
        this.content  = content;
        this.category = category;
        this.tags     = tags;
        this.emoji    = emoji;
        this.gradient = gradient;
        this.featured = featured;
        this.status   = status;
    }

    /* 추천 토글 */
    public void toggleFeatured() {
        this.featured = !this.featured;
    }

    /* 상태 토글 */
    public void toggleStatus() {
        this.status = (this.status == PostStatus.PUBLISHED) ? PostStatus.DRAFT : PostStatus.PUBLISHED;
    }
}
