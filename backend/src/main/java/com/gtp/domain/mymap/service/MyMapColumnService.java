package com.gtp.domain.mymap.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.gtp.domain.mymap.entity.UserMap;
import com.gtp.domain.mymap.repository.UserMapRepository;
import com.gtp.domain.mymap.util.ColumnStatsCollector;
import com.gtp.domain.mymap.util.StyleConfigValidator;
import com.gtp.global.exception.CustomException;
import com.gtp.global.gis.GisErrorCode;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import java.util.*;

/**
 * 레이어의 컬럼 통계({@code column_schema}) — 스타일 대화상자(U18 {@code GET /{id}/columns})와 스타일 검증이 쓴다.
 * 업로드가 끝날 때 작업이 이미 기록해 두므로 보통은 읽기만 한다. 이 기능 이전에 올라온 READY 레이어(column_schema가 비어 있거나
 * 옛 형식)는 처음 요청 때 피처 앞쪽 {@value #LAZY_ROWS}건으로 계산해 저장한다(그때는 응답의 truncated가 true일 수 있다).
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class MyMapColumnService {

    /** 옛 레이어의 통계를 즉석 계산할 때 읽는 피처 수 상한(설계 U18 "5,000행 기준"보다 넉넉하되 큰 shp를 통째로 읽지 않게) */
    static final int LAZY_ROWS = 10_000;

    private final UserMapRepository userMapRepository;
    private final UserMapPermissionService permissionService;
    private final JdbcTemplate jdbc;
    private final ObjectMapper om = new ObjectMapper();

    /** 볼 수 있는 사람에게 컬럼 통계를 돌려준다(U18). 처리 중이거나 실패한 레이어는 409. */
    public JsonNode columnsFor(Long id, String userId, List<String> roleCodes) {
        UserMap map = userMapRepository.findById(id).orElseThrow(() -> new CustomException(GisErrorCode.USER_MAP_NOT_FOUND));
        permissionService.assertCanView(map, userId, roleCodes);
        if (!"READY".equals(map.getStatus())) throw new CustomException(GisErrorCode.USER_MAP_NOT_READY);
        return schemaOf(map);
    }

    /** 스타일 검증용 컬럼 목록. 알 수 없으면(처리 중·계산 불가) 빈 목록 — 그러면 컬럼 이름 검사는 건너뛴다. */
    public List<StyleConfigValidator.Column> validationColumns(UserMap map) {
        if (!"READY".equals(map.getStatus())) return List.of();
        try {
            return columnsOf(schemaOf(map));
        } catch (RuntimeException e) {
            log.warn("[나만의지도] 컬럼 통계를 읽지 못해 컬럼 이름 검사를 건너뜁니다 id={}: {}", map.getId(), e.getMessage());
            return List.of();
        }
    }

    static List<StyleConfigValidator.Column> columnsOf(JsonNode schema) {
        List<StyleConfigValidator.Column> out = new ArrayList<>();
        // 옛 레이어를 앞쪽 일부로만 계산한 통계(truncated)는 숫자/글자 종류가 전체와 다를 수 있어 종류를 모르는 것으로 둔다(이름만 검사)
        boolean kindsReliable = !schema.path("truncated").asBoolean(false);
        for (JsonNode c : schema.path("columns")) {
            String kind = kindsReliable ? c.path("kind").asText(null) : null;
            out.add(new StyleConfigValidator.Column(c.path("name").asText(), kind));
        }
        return out;
    }

    /** 저장된 통계(v1)를 돌려주거나, 없으면 계산해서 저장한다. 옛 형식(컬럼 이름 배열)도 다시 계산한다. */
    JsonNode schemaOf(UserMap map) {
        JsonNode stored = parse(map.getColumnSchema());
        if (stored != null && stored.isObject() && stored.path("v").asInt() == ColumnStatsCollector.SCHEMA_VERSION && stored.path("columns").isArray()) {
            return stored;
        }
        String json = compute(map.getId());
        jdbc.update("UPDATE tbl_user_map SET column_schema = ? WHERE id = ?", json, map.getId());
        return parse(json);
    }

    /** 피처 앞쪽 일부의 properties_json으로 통계를 만든다. */
    String compute(Long userMapId) {
        LinkedHashSet<String> names = new LinkedHashSet<>();
        List<Map<String, String>> rows = new ArrayList<>();
        int[] total = {0};
        jdbc.query(con -> {
            java.sql.PreparedStatement ps = con.prepareStatement(
                    "SELECT properties_json FROM tbl_user_map_feature WHERE user_map_id = ? ORDER BY id");
            ps.setFetchSize(500);
            ps.setLong(1, userMapId);
            ps.setMaxRows(LAZY_ROWS + 1);
            return ps;
        }, rs -> {
            if (total[0]++ >= LAZY_ROWS) return;
            JsonNode n = parse(rs.getString("properties_json"));
            if (n == null || !n.isObject()) return;
            Map<String, String> row = new LinkedHashMap<>();
            n.fields().forEachRemaining(e -> {
                names.add(e.getKey());
                row.put(e.getKey(), e.getValue().isNull() ? null : e.getValue().asText());
            });
            rows.add(row);
        });
        ColumnStatsCollector stats = new ColumnStatsCollector(new ArrayList<>(names));
        rows.forEach(stats::addRow);
        return stats.toJson(total[0] > LAZY_ROWS);
    }

    private JsonNode parse(String json) {
        if (json == null || json.isBlank()) return null;
        try {
            return om.readTree(json);
        } catch (Exception e) {
            return null;
        }
    }
}
