package com.gtp.domain.post.controller;

import com.gtp.domain.post.dto.PostRequest;
import com.gtp.domain.post.dto.PostResponse;
import com.gtp.domain.post.service.PostService;
import com.gtp.global.response.ApiResponse;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.data.web.PageableDefault;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/posts")
@RequiredArgsConstructor
public class PostController {

    private final PostService postService;

    /* 공개 목록 */
    @GetMapping
    public ApiResponse<Page<PostResponse>> getPosts(
            @RequestParam(required = false) String category,
            @RequestParam(required = false) String keyword,
            @PageableDefault(size = 12, sort = "createdAt", direction = Sort.Direction.DESC) Pageable pageable
    ) {
        return ApiResponse.ok(postService.getPosts(category, keyword, pageable));
    }

    /* 공개 단건 (slug) */
    @GetMapping("/{slug}")
    public ApiResponse<PostResponse> getPost(@PathVariable String slug) {
        return ApiResponse.ok(postService.getPost(slug));
    }

    /* 관리자 전체 목록 */
    @GetMapping("/admin/list")
    public ApiResponse<Page<PostResponse>> getAdminPosts(
            @RequestParam(required = false) String category,
            @RequestParam(required = false) String status,
            @RequestParam(required = false) String keyword,
            @PageableDefault(size = 20, sort = "createdAt", direction = Sort.Direction.DESC) Pageable pageable
    ) {
        return ApiResponse.ok(postService.getAdminPosts(category, status, keyword, pageable));
    }

    /* 생성 */
    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public ApiResponse<PostResponse> createPost(@Valid @RequestBody PostRequest req) {
        return ApiResponse.ok(postService.createPost(req));
    }

    /* 수정 */
    @PutMapping("/{id}")
    public ApiResponse<PostResponse> updatePost(
            @PathVariable Long id,
            @Valid @RequestBody PostRequest req
    ) {
        return ApiResponse.ok(postService.updatePost(id, req));
    }

    /* 삭제 */
    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void deletePost(@PathVariable Long id) {
        postService.deletePost(id);
    }

    /* 추천 토글 */
    @PatchMapping("/{id}/featured")
    public ApiResponse<PostResponse> toggleFeatured(@PathVariable Long id) {
        return ApiResponse.ok(postService.toggleFeatured(id));
    }

    /* 상태 토글 */
    @PatchMapping("/{id}/status")
    public ApiResponse<PostResponse> toggleStatus(@PathVariable Long id) {
        return ApiResponse.ok(postService.toggleStatus(id));
    }
}
