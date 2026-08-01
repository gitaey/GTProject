package com.gtp.domain.map.repository;

import com.gtp.domain.map.entity.LayerGroup;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface LayerGroupRepository extends JpaRepository<LayerGroup, Long> {
    List<LayerGroup> findAllByOrderBySortOrderAscIdAsc();
    List<LayerGroup> findByParentIsNullOrderBySortOrderAscIdAsc();
}
