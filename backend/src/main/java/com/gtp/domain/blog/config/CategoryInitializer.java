package com.gtp.domain.blog.config;

import com.gtp.domain.blog.entity.Category;
import com.gtp.domain.blog.repository.CategoryRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.stereotype.Component;

import java.util.List;

@Component
@org.springframework.core.annotation.Order(1)
@RequiredArgsConstructor
public class CategoryInitializer implements ApplicationRunner {

    private final CategoryRepository categoryRepository;

    @Override
    public void run(ApplicationArguments args) {
        List<Category> defaults = List.of(
                Category.builder().code("DEV")       .label("개발").sortOrder(0).build(),
                Category.builder().code("PARENTING") .label("육아").sortOrder(1).build(),
                Category.builder().code("DAILY")     .label("일상").sortOrder(2).build()
        );

        for (Category c : defaults) {
            if (!categoryRepository.existsByCode(c.getCode())) {
                categoryRepository.save(c);
            }
        }
    }
}
