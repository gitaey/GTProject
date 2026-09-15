package com.gtp.domain.mymap.util;

import org.springframework.jdbc.core.JdbcTemplate;

import java.util.ArrayList;
import java.util.List;

/**
 * shp/엑셀 업로드로 들어오는 피처를 대량(수만~수십만 건)으로 저장할 때 쓰는 배치 삽입 도우미.
 * JPA saveAll()은 IDENTITY 채번 전략에서는 JDBC 배치가 걸리지 않아 건별 INSERT가 되므로,
 * 여기서는 JdbcTemplate.batchUpdate로 직접 청크 단위 배치 insert를 수행한다.
 * (지오메트리/속성은 절대 단순화하지 않고 원본 그대로 저장 — 대용량이라도 정확도 유지)
 */
public class FeatureBatchInserter implements AutoCloseable {

    private static final int BATCH_SIZE = 1000;
    private static final String SQL =
            "INSERT INTO tbl_user_map_feature (user_map_id, geometry_json, properties_json) VALUES (?, ?, ?)";

    private final JdbcTemplate jdbcTemplate;
    private final Long userMapId;
    private final List<Object[]> buffer = new ArrayList<>(BATCH_SIZE);
    private int totalInserted = 0;

    public FeatureBatchInserter(JdbcTemplate jdbcTemplate, Long userMapId) {
        this.jdbcTemplate = jdbcTemplate;
        this.userMapId = userMapId;
    }

    public void add(String geometryJson, String propertiesJson) {
        buffer.add(new Object[]{userMapId, geometryJson, propertiesJson});
        if (buffer.size() >= BATCH_SIZE) {
            flush();
        }
    }

    public void flush() {
        if (buffer.isEmpty()) return;
        jdbcTemplate.batchUpdate(SQL, buffer);
        totalInserted += buffer.size();
        buffer.clear();
    }

    public int totalInserted() {
        return totalInserted;
    }

    @Override
    public void close() {
        flush();
    }
}
