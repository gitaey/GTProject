package com.gtp.domain.mymap.service;

import com.gtp.domain.mymap.config.MyMapProperties;
import com.gtp.domain.mymap.entity.UserMap;
import com.gtp.domain.mymap.repository.UserMapRepository;
import org.geotools.api.data.FeatureWriter;
import org.geotools.api.data.Transaction;
import org.geotools.api.feature.simple.SimpleFeature;
import org.geotools.api.feature.simple.SimpleFeatureType;
import org.geotools.data.shapefile.ShapefileDataStore;
import org.geotools.data.shapefile.ShapefileDataStoreFactory;
import org.geotools.feature.simple.SimpleFeatureTypeBuilder;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.locationtech.jts.geom.Coordinate;
import org.locationtech.jts.geom.GeometryFactory;
import org.locationtech.jts.geom.Point;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.jdbc.core.JdbcTemplate;

import java.io.Serializable;
import java.nio.file.Path;
import java.util.HashMap;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/** shp 처리: 피처 수 한도(기본 10만)를 넘으면 끝까지 읽지 않고 FAILED + 메시지, 중간 피처는 지운다. */
@DataJpaTest
class UserMapProcessorTest {

    @Autowired
    UserMapRepository repo;
    @Autowired
    JdbcTemplate jdbc;
    @TempDir
    Path dir;

    final ImportGuard guard = new ImportGuard();

    private Path shp(int features) throws Exception {
        SimpleFeatureTypeBuilder tb = new SimpleFeatureTypeBuilder();
        tb.setName("pts");
        tb.add("the_geom", Point.class);
        tb.add("name", String.class);
        tb.add("n", Integer.class);
        SimpleFeatureType type = tb.buildFeatureType();

        Path file = dir.resolve("t" + System.nanoTime() + ".shp");
        Map<String, Serializable> params = new HashMap<>();
        params.put("url", file.toUri().toURL());
        params.put("create spatial index", Boolean.FALSE);
        ShapefileDataStore ds = (ShapefileDataStore) new ShapefileDataStoreFactory().createNewDataStore(params);
        ds.createSchema(type);
        GeometryFactory gf = new GeometryFactory();
        try (FeatureWriter<SimpleFeatureType, SimpleFeature> w = ds.getFeatureWriterAppend(Transaction.AUTO_COMMIT)) {
            for (int i = 0; i < features; i++) {
                SimpleFeature f = w.next();
                f.setAttribute(0, gf.createPoint(new Coordinate(126.9 + i * 0.001, 37.5)));
                f.setAttribute(1, "p" + i);
                f.setAttribute(2, i + 1);
                w.write();
            }
        }
        ds.dispose();
        return file;
    }

    private UserMap layer() {
        return repo.saveAndFlush(UserMap.builder().name("shp").ownerId("alice").sourceType("SHP").sourceKind("SHP").sourceSrid("EPSG:4326").build());
    }

    private UserMapProcessor processor(int maxFeatures) {
        MyMapProperties props = new MyMapProperties();
        props.getLimits().setMaxShpFeatures(maxFeatures);
        return new UserMapProcessor(repo, jdbc, props, guard);
    }

    private int featureCount(long id) {
        return jdbc.queryForObject("SELECT count(*) FROM tbl_user_map_feature WHERE user_map_id = ?", Integer.class, id);
    }

    @Test
    void 한도_이내면_READY() throws Exception {
        UserMap m = layer();
        Path file = shp(5);
        guard.tryAcquire("alice");
        processor(5).processShp(m.getId(), file, "EPSG:4326", "alice");   // 정확히 한도와 같으면 통과

        UserMap got = repo.findById(m.getId()).orElseThrow();
        assertThat(got.getStatus()).isEqualTo("READY");
        assertThat(got.getFeatureCount()).isEqualTo(5);
        assertThat(featureCount(m.getId())).isEqualTo(5);
        assertThat(file.toFile()).doesNotExist();   // 처리 뒤 임시 shp 정리
        // 컬럼 통계: 지오메트리 컬럼은 빠지고 속성만, 정수 속성 n은 숫자 컬럼, 이름은 글자 컬럼
        com.fasterxml.jackson.databind.JsonNode schema = new com.fasterxml.jackson.databind.ObjectMapper().readTree(got.getColumnSchema());
        assertThat(schema.get("rowCount").asLong()).isEqualTo(5);
        assertThat(schema.get("columns")).extracting(c -> c.get("name").asText()).containsExactly("name", "n");
        assertThat(schema.get("columns").get(0).get("kind").asText()).isEqualTo("text");
        assertThat(schema.get("columns").get(1).get("kind").asText()).isEqualTo("number");
        assertThat(schema.get("columns").get(1).get("min").asLong()).isEqualTo(1);
        assertThat(schema.get("columns").get(1).get("max").asLong()).isEqualTo(5);
        assertThat(guard.isActive("alice")).isFalse();   // 처리가 끝나면 사용자당 1건 자물쇠를 푼다
    }

    @Test
    void 실패해도_레이어가_이미_지워졌어도_자물쇠는_풀린다() throws Exception {
        UserMap m = layer();
        guard.tryAcquire("alice");
        processor(3).processShp(m.getId(), shp(5), "EPSG:4326", "alice");   // 한도 초과로 실패
        assertThat(guard.isActive("alice")).isFalse();

        guard.tryAcquire("alice");
        Path file = shp(2);
        processor(3).processShp(99999L, file, "EPSG:4326", "alice");         // 없는 레이어(처리 중 삭제)
        assertThat(guard.isActive("alice")).isFalse();
        assertThat(file.toFile()).doesNotExist();                             // 임시 파일도 정리
    }

    @Test
    void 한도보다_하나만_많아도_FAILED() throws Exception {
        UserMap m = layer();
        processor(3).processShp(m.getId(), shp(4), "EPSG:4326", "alice");
        assertThat(repo.findById(m.getId()).orElseThrow().getStatus()).isEqualTo("FAILED");
        assertThat(featureCount(m.getId())).isZero();
    }

    @Test
    void 한도를_넘으면_FAILED이고_중간_피처를_지운다() throws Exception {
        UserMap m = layer();
        processor(3).processShp(m.getId(), shp(5), "EPSG:4326", "alice");

        UserMap got = repo.findById(m.getId()).orElseThrow();
        assertThat(got.getStatus()).isEqualTo("FAILED");
        assertThat(got.getErrorMessage()).contains("최대 3개").contains("처리하지 못했습니다");
        assertThat(featureCount(m.getId())).isZero();
        assertThat(got.getColumnSchema()).isNull();   // 실패한 레이어에는 통계를 남기지 않는다
    }

    @Test
    void 오류_메시지가_길어도_500자에_맞춰_저장한다() {
        UserMap m = layer();
        m.markFailed("가".repeat(900));
        assertThat(m.getErrorMessage()).hasSize(UserMap.ERROR_MESSAGE_MAX);
    }
}
