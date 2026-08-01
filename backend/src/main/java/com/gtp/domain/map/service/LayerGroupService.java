package com.gtp.domain.map.service;

import com.gtp.domain.map.dto.LayerGroupRequest;
import com.gtp.domain.map.dto.LayerGroupResponse;
import com.gtp.domain.map.entity.LayerGroup;
import com.gtp.domain.map.repository.LayerGroupRepository;
import com.gtp.global.exception.CustomException;
import com.gtp.global.exception.ErrorCode;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Service
@RequiredArgsConstructor
public class LayerGroupService {

    private final LayerGroupRepository layerGroupRepository;

    @Transactional(readOnly = true)
    public List<LayerGroupResponse> getAll() {
        return layerGroupRepository.findAllByOrderBySortOrderAscIdAsc()
                .stream().map(LayerGroupResponse::new).toList();
    }

    @Transactional
    public LayerGroupResponse create(LayerGroupRequest req) {
        LayerGroup parent = req.getParentId() != null
                ? findById(req.getParentId()) : null;
        LayerGroup group = LayerGroup.builder()
                .name(req.getName())
                .parent(parent)
                .sortOrder(req.getSortOrder())
                .build();
        return new LayerGroupResponse(layerGroupRepository.save(group));
    }

    @Transactional
    public LayerGroupResponse update(Long id, LayerGroupRequest req) {
        LayerGroup group = findById(id);
        LayerGroup parent = req.getParentId() != null
                ? findById(req.getParentId()) : null;
        group.update(req.getName(), parent, req.getSortOrder());
        return new LayerGroupResponse(group);
    }

    @Transactional
    public void delete(Long id) {
        layerGroupRepository.delete(findById(id));
    }

    public List<LayerGroup> findAll() {
        return layerGroupRepository.findAllByOrderBySortOrderAscIdAsc();
    }

    public LayerGroup findById(Long id) {
        return layerGroupRepository.findById(id)
                .orElseThrow(() -> new CustomException(ErrorCode.LAYER_GROUP_NOT_FOUND));
    }
}
