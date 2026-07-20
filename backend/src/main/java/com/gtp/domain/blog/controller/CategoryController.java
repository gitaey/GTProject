package com.gtp.domain.blog.controller;

import com.gtp.domain.blog.dto.CategoryRequest;
import com.gtp.domain.blog.dto.CategoryResponse;
import com.gtp.domain.blog.service.CategoryService;
import com.gtp.global.response.ApiResponse;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/categories")
@RequiredArgsConstructor
public class CategoryController {

    private final CategoryService categoryService;

    @GetMapping
    public ApiResponse<List<CategoryResponse>> getAll() {
        return ApiResponse.ok(categoryService.getAll());
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public ApiResponse<CategoryResponse> create(@Valid @RequestBody CategoryRequest req) {
        return ApiResponse.ok(categoryService.create(req));
    }

    @PutMapping("/{code}")
    public ApiResponse<CategoryResponse> update(
            @PathVariable String code,
            @Valid @RequestBody CategoryRequest req
    ) {
        return ApiResponse.ok(categoryService.update(code, req));
    }

    @DeleteMapping("/{code}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@PathVariable String code) {
        categoryService.delete(code);
    }
}
