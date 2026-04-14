package com.gtp.domain.post.repository;

import com.gtp.domain.post.entity.Post;
import com.gtp.domain.post.entity.PostCategory;
import com.gtp.domain.post.entity.PostStatus;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Optional;

public interface PostRepository extends JpaRepository<Post, Long> {

    Optional<Post> findBySlugAndStatus(String slug, PostStatus status);

    boolean existsBySlug(String slug);

    boolean existsBySlugAndIdNot(String slug, Long id);

    /* 공개 목록 조회 (발행 상태, 카테고리/키워드 필터) */
    @Query("""
        SELECT p FROM Post p
        WHERE p.status = 'PUBLISHED'
          AND (:category IS NULL OR p.category = :category)
          AND (:keyword  IS NULL OR p.title    LIKE %:keyword%
                                OR p.excerpt   LIKE %:keyword%
                                OR p.tags      LIKE %:keyword%)
        ORDER BY p.featured DESC, p.createdAt DESC
    """)
    Page<Post> findPublished(
            @Param("category") PostCategory category,
            @Param("keyword")  String keyword,
            Pageable pageable
    );

    /* 관리자 전체 목록 조회 (상태 무관) */
    @Query("""
        SELECT p FROM Post p
        WHERE (:category IS NULL OR p.category = :category)
          AND (:status   IS NULL OR p.status   = :status)
          AND (:keyword  IS NULL OR p.title    LIKE %:keyword%
                                OR p.excerpt   LIKE %:keyword%)
        ORDER BY p.createdAt DESC
    """)
    Page<Post> findAll(
            @Param("category") PostCategory category,
            @Param("status")   PostStatus status,
            @Param("keyword")  String keyword,
            Pageable pageable
    );
}
