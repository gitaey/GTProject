package com.gtp.domain.blog.service;

import com.gtp.domain.blog.dto.CategoryRequest;
import com.gtp.domain.blog.dto.CategoryResponse;
import com.gtp.domain.blog.entity.Category;
import com.gtp.domain.blog.repository.CategoryRepository;
import com.gtp.global.exception.CustomException;
import com.gtp.global.exception.ErrorCode;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class CategoryService {

    private final CategoryRepository categoryRepository;

    @Transactional(readOnly = true)
    public List<CategoryResponse> getAll() {
        return categoryRepository.findAllByOrderBySortOrderAscCodeAsc()
                .stream().map(CategoryResponse::new).toList();
    }

    @Transactional(readOnly = true)
    public Map<String, String> getLabelMap() {
        return categoryRepository.findAllByOrderBySortOrderAscCodeAsc()
                .stream().collect(Collectors.toMap(Category::getCode, Category::getLabel));
    }

    @Transactional
    public CategoryResponse create(CategoryRequest req) {
        if (categoryRepository.existsByCode(req.getCode())) {
            throw new CustomException(ErrorCode.DUPLICATE_CATEGORY_CODE);
        }
        Category saved = categoryRepository.save(Category.builder()
                .code(req.getCode())
                .label(req.getLabel())
                .sortOrder(req.getSortOrder())
                .build());
        return new CategoryResponse(saved);
    }

    @Transactional
    public CategoryResponse update(String code, CategoryRequest req) {
        Category category = categoryRepository.findById(code)
                .orElseThrow(() -> new CustomException(ErrorCode.CATEGORY_NOT_FOUND));
        category.update(req.getLabel(), req.getSortOrder());
        return new CategoryResponse(category);
    }

    @Transactional
    public void delete(String code) {
        if (!categoryRepository.existsByCode(code)) {
            throw new CustomException(ErrorCode.CATEGORY_NOT_FOUND);
        }
        categoryRepository.deleteById(code);
    }

    public String getLabel(String code) {
        if (code == null) return "";
        return categoryRepository.findById(code)
                .map(Category::getLabel)
                .orElse(code);
    }
}
