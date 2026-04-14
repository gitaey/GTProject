package com.gtp.domain.post.service;

import com.gtp.domain.post.dto.PostRequest;
import com.gtp.domain.post.dto.PostResponse;
import com.gtp.domain.post.entity.Post;
import com.gtp.domain.post.entity.PostCategory;
import com.gtp.domain.post.entity.PostStatus;
import com.gtp.domain.post.repository.PostRepository;
import com.gtp.global.exception.CustomException;
import com.gtp.global.exception.ErrorCode;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class PostService {

    private final PostRepository postRepository;

    /* ── 공개 목록 조회 ── */
    @Transactional(readOnly = true)
    public Page<PostResponse> getPosts(String categoryStr, String keyword, Pageable pageable) {
        PostCategory category = parseCategory(categoryStr);
        String kw = (keyword == null || keyword.isBlank()) ? null : keyword;
        return postRepository.findPublished(category, kw, pageable)
                .map(PostResponse::summary);
    }

    /* ── 공개 단건 조회 (slug) ── */
    @Transactional(readOnly = true)
    public PostResponse getPost(String slug) {
        Post post = postRepository.findBySlugAndStatus(slug, PostStatus.PUBLISHED)
                .orElseThrow(() -> new CustomException(ErrorCode.POST_NOT_FOUND));
        return new PostResponse(post);
    }

    /* ── 관리자 전체 목록 ── */
    @Transactional(readOnly = true)
    public Page<PostResponse> getAdminPosts(String categoryStr, String statusStr, String keyword, Pageable pageable) {
        PostCategory category = parseCategory(categoryStr);
        PostStatus   status   = parseStatus(statusStr);
        String kw = (keyword == null || keyword.isBlank()) ? null : keyword;
        return postRepository.findAll(category, status, kw, pageable)
                .map(PostResponse::summary);
    }

    /* ── 생성 ── */
    @Transactional
    public PostResponse createPost(PostRequest req) {
        if (postRepository.existsBySlug(req.getSlug())) {
            throw new CustomException(ErrorCode.DUPLICATE_SLUG);
        }

        String authorId = getCurrentUserId();

        Post post = Post.builder()
                .slug(req.getSlug())
                .title(req.getTitle())
                .excerpt(req.getExcerpt())
                .content(req.getContent())
                .category(parseCategory(req.getCategory()))
                .tags(joinTags(req.getTags()))
                .emoji(req.getEmoji())
                .gradient(req.getGradient())
                .featured(req.isFeatured())
                .status(parseStatus(req.getStatus()))
                .authorId(authorId)
                .build();

        return new PostResponse(postRepository.save(post));
    }

    /* ── 수정 ── */
    @Transactional
    public PostResponse updatePost(Long id, PostRequest req) {
        Post post = findById(id);

        if (postRepository.existsBySlugAndIdNot(req.getSlug(), id)) {
            throw new CustomException(ErrorCode.DUPLICATE_SLUG);
        }

        post.update(
                req.getSlug(),
                req.getTitle(),
                req.getExcerpt(),
                req.getContent(),
                parseCategory(req.getCategory()),
                joinTags(req.getTags()),
                req.getEmoji(),
                req.getGradient(),
                req.isFeatured(),
                parseStatus(req.getStatus())
        );

        return new PostResponse(post);
    }

    /* ── 삭제 ── */
    @Transactional
    public void deletePost(Long id) {
        Post post = findById(id);
        postRepository.delete(post);
    }

    /* ── 추천 토글 ── */
    @Transactional
    public PostResponse toggleFeatured(Long id) {
        Post post = findById(id);
        post.toggleFeatured();
        return new PostResponse(post);
    }

    /* ── 상태 토글 ── */
    @Transactional
    public PostResponse toggleStatus(Long id) {
        Post post = findById(id);
        post.toggleStatus();
        return new PostResponse(post);
    }

    /* ── 헬퍼 ── */
    private Post findById(Long id) {
        return postRepository.findById(id)
                .orElseThrow(() -> new CustomException(ErrorCode.POST_NOT_FOUND));
    }

    private PostCategory parseCategory(String value) {
        if (value == null || value.isBlank()) return null;
        try {
            return PostCategory.valueOf(value.toUpperCase());
        } catch (IllegalArgumentException e) {
            throw new CustomException(ErrorCode.INVALID_INPUT);
        }
    }

    private PostStatus parseStatus(String value) {
        if (value == null || value.isBlank()) return PostStatus.PUBLISHED;
        try {
            return PostStatus.valueOf(value.toUpperCase());
        } catch (IllegalArgumentException e) {
            return PostStatus.PUBLISHED;
        }
    }

    private String joinTags(java.util.List<String> tags) {
        if (tags == null || tags.isEmpty()) return null;
        return String.join(",", tags);
    }

    private String getCurrentUserId() {
        try {
            return (String) SecurityContextHolder.getContext().getAuthentication().getPrincipal();
        } catch (Exception e) {
            return null;
        }
    }
}
