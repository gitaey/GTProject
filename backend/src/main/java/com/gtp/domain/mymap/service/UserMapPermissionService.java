package com.gtp.domain.mymap.service;

import com.gtp.domain.mymap.entity.UserMap;
import com.gtp.domain.mymap.entity.UserMapPermissionAccess;
import com.gtp.domain.mymap.entity.UserMapUserAccess;
import com.gtp.domain.mymap.repository.UserMapPermissionAccessRepository;
import com.gtp.domain.mymap.repository.UserMapUserAccessRepository;
import com.gtp.global.exception.CustomException;
import com.gtp.global.gis.GisErrorCode;
import jakarta.persistence.EntityManager;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

/**
 * 나만의지도 공유/권한 판단 로직. userId/role은 순수 문자열로만 다루고
 * 다른 도메인(User, Role 엔티티)을 조회하지 않는다 — 독립 모듈 유지.
 */
@Service
@RequiredArgsConstructor
public class UserMapPermissionService {

    private final UserMapUserAccessRepository userAccessRepository;
    private final UserMapPermissionAccessRepository permissionAccessRepository;
    private final EntityManager entityManager;

    /** 소유자이거나, 나에게 직접 공유되었거나, 내 role 중 하나가 공유 대상이면 true */
    @Transactional(readOnly = true)
    public boolean canView(UserMap map, String userId, List<String> roleCodes) {
        if (map.isOwnedBy(userId)) return true;
        boolean sharedToUser = userAccessRepository.findAllByUserMap(map).stream()
                .anyMatch(a -> a.getUserId().equals(userId));
        if (sharedToUser) return true;
        if (roleCodes == null || roleCodes.isEmpty()) return false;
        return permissionAccessRepository.findAllByUserMap(map).stream()
                .anyMatch(a -> roleCodes.contains(a.getRoleCode()));
    }

    public void assertCanView(UserMap map, String userId, List<String> roleCodes) {
        if (!canView(map, userId, roleCodes)) {
            throw new CustomException(GisErrorCode.USER_MAP_FORBIDDEN);
        }
    }

    public void assertOwner(UserMap map, String userId) {
        if (!map.isOwnedBy(userId)) {
            throw new CustomException(GisErrorCode.USER_MAP_FORBIDDEN);
        }
    }

    /** 로그인한 userId/roleCodes 기준으로 보이는 UserMap id 목록에 포함되는지 필터링할 때 사용 */
    @Transactional(readOnly = true)
    public List<Long> findSharedUserMapIds(String userId, List<String> roleCodes) {
        List<Long> byUser = userAccessRepository.findAllByUserId(userId).stream()
                .map(a -> a.getUserMap().getId()).toList();
        if (roleCodes == null || roleCodes.isEmpty()) return byUser;
        List<Long> byRole = permissionAccessRepository.findAllByRoleCodeIn(roleCodes).stream()
                .map(a -> a.getUserMap().getId()).toList();
        return java.util.stream.Stream.concat(byUser.stream(), byRole.stream()).distinct().toList();
    }

    @Transactional
    public void setShare(UserMap map, List<String> userIds, List<String> roleCodes) {
        userAccessRepository.deleteByUserMap(map);
        permissionAccessRepository.deleteByUserMap(map);
        entityManager.flush();
        if (userIds != null) {
            for (String uid : userIds) {
                if (uid == null || uid.isBlank()) continue;
                userAccessRepository.save(UserMapUserAccess.builder().userId(uid).userMap(map).build());
            }
        }
        if (roleCodes != null) {
            for (String role : roleCodes) {
                if (role == null || role.isBlank()) continue;
                permissionAccessRepository.save(UserMapPermissionAccess.builder().roleCode(role).userMap(map).build());
            }
        }
    }

    @Transactional(readOnly = true)
    public List<String> getSharedUserIds(UserMap map) {
        return userAccessRepository.findAllByUserMap(map).stream().map(UserMapUserAccess::getUserId).toList();
    }

    @Transactional(readOnly = true)
    public List<String> getSharedRoleCodes(UserMap map) {
        return permissionAccessRepository.findAllByUserMap(map).stream().map(UserMapPermissionAccess::getRoleCode).toList();
    }

    @Transactional
    public void deleteAllAccessFor(UserMap map) {
        userAccessRepository.deleteByUserMap(map);
        permissionAccessRepository.deleteByUserMap(map);
    }
}
