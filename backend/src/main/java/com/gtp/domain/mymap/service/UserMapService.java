package com.gtp.domain.mymap.service;

import com.gtp.domain.mymap.dto.*;
import com.gtp.domain.mymap.entity.UserMap;
import com.gtp.domain.mymap.repository.UserMapFeatureRepository;
import com.gtp.domain.mymap.repository.UserMapRepository;
import com.gtp.global.exception.CustomException;
import com.gtp.global.exception.ErrorCode;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.io.Writer;
import java.util.List;

@Service
@RequiredArgsConstructor
public class UserMapService {

    private final UserMapRepository userMapRepository;
    private final UserMapFeatureRepository featureRepository;
    private final UserMapPermissionService permissionService;
    private final JdbcTemplate jdbcTemplate;

    private static final int STREAM_FETCH_SIZE = 500;

    @Transactional(readOnly = true)
    public List<UserMapListItem> findVisibleTo(String userId, List<String> roleCodes) {
        List<Long> sharedIds = permissionService.findSharedUserMapIds(userId, roleCodes);
        return userMapRepository.findAllByOrderByCreatedAtDesc().stream()
                .filter(m -> m.isOwnedBy(userId) || sharedIds.contains(m.getId()))
                .map(m -> new UserMapListItem(m, m.isOwnedBy(userId)))
                .toList();
    }

    @Transactional(readOnly = true)
    public UserMap findById(Long id) {
        return userMapRepository.findById(id)
                .orElseThrow(() -> new CustomException(ErrorCode.USER_MAP_NOT_FOUND));
    }

    @Transactional(readOnly = true)
    public UserMapStatusResponse getStatus(Long id, String userId, List<String> roleCodes) {
        UserMap map = findById(id);
        permissionService.assertCanView(map, userId, roleCodes);
        return UserMapStatusResponse.builder()
                .id(map.getId())
                .status(map.getStatus())
                .errorMessage(map.getErrorMessage())
                .featureCount(map.getFeatureCount())
                .build();
    }

    /**
     * geojson 스트리밍 전에 권한/상태를 먼저 검증한다. 응답 스트림(Writer)에 손대기 전에
     * 반드시 이 메서드로 먼저 검증해야 한다 — Writer를 연 뒤에 예외가 나면 응답이 이미
     * 커밋되어 GlobalExceptionHandler가 정상적으로 JSON 에러 응답을 만들지 못하고
     * (Spring Boot 기본 에러 페이지로 스택트레이스가 그대로 노출되는 문제가 있었음).
     */
    @Transactional(readOnly = true)
    public void assertCanStreamGeoJson(Long id, String userId, List<String> roleCodes) {
        UserMap map = findById(id);
        permissionService.assertCanView(map, userId, roleCodes);
        if (!"READY".equals(map.getStatus())) {
            throw new CustomException(ErrorCode.USER_MAP_NOT_READY);
        }
    }

    /**
     * GeoJSON FeatureCollection을 응답으로 그대로 스트리밍한다. 호출 전 반드시
     * assertCanStreamGeoJson()으로 검증을 마쳐야 한다.
     * 저장된 geometryJson/propertiesJson은 이미 유효한 JSON 텍스트이므로 파싱하지 않고 그대로
     * 이어붙인다 — 피처가 수만~수십만 건이어도(지오메트리를 단순화하지 않는 이상) 서버 메모리에
     * 전체를 올리지 않도록 JDBC 커서로 한 행씩 읽으며 바로 흘려보낸다.
     */
    @Transactional(readOnly = true)
    public void streamGeoJson(Long id, Writer writer) {
        try {
            writer.write("{\"type\":\"FeatureCollection\",\"features\":[");
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }

        boolean[] first = {true};
        jdbcTemplate.query(
                con -> {
                    java.sql.PreparedStatement ps = con.prepareStatement(
                            "SELECT geometry_json, properties_json FROM tbl_user_map_feature WHERE user_map_id = ?");
                    ps.setFetchSize(STREAM_FETCH_SIZE);
                    ps.setLong(1, id);
                    return ps;
                },
                rs -> {
                    try {
                        if (!first[0]) writer.write(",");
                        first[0] = false;
                        writer.write("{\"type\":\"Feature\",\"geometry\":");
                        writer.write(rs.getString("geometry_json"));
                        writer.write(",\"properties\":");
                        String props = rs.getString("properties_json");
                        writer.write(props != null ? props : "{}");
                        writer.write("}");
                    } catch (IOException e) {
                        throw new UncheckedIOException(e);
                    }
                }
        );

        try {
            writer.write("]}");
            writer.flush();
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    @Transactional
    public void update(Long id, String userId, UserMapUpdateRequest req) {
        UserMap map = findById(id);
        permissionService.assertOwner(map, userId);
        map.updateMeta(req.getName(), req.getDescription(), req.getStyleConfig(), req.isVisible());
    }

    @Transactional
    public void delete(Long id, String userId) {
        UserMap map = findById(id);
        permissionService.assertOwner(map, userId);
        permissionService.deleteAllAccessFor(map);
        featureRepository.deleteByUserMap(map);
        userMapRepository.delete(map);
    }

    @Transactional
    public void share(Long id, String userId, UserMapShareRequest req) {
        UserMap map = findById(id);
        permissionService.assertOwner(map, userId);
        permissionService.setShare(map, req.getUserIds(), req.getRoleCodes());
    }

    @Transactional(readOnly = true)
    public UserMapShareResponse getShare(Long id, String userId) {
        UserMap map = findById(id);
        permissionService.assertOwner(map, userId);
        return UserMapShareResponse.builder()
                .userIds(permissionService.getSharedUserIds(map))
                .roleCodes(permissionService.getSharedRoleCodes(map))
                .build();
    }

    /** 관리자 전체 목록 (오너 여부 표시 없이 전체 조회) */
    @Transactional(readOnly = true)
    public List<UserMapListItem> findAllForAdmin() {
        return userMapRepository.findAllByOrderByCreatedAtDesc().stream()
                .map(m -> new UserMapListItem(m, false))
                .toList();
    }

    @Transactional
    public void deleteAsAdmin(Long id) {
        UserMap map = findById(id);
        permissionService.deleteAllAccessFor(map);
        featureRepository.deleteByUserMap(map);
        userMapRepository.delete(map);
    }
}
