package com.gtp.domain.user.controller;

import com.gtp.domain.user.dto.UserBatchDeleteRequest;
import com.gtp.domain.user.dto.UserCreateRequest;
import com.gtp.domain.user.dto.UserResponse;
import com.gtp.domain.user.dto.UserUpdateRequest;
import com.gtp.domain.user.service.UserService;
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
@RequestMapping("/api/users")
@RequiredArgsConstructor
public class UserController {

    private final UserService userService;

    /* 목록 조회 */
    @GetMapping
    public ApiResponse<Page<UserResponse>> getUsers(
            @RequestParam(required = false) String keyword,
            @RequestParam(required = false) String role,
            @RequestParam(required = false) String status,
            @PageableDefault(size = 10, sort = "createdAt", direction = Sort.Direction.DESC) Pageable pageable
    ) {
        return ApiResponse.ok(userService.getUsers(keyword, role, status, pageable));
    }

    /* 단건 조회 */
    @GetMapping("/{userId}")
    public ApiResponse<UserResponse> getUser(@PathVariable String userId) {
        return ApiResponse.ok(userService.getUser(userId));
    }

    /* 사용자 생성 */
    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public ApiResponse<UserResponse> createUser(@Valid @RequestBody UserCreateRequest req) {
        return ApiResponse.ok(userService.createUser(req));
    }

    /* 사용자 수정 */
    @PutMapping("/{userId}")
    public ApiResponse<UserResponse> updateUser(
            @PathVariable String userId,
            @Valid @RequestBody UserUpdateRequest req
    ) {
        return ApiResponse.ok(userService.updateUser(userId, req));
    }

    /* 상태 토글 */
    @PatchMapping("/{userId}/status")
    public ApiResponse<UserResponse> toggleStatus(@PathVariable String userId) {
        return ApiResponse.ok(userService.toggleStatus(userId));
    }

    /* 사용자 단건 삭제 */
    @DeleteMapping("/{userId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void deleteUser(@PathVariable String userId) {
        userService.deleteUser(userId);
    }

    /* 사용자 일괄 삭제 */
    @DeleteMapping("/batch")
    public ApiResponse<String> deleteUsers(@Valid @RequestBody UserBatchDeleteRequest req) {
        int count = userService.deleteUsers(req.getIds());
        return ApiResponse.ok(count + "명의 사용자가 삭제되었습니다.");
    }
}
