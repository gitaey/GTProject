package com.gtp.domain.map.repository;

import com.gtp.domain.map.entity.Layer;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface LayerRepository extends JpaRepository<Layer, Long> {
    List<Layer> findAllByOrderBySortOrderAscIdAsc();
}
