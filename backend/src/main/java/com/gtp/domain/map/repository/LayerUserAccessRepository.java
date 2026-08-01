package com.gtp.domain.map.repository;

import com.gtp.domain.map.entity.Layer;
import com.gtp.domain.map.entity.LayerUserAccess;
import com.gtp.domain.member.user.entity.User;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface LayerUserAccessRepository extends JpaRepository<LayerUserAccess, Long> {
    List<LayerUserAccess> findByUser(User user);
    void deleteByUser(User user);
    void deleteByLayer(Layer layer);
}
