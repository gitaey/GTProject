package com.gtp.domain.blog.repository;

import com.gtp.domain.blog.entity.Category;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface CategoryRepository extends JpaRepository<Category, String> {

    boolean existsByCode(String code);

    List<Category> findAllByOrderBySortOrderAscCodeAsc();
}
