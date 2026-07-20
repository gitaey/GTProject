package com.gtp.domain.blog.entity;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.Comment;

@Entity
@Table(name = "tbl_category")
@Comment("블로그 카테고리")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@Builder
@AllArgsConstructor
public class Category {

    @Id
    @Column(name = "code", length = 50)
    @Comment("카테고리 코드 (PK)")
    private String code;

    @Column(name = "label", nullable = false, length = 100)
    @Comment("카테고리 표시명")
    private String label;

    @Column(name = "sort_order", nullable = false)
    @Comment("정렬 순서")
    @Builder.Default
    private int sortOrder = 0;

    public void update(String label, int sortOrder) {
        this.label     = label;
        this.sortOrder = sortOrder;
    }
}
