package com.gtp.domain.blog.dto;

import com.gtp.domain.blog.entity.Category;
import lombok.Getter;

@Getter
public class CategoryResponse {

    private final String code;
    private final String label;
    private final int    sortOrder;

    public CategoryResponse(Category c) {
        this.code      = c.getCode();
        this.label     = c.getLabel();
        this.sortOrder = c.getSortOrder();
    }
}
