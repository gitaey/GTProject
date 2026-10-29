package com.gtp.domain.mymap.service;

import com.gtp.domain.mymap.dto.*;
import com.gtp.domain.mymap.entity.UserMap;
import com.gtp.domain.mymap.repository.UserMapFeatureRepository;
import com.gtp.domain.mymap.repository.UserMapImportFailureRepository;
import com.gtp.domain.mymap.util.StyleConfigValidator;
import com.gtp.domain.mymap.repository.UserMapRepository;
import com.gtp.global.exception.CustomException;
import com.gtp.global.gis.GisErrorCode;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.io.Writer;
import java.util.List;
import java.util.Map;
import java.util.Objects;

@Service
@RequiredArgsConstructor
public class UserMapService {

    private final UserMapRepository userMapRepository;
    private final UserMapFeatureRepository featureRepository;
    private final UserMapImportFailureRepository failureRepository;
    private final UserMapPermissionService permissionService;
    private final MyMapColumnService columnService;
    private final JdbcTemplate jdbcTemplate;
    private final UserMapShareService shareService;

    private static final int STREAM_FETCH_SIZE = 500;

    /** 역할이 없는 사용자의 IN 목록 자리 값(빈 IN 목록을 피한다). 실제 역할 코드와 겹치지 않는다. */
    public static final String NO_ROLE = "__NO_ROLE__";

    /**
     * @param roleCodes 공유 판정에 쓰는 그룹 코드(역할 + "역할:세부권한")
     *
     * 일부러 @Transactional을 붙이지 않는다: 조회마다(리포지토리·shareCounts) 자기 읽기 전용 트랜잭션을 갖고,
     * 마지막 보낸 사람 이름 조회(ownerNames)는 트랜잭션 밖에서 돈다. 이름 조회가 실패해 예외를 삼켜도
     * (PostgreSQL은 SQL 오류 뒤 그 트랜잭션이 aborted가 된다) 목록 조회의 커밋에 영향이 없다.
     * UserMap에는 지연 로딩 관계가 없어 트랜잭션 밖에서 읽어도 안전하다.
     */
    public List<UserMapListItem> findVisibleTo(String userId, List<String> roleCodes) {
        // 소유 OR 공유(사용자·역할)를 SQL 한 번으로 가린다 — 전체 레이어를 읽어 자바에서 거르지 않는다
        List<String> roles = roleCodes == null || roleCodes.isEmpty() ? List.of(NO_ROLE) : roleCodes;
        List<UserMap> maps = userMapRepository.findVisibleTo(userId, roles);
        // 내 항목의 공유 수(집계 쿼리 2번) → 마지막에 보낸 사람 이름(실패해도 목록은 나간다)
        Map<Long, Integer> counts = shareService.shareCounts(
                maps.stream().filter(m -> m.isOwnedBy(userId)).map(UserMap::getId).toList());
        Map<String, String> names = shareService.ownerNames(
                maps.stream().filter(m -> !m.isOwnedBy(userId)).map(UserMap::getOwnerId)
                        .filter(Objects::nonNull).distinct().toList());
        return maps.stream().map(m -> {
            boolean own = m.isOwnedBy(userId);
            return new UserMapListItem(m, own,
                    own ? null : names.get(m.getOwnerId()),
                    own ? counts.getOrDefault(m.getId(), 0) : null);
        }).toList();
    }

    @Transactional(readOnly = true)
    public UserMap findById(Long id) {
        return userMapRepository.findById(id)
                .orElseThrow(() -> new CustomException(GisErrorCode.USER_MAP_NOT_FOUND));
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
                .progressTotal(map.getProgressTotal())
                .progressDone(map.getProgressDone())
                .matchedCount(map.getMatchedCount())
                .failedCount(map.getFailedCount())
                .parcelVersion(map.getParcelVersion())
                .geomType(map.getGeomType())
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
        loadExportable(id, userId, roleCodes);
    }

    /**
     * geojson 스트리밍·내보내기가 공통으로 쓰는 검사: 레이어가 있고(404), 볼 수 있는 사람(소유자·공유받은 사람, 403)이며, 처리가 끝났을 때(READY, 409)만
     * 레이어를 돌려준다. 내보내기는 geojson과 권한이 같다.
     */
    @Transactional(readOnly = true)
    public UserMap loadExportable(Long id, String userId, List<String> roleCodes) {
        UserMap map = findById(id);
        permissionService.assertCanView(map, userId, roleCodes);
        if (!"READY".equals(map.getStatus())) {
            throw new CustomException(GisErrorCode.USER_MAP_NOT_READY);
        }
        return map;
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
        // 스타일에 쓴 컬럼이 이 레이어에 있는지·구간형이 숫자 컬럼인지까지 본다(컬럼 통계가 없으면 모양·범위만)
        if (req.getStyleConfig() != null && !req.getStyleConfig().isBlank()) {
            StyleConfigValidator.validate(req.getStyleConfig(), columnService.validationColumns(map));
        }
        map.applyPatch(req.getName(), req.getDescription(), req.getStyleConfig(), req.getVisible());
    }

    @Transactional
    public void delete(Long id, String userId) {
        UserMap map = findById(id);
        permissionService.assertOwner(map, userId);
        permissionService.deleteAllAccessFor(map);
        featureRepository.deleteByUserMap(map);
        failureRepository.deleteByUserMapId(map.getId());
        userMapRepository.delete(map);
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
        failureRepository.deleteByUserMapId(map.getId());
        userMapRepository.delete(map);
    }
}
