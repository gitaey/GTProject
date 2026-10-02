package com.gtp.domain.map.repository;

import com.gtp.domain.map.entity.Layer;
import com.gtp.domain.map.entity.LayerUserAccess;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface LayerUserAccessRepository extends JpaRepository<LayerUserAccess, Long> {
    List<LayerUserAccess> findByUserId(String userId);
    void deleteByUserId(String userId);
    void deleteByLayer(Layer layer);
}
