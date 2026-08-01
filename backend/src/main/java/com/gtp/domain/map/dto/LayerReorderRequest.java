package com.gtp.domain.map.dto;

import lombok.Getter;

import java.util.List;

@Getter
public class LayerReorderRequest {

    private List<LayerOrderItem> layers;
    private List<GroupOrderItem> groups;

    @Getter
    public static class LayerOrderItem {
        private Long id;
        private int sortOrder;
        private Long groupId; // null = 미분류
    }

    @Getter
    public static class GroupOrderItem {
        private Long id;
        private int sortOrder;
        private Long parentId; // null = 루트
    }
}
