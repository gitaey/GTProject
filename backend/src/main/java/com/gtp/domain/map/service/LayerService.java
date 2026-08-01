package com.gtp.domain.map.service;

import com.gtp.domain.map.dto.*;
import com.gtp.domain.map.entity.Layer;
import com.gtp.domain.map.entity.LayerGroup;
import com.gtp.domain.map.entity.LayerPermissionAccess;
import com.gtp.domain.map.repository.LayerPermissionAccessRepository;
import com.gtp.domain.map.repository.LayerRepository;
import com.gtp.domain.map.repository.LayerUserAccessRepository;
import com.gtp.global.exception.CustomException;
import com.gtp.global.exception.ErrorCode;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.*;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class LayerService {

    private final LayerRepository layerRepository;
    private final LayerGroupService layerGroupService;
    private final LayerPermissionAccessRepository permissionAccessRepository;
    private final LayerUserAccessRepository userAccessRepository;

    @Transactional(readOnly = true)
    public List<LayerResponse> getAll() {
        return layerRepository.findAllByOrderBySortOrderAscIdAsc()
                .stream().map(LayerResponse::new).toList();
    }

    @Transactional(readOnly = true)
    public LayerTreeResponse getTree() {
        List<Layer> allLayers = layerRepository.findAllByOrderBySortOrderAscIdAsc();
        List<LayerGroup> allGroups = layerGroupService.findAll();

        // 그룹 노드 맵 생성
        Map<Long, LayerGroupResponse> nodeMap = new LinkedHashMap<>();
        for (LayerGroup g : allGroups) {
            nodeMap.put(g.getId(), new LayerGroupResponse(g));
        }

        // 레이어를 그룹에 배치
        List<LayerResponse> ungrouped = new ArrayList<>();
        for (Layer layer : allLayers) {
            if (layer.getGroup() != null && nodeMap.containsKey(layer.getGroup().getId())) {
                nodeMap.get(layer.getGroup().getId()).getLayers().add(new LayerResponse(layer));
            } else {
                ungrouped.add(new LayerResponse(layer));
            }
        }

        // 트리 구성 (부모-자식 연결)
        List<LayerGroupResponse> roots = new ArrayList<>();
        for (LayerGroupResponse node : nodeMap.values()) {
            if (node.getParentId() == null) {
                roots.add(node);
            } else if (nodeMap.containsKey(node.getParentId())) {
                nodeMap.get(node.getParentId()).getChildren().add(node);
            } else {
                roots.add(node); // 부모가 없으면 루트로
            }
        }

        return new LayerTreeResponse(roots, ungrouped);
    }

    @Transactional(readOnly = true)
    public LayerTreeResponse getTreeForPermission(String permission) {
        // SUPER_ADMIN, MAP_ADMIN은 전체
        if ("SUPER_ADMIN".equals(permission) || "MAP_ADMIN".equals(permission)) {
            return getTree();
        }

        // 해당 Permission이 접근 가능한 layer id 목록
        Set<Long> allowedIds = permissionAccessRepository.findByPermission(permission)
                .stream().map(a -> a.getLayer().getId()).collect(Collectors.toSet());

        List<Layer> allLayers = layerRepository.findAllByOrderBySortOrderAscIdAsc()
                .stream().filter(l -> allowedIds.contains(l.getId())).toList();
        List<LayerGroup> allGroups = layerGroupService.findAll();

        Map<Long, LayerGroupResponse> nodeMap = new LinkedHashMap<>();
        for (LayerGroup g : allGroups) {
            nodeMap.put(g.getId(), new LayerGroupResponse(g));
        }

        List<LayerResponse> ungrouped = new ArrayList<>();
        for (Layer layer : allLayers) {
            if (layer.getGroup() != null && nodeMap.containsKey(layer.getGroup().getId())) {
                nodeMap.get(layer.getGroup().getId()).getLayers().add(new LayerResponse(layer));
            } else {
                ungrouped.add(new LayerResponse(layer));
            }
        }

        // 레이어가 하나도 없는 그룹 제거 후 트리 구성
        List<LayerGroupResponse> roots = new ArrayList<>();
        for (LayerGroupResponse node : nodeMap.values()) {
            if (node.getParentId() == null) {
                roots.add(node);
            } else if (nodeMap.containsKey(node.getParentId())) {
                nodeMap.get(node.getParentId()).getChildren().add(node);
            } else {
                roots.add(node);
            }
        }

        return new LayerTreeResponse(roots, ungrouped);
    }

    @Transactional
    public LayerResponse create(LayerRequest req) {
        LayerGroup group = req.getGroupId() != null
                ? layerGroupService.findById(req.getGroupId()) : null;
        Layer layer = Layer.builder()
                .name(req.getName())
                .type(req.getType().toUpperCase())
                .sourceType(req.getSourceType().toUpperCase())
                .url(req.getUrl())
                .layerName(req.getLayerName())
                .styleName(req.getStyleName())
                .styleConfig(req.getStyleConfig())
                .format(req.getFormat())
                .projection(req.getProjection())
                .minZoom(req.getMinZoom())
                .maxZoom(req.getMaxZoom())
                .opacity(req.getOpacity())
                .visible(req.isVisible())
                .sortOrder(req.getSortOrder())
                .group(group)
                .groupName(group != null ? group.getName() : null)
                .description(req.getDescription())
                .build();
        return new LayerResponse(layerRepository.save(layer));
    }

    @Transactional
    public LayerResponse update(Long id, LayerRequest req) {
        Layer layer = findById(id);
        LayerGroup group = req.getGroupId() != null
                ? layerGroupService.findById(req.getGroupId()) : null;
        layer.update(
                req.getName(), req.getType().toUpperCase(), req.getSourceType().toUpperCase(),
                req.getUrl(), req.getLayerName(), req.getStyleName(), req.getStyleConfig(),
                req.getFormat(), req.getProjection(), req.getMinZoom(), req.getMaxZoom(),
                req.getOpacity(), req.isVisible(), req.getSortOrder(),
                group, req.getDescription()
        );
        return new LayerResponse(layer);
    }

    @Transactional
    public void delete(Long id) {
        Layer layer = findById(id);
        permissionAccessRepository.deleteByLayer(layer);
        userAccessRepository.deleteByLayer(layer);
        layerRepository.delete(layer);
    }

    @Transactional
    public void reorder(LayerReorderRequest req) {
        if (req.getLayers() != null) {
            for (LayerReorderRequest.LayerOrderItem item : req.getLayers()) {
                Layer layer = findById(item.getId());
                LayerGroup group = item.getGroupId() != null
                        ? layerGroupService.findById(item.getGroupId()) : null;
                layer.updateSortOrderAndGroup(item.getSortOrder(), group);
            }
        }
        if (req.getGroups() != null) {
            for (LayerReorderRequest.GroupOrderItem item : req.getGroups()) {
                LayerGroup group = layerGroupService.findById(item.getId());
                LayerGroup parent = item.getParentId() != null
                        ? layerGroupService.findById(item.getParentId()) : null;
                group.update(group.getName(), parent, item.getSortOrder());
            }
        }
    }

    // Permission 접근 설정
    @Transactional(readOnly = true)
    public List<Long> getPermissionLayerIds(String permission) {
        return permissionAccessRepository.findByPermission(permission)
                .stream().map(a -> a.getLayer().getId()).toList();
    }

    @Transactional
    public void setPermissionLayers(String permission, List<Long> layerIds) {
        permissionAccessRepository.deleteByPermission(permission);
        for (Long layerId : layerIds) {
            Layer layer = findById(layerId);
            permissionAccessRepository.save(
                    LayerPermissionAccess.builder().permission(permission).layer(layer).build()
            );
        }
    }

    public Layer findById(Long id) {
        return layerRepository.findById(id)
                .orElseThrow(() -> new CustomException(ErrorCode.LAYER_NOT_FOUND));
    }
}
