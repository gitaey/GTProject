package com.gtp.domain.mymap.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.gtp.domain.mymap.config.MyMapProperties;
import com.gtp.domain.mymap.entity.UserMap;
import com.gtp.domain.mymap.util.ColumnStatsCollector;
import com.gtp.domain.mymap.repository.UserMapRepository;
import com.gtp.domain.mymap.util.CoordinateTransformUtil;
import com.gtp.domain.mymap.util.FeatureBatchInserter;
import com.gtp.global.exception.CustomException;
import com.gtp.global.gis.GisErrorCode;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.geotools.api.data.FileDataStore;
import org.geotools.api.data.FileDataStoreFinder;
import org.geotools.api.data.SimpleFeatureSource;
import org.geotools.api.feature.simple.SimpleFeature;
import org.geotools.api.feature.type.AttributeDescriptor;
import org.geotools.geojson.geom.GeometryJSON;
import org.locationtech.jts.geom.Geometry;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Component;

import java.io.File;
import java.io.StringWriter;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * shp 파일 세트를 비동기로 파싱해서 UserMapFeature로 적재하는 컴포넌트.
 * GeoTiffProcessor(비동기 후처리 + 상태 갱신)와 동일한 패턴.
 *
 * 피처를 한 번에 메모리에 모았다가 저장하지 않고, FeatureBatchInserter로 청크 단위 배치
 * insert하면서 흘려보낸다 — 수만~수십만 건짜리 shp에서도 메모리 사용량이 늘어나지 않는다
 * (지오메트리는 단순화하지 않고 원본 좌표 그대로 저장).
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class UserMapProcessor {

    private final UserMapRepository userMapRepository;
    private final JdbcTemplate jdbcTemplate;
    private final MyMapProperties props;
    private final ImportGuard importGuard;
    private final ObjectMapper objectMapper = new ObjectMapper();
    private final GeometryJSON geometryJSON = new GeometryJSON(9);

    /**
     * @param ownerId 끝나면(성공·실패·삭제 모두) 사용자당 동시 1건 자물쇠를 이 사용자에 대해 푼다 — 접수 서비스가 잡아서 넘긴다.
     */
    @Async
    public void processShp(Long userMapId, Path shpFilePath, String sourceSrid, String ownerId) {
        try {
            doProcessShp(userMapId, shpFilePath, sourceSrid);
        } finally {
            importGuard.release(ownerId);
        }
    }

    private void doProcessShp(Long userMapId, Path shpFilePath, String sourceSrid) {
        UserMap map = userMapRepository.findById(userMapId).orElse(null);
        if (map == null) {
            cleanupSiblingFiles(shpFilePath);
            return;
        }
        FileDataStore store = null;
        try {
            store = FileDataStoreFinder.getDataStore(shpFilePath.toFile());
            if (store == null) throw new IllegalStateException("shp 파일을 열 수 없습니다");

            CoordinateTransformUtil.ToWgs84 transform = CoordinateTransformUtil.buildTransform(sourceSrid);
            SimpleFeatureSource source = store.getFeatureSource();
            String geomType = null;
            int count = 0;

            List<String> attrNames = new ArrayList<>();
            for (AttributeDescriptor attr : source.getSchema().getAttributeDescriptors()) {
                if (!Geometry.class.isAssignableFrom(attr.getType().getBinding())) attrNames.add(attr.getLocalName());
            }
            ColumnStatsCollector stats = new ColumnStatsCollector(attrNames);

            org.geotools.data.simple.SimpleFeatureCollection collection = source.getFeatures();
            try (org.geotools.data.simple.SimpleFeatureIterator it = collection.features();
                 FeatureBatchInserter inserter = new FeatureBatchInserter(jdbcTemplate, userMapId)) {
                while (it.hasNext()) {
                    SimpleFeature feature = it.next();
                    Geometry geometry = (Geometry) feature.getDefaultGeometry();
                    if (geometry == null || geometry.isEmpty()) continue;
                    if (count >= props.getLimits().getMaxShpFeatures()) {
                        // 한도를 넘는 shp는 끝까지 읽지 않고 실패로 — 메모리·DB가 무제한으로 불어나는 것을 막는다
                        throw new CustomException(GisErrorCode.MYMAP_ROW_LIMIT,
                                "shp 피처가 최대 " + props.getLimits().getMaxShpFeatures() + "개를 넘어 처리하지 못했습니다.");
                    }
                    Geometry transformed = CoordinateTransformUtil.transform(geometry, transform);
                    if (geomType == null) geomType = transformed.getGeometryType().toUpperCase();

                    StringWriter geomWriter = new StringWriter();
                    geometryJSON.write(transformed, geomWriter);

                    ObjectNode properties = objectMapper.createObjectNode();
                    Map<String, String> statRow = new HashMap<>();
                    for (AttributeDescriptor attr : feature.getFeatureType().getAttributeDescriptors()) {
                        String attrName = attr.getLocalName();
                        Object value = feature.getAttribute(attrName);
                        if (value instanceof Geometry) continue;
                        String text = value != null ? value.toString() : null;
                        properties.put(attrName, text);
                        statRow.put(attrName, text);
                    }
                    stats.addRow(statRow);

                    inserter.add(geomWriter.toString(), properties.toString());
                    count++;
                }
            }
            map.markReady(geomType, count);
            map.applyColumnSchema(stats.toJson(false));
            userMapRepository.save(map);
            log.info("나만의지도(shp) 처리 완료 id={} count={}", userMapId, count);
        } catch (Exception e) {
            log.error("나만의지도(shp) 처리 실패 id={}: {}", userMapId, e.getMessage(), e);
            // 중간까지 넣은 피처가 용량만 차지하지 않게 지운다
            jdbcTemplate.update("DELETE FROM tbl_user_map_feature WHERE user_map_id = ?", userMapId);
            map.markFailed(e instanceof CustomException ? e.getMessage() : "shp 처리 중 오류가 발생했습니다: " + e.getMessage());
            userMapRepository.save(map);
        } finally {
            if (store != null) store.dispose();
            cleanupSiblingFiles(shpFilePath);
        }
    }

    private void cleanupSiblingFiles(Path shpFilePath) {
        String base = shpFilePath.toString();
        base = base.substring(0, base.length() - 4); // ".shp" 제거
        for (String ext : new String[]{".shp", ".shx", ".dbf", ".prj", ".cpg", ".fix", ".qix"}) {
            try {
                new File(base + ext).delete();
            } catch (Exception ignored) {
            }
        }
    }
}
