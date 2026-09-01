package com.gtp.domain.member.role.service;

import com.gtp.domain.member.role.dto.*;
import com.gtp.domain.member.role.entity.PermissionEntity;
import com.gtp.domain.member.role.entity.RoleEntity;
import com.gtp.domain.member.role.repository.PermissionRepository;
import com.gtp.domain.member.role.repository.RoleRepository;
import com.gtp.global.exception.CustomException;
import com.gtp.global.exception.ErrorCode;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class RoleService {

    private final RoleRepository roleRepository;
    private final PermissionRepository permissionRepository;

    public List<RoleResponse> getAllRoles() {
        return roleRepository.findAllByOrderBySortOrderAsc().stream()
                .map(r -> new RoleResponse(r).withPermissions(
                        permissionRepository.findByRoleCodeOrderBySortOrderAsc(r.getCode())
                                .stream().map(PermissionResponse::new).toList()
                ))
                .toList();
    }

    public RoleEntity findByCode(String code) {
        return roleRepository.findById(code)
                .orElseThrow(() -> new CustomException(ErrorCode.INVALID_ROLE));
    }

    @Transactional
    public RoleResponse createRole(RoleCreateRequest req) {
        if (roleRepository.existsById(req.getCode())) {
            throw new CustomException(ErrorCode.DUPLICATE_ROLE_CODE);
        }
        RoleEntity saved = roleRepository.save(RoleEntity.builder()
                .code(req.getCode())
                .label(req.getLabel())
                .hasSubPermission(req.getHasSubPermission())
                .isSuper(req.getIsSuper())
                .sortOrder(req.getSortOrder())
                .build());
        return new RoleResponse(saved);
    }

    @Transactional
    public RoleResponse updateRole(String code, RoleUpdateRequest req) {
        RoleEntity role = findByCode(code);
        role.update(req.getLabel(), req.getHasSubPermission(), req.getIsSuper(), req.getSortOrder());
        return new RoleResponse(role);
    }

    @Transactional
    public void deleteRole(String code) {
        if (permissionRepository.existsByRoleCode(code)) {
            throw new CustomException(ErrorCode.ROLE_HAS_PERMISSIONS);
        }
        roleRepository.delete(findByCode(code));
    }

    public List<PermissionResponse> getPermissions(String roleCode) {
        findByCode(roleCode);
        return permissionRepository.findByRoleCodeOrderBySortOrderAsc(roleCode)
                .stream().map(PermissionResponse::new).toList();
    }

    @Transactional
    public PermissionResponse createPermission(String roleCode, PermissionCreateRequest req) {
        findByCode(roleCode);
        if (permissionRepository.existsById(req.getCode())) {
            throw new CustomException(ErrorCode.DUPLICATE_PERMISSION_CODE);
        }
        PermissionEntity saved = permissionRepository.save(PermissionEntity.builder()
                .code(req.getCode())
                .roleCode(roleCode)
                .label(req.getLabel())
                .sortOrder(req.getSortOrder())
                .build());
        return new PermissionResponse(saved);
    }

    @Transactional
    public PermissionResponse updatePermission(String code, PermissionUpdateRequest req) {
        PermissionEntity p = permissionRepository.findById(code)
                .orElseThrow(() -> new CustomException(ErrorCode.INVALID_PERMISSION));
        p.update(req.getLabel(), req.getSortOrder());
        return new PermissionResponse(p);
    }

    @Transactional
    public void deletePermission(String code) {
        permissionRepository.delete(permissionRepository.findById(code)
                .orElseThrow(() -> new CustomException(ErrorCode.INVALID_PERMISSION)));
    }

    public void validateRolePermission(String roleCode, String permissionCode) {
        RoleEntity role = findByCode(roleCode);
        if (role.isSuper() || !role.isHasSubPermission()) return;
        if (permissionCode == null || permissionCode.isBlank()) {
            throw new CustomException(ErrorCode.PERMISSION_REQUIRED);
        }
        PermissionEntity perm = permissionRepository.findById(permissionCode)
                .orElseThrow(() -> new CustomException(ErrorCode.INVALID_PERMISSION));
        if (!perm.getRoleCode().equals(roleCode)) {
            throw new CustomException(ErrorCode.INVALID_PERMISSION);
        }
    }
}
