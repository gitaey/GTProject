package com.gtp.domain.blog.service;

import com.gtp.domain.blog.dto.PostRequest;
import com.gtp.domain.blog.dto.PostResponse;
import com.gtp.domain.blog.entity.Post;
import com.gtp.domain.blog.entity.PostStatus;
import com.gtp.domain.blog.repository.PostRepository;
import com.gtp.global.exception.CustomException;
import com.gtp.global.exception.ErrorCode;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Map;

@Service
@RequiredArgsConstructor
public class PostService {

    private final PostRepository  postRepository;
    private final CategoryService categoryService;

    /* ── 공개 목록 조회 ── */
    @Transactional(readOnly = true)
    public Page<PostResponse> getPosts(String category, String keyword, Pageable pageable) {
        String cat = (category == null || category.isBlank()) ? null : category.toUpperCase();
        String kw  = (keyword  == null || keyword.isBlank())  ? null : keyword;
        Map<String, String> labelMap = categoryService.getLabelMap();
        return postRepository.findPublished(cat, kw, pageable)
                .map(p -> PostResponse.summary(p, labelMap.getOrDefault(p.getCategory(), p.getCategory())));
    }

    /* ── 공개 단건 조회 (slug) ── */
    @Transactional(readOnly = true)
    public PostResponse getPost(String slug) {
        Post post = postRepository.findBySlugAndStatus(slug, PostStatus.PUBLISHED)
                .orElseThrow(() -> new CustomException(ErrorCode.POST_NOT_FOUND));
        return new PostResponse(post, categoryService.getLabel(post.getCategory()));
    }

    /* ── 관리자 전체 목록 ── */
    @Transactional(readOnly = true)
    public Page<PostResponse> getAdminPosts(String categoryStr, String statusStr, String keyword, Pageable pageable) {
        String cat    = (categoryStr == null || categoryStr.isBlank()) ? null : categoryStr.toUpperCase();
        PostStatus status = (statusStr == null || statusStr.isBlank()) ? null : parseStatus(statusStr);
        String kw     = (keyword == null || keyword.isBlank()) ? null : keyword;
        Map<String, String> labelMap = categoryService.getLabelMap();
        return postRepository.findAll(cat, status, kw, pageable)
                .map(p -> PostResponse.summary(p, labelMap.getOrDefault(p.getCategory(), p.getCategory())));
    }

    /* ── 생성 ── */
    @Transactional
    public PostResponse createPost(PostRequest req) {
        if (postRepository.existsBySlug(req.getSlug())) {
            throw new CustomException(ErrorCode.DUPLICATE_SLUG);
        }

        String authorId = getCurrentUserId();
        String category = req.getCategory().toUpperCase();

        Post post = Post.builder()
                .slug(req.getSlug())
                .title(req.getTitle())
                .excerpt(req.getExcerpt())
                .content(req.getContent())
                .category(category)
                .tags(joinTags(req.getTags()))
                .gradient(req.getGradient())
                .featured(req.isFeatured())
                .status(parseStatus(req.getStatus()))
                .authorId(authorId)
                .build();

        Post saved = postRepository.save(post);
        return new PostResponse(saved, categoryService.getLabel(saved.getCategory()));
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
                req.getCategory().toUpperCase(),
                joinTags(req.getTags()),
                req.getGradient(),
                req.isFeatured(),
                parseStatus(req.getStatus())
        );

        return new PostResponse(post, categoryService.getLabel(post.getCategory()));
    }

    /* ── 삭제 ── */
    @Transactional
    public void deletePost(Long id) {
        postRepository.delete(findById(id));
    }

    /* ── 일괄 삭제 ── */
    @Transactional
    public void deletePosts(java.util.List<Long> ids) {
        postRepository.deleteAllById(ids);
    }

    /* ── 추천 토글 ── */
    @Transactional
    public PostResponse toggleFeatured(Long id) {
        Post post = findById(id);
        post.toggleFeatured();
        return new PostResponse(post, categoryService.getLabel(post.getCategory()));
    }

    /* ── 상태 토글 ── */
    @Transactional
    public PostResponse toggleStatus(Long id) {
        Post post = findById(id);
        post.toggleStatus();
        return new PostResponse(post, categoryService.getLabel(post.getCategory()));
    }

    /* ── 헬퍼 ── */
    private Post findById(Long id) {
        return postRepository.findById(id)
                .orElseThrow(() -> new CustomException(ErrorCode.POST_NOT_FOUND));
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
