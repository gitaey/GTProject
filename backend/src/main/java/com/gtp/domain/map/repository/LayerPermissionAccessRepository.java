package com.gtp.domain.map.repository;

import com.gtp.domain.map.entity.Layer;
import com.gtp.domain.map.entity.LayerPermissionAccess;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Set;

public interface LayerPermissionAccessRepository extends JpaRepository<LayerPermissionAccess, Long> {
    List<LayerPermissionAccess> findByPermission(String permission);
    void deleteByPermission(String permission);
    Set<Long> findLayerIdsByPermission(String permission);
    List<LayerPermissionAccess> findByLayer(Layer layer);
    void deleteByLayer(Layer layer);
}
