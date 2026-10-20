package com.gtp.domain.mymap.service;

import com.gtp.domain.mymap.config.MyMapProperties;
import com.gtp.domain.mymap.entity.UserMap;
import com.gtp.domain.mymap.repository.UserMapRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.jdbc.core.JdbcTemplate;

import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.Timestamp;
import java.time.Duration;
import java.time.LocalDateTime;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

@DataJpaTest
class MyMapMaintenanceTest {

    @Autowired
    UserMapRepository repo;
    @Autowired
    JdbcTemplate jdbc;
    @TempDir
    Path dir;

    MyMapProperties props;
    UserMapImportStore store;
    PendingUploadRegistryTest.TestClock clock;
    PendingUploadRegistry registry;
    MyMapMaintenance maintenance;
    static final LocalDateTime NOW = LocalDateTime.of(2026, 10, 19, 12, 0);

    @BeforeEach
    void setUp() {
        props = new MyMapProperties();
        props.setUploadDir(dir.toString());
        store = new UserMapImportStore(jdbc);
        clock = new PendingUploadRegistryTest.TestClock();
        registry = new PendingUploadRegistry(props, clock);
        maintenance = new MyMapMaintenance(store, registry, props);
    }

    private long layer(String status, LocalDateTime updatedAt) {
        UserMap m = repo.saveAndFlush(UserMap.builder().name(status).ownerId("alice").sourceType("EXCEL").sourceSrid("EPSG:4326").build());
        jdbc.update("UPDATE tbl_user_map SET status = ?, updated_at = ? WHERE id = ?", status, Timestamp.valueOf(updatedAt), m.getId());
        return m.getId();
    }

    private String status(long id) {
        return jdbc.queryForObject("SELECT status FROM tbl_user_map WHERE id = ?", String.class, id);
    }

    private String message(long id) {
        return jdbc.queryForObject("SELECT error_message FROM tbl_user_map WHERE id = ?", String.class, id);
    }

    private void failure(long mapId, int row, LocalDateTime created) {
        jdbc.update("INSERT INTO tbl_user_map_import_failure (user_map_id, row_no, reason_code, row_json, created_at) VALUES (?, ?, 'EMPTY', '{}', ?)",
                mapId, row, Timestamp.valueOf(created));
    }

    private int failureCount() {
        return jdbc.queryForObject("SELECT count(*) FROM tbl_user_map_import_failure", Integer.class);
    }

    // ---------- 멈춘 PROCESSING 정리 ----------

    @Test
    void 진행_기록이_30분_넘게_멈춘_PROCESSING만_FAILED로() {
        long stale = layer("PROCESSING", NOW.minusMinutes(31));
        long fresh = layer("PROCESSING", NOW.minusMinutes(29));
        long ready = layer("READY", NOW.minusDays(3));
        long failed = layer("FAILED", NOW.minusDays(3));

        assertThat(maintenance.failStalledImports(NOW)).isEqualTo(1);

        assertThat(status(stale)).isEqualTo("FAILED");
        assertThat(message(stale)).isEqualTo(MyMapMaintenance.STALLED_MESSAGE).contains("다시 올려");
        assertThat(status(fresh)).isEqualTo("PROCESSING");     // 진행 중일 수 있다
        assertThat(status(ready)).isEqualTo("READY");
        assertThat(status(failed)).isEqualTo("FAILED");
    }

    @Test
    void 기준_시간은_설정값을_따른다() {
        props.getUpload().setStalledMinutes(5);
        long id = layer("PROCESSING", NOW.minusMinutes(6));
        assertThat(maintenance.failStalledImports(NOW)).isEqualTo(1);
        assertThat(status(id)).isEqualTo("FAILED");
    }

    @Test
    void 진행률을_저장하면_updated_at이_갱신돼_멈춘_것으로_보지_않는다() {
        long id = layer("PROCESSING", NOW.minusHours(5));
        assertThat(store.updateProgress(id, 500, 1000)).isTrue();   // 지금 시각으로 updated_at 갱신
        assertThat(maintenance.failStalledImports(LocalDateTime.now())).isZero();
        assertThat(status(id)).isEqualTo("PROCESSING");
    }

    // ---------- 실패 행 30일 ----------

    @Test
    void 보관_기간_30일이_지난_실패_행만_지운다() {
        long id = layer("READY", NOW);
        failure(id, 1, NOW.minusDays(31));
        failure(id, 2, NOW.minusDays(30).minusMinutes(1));
        failure(id, 3, NOW.minusDays(29));
        failure(id, 4, NOW);

        assertThat(maintenance.purgeOldFailures(NOW)).isEqualTo(2);
        assertThat(failureCount()).isEqualTo(2);
        assertThat(jdbc.queryForList("SELECT row_no FROM tbl_user_map_import_failure ORDER BY row_no", Integer.class)).containsExactly(3, 4);
    }

    @Test
    void 보관_일수는_설정을_따른다() {
        props.getMaintenance().setFailureRetentionDays(7);
        long id = layer("READY", NOW);
        failure(id, 1, NOW.minusDays(8));
        failure(id, 2, NOW.minusDays(6));
        assertThat(maintenance.purgeOldFailures(NOW)).isEqualTo(1);
    }

    // ---------- 끄기 ----------

    @Test
    void 정리_작업을_끄면_아무것도_바꾸지_않는다() throws Exception {
        props.getMaintenance().setEnabled(false);
        long stale = layer("PROCESSING", NOW.minusDays(1));
        failure(stale, 1, NOW.minusDays(90));
        Path expired = Files.createFile(dir.resolve(UUID.randomUUID() + ".xlsx"));
        registry.register(new PendingUploadRegistry.Pending("x", "alice", expired, clock.instant().minusSeconds(1), java.util.List.of("h"), 1, "h"));

        assertThat(maintenance.failStalledImports(NOW)).isZero();
        assertThat(maintenance.purgeOldFailures(NOW)).isZero();
        maintenance.sweepPreviews();

        assertThat(status(stale)).isEqualTo("PROCESSING");
        assertThat(failureCount()).isEqualTo(1);
        assertThat(Files.exists(expired)).isTrue();
    }

    // ---------- 미리보기 임시 파일 ----------

    @Test
    void 미리보기_정리는_만료_항목과_주인_없는_오래된_파일을_지운다() throws Exception {
        Path expired = Files.createFile(dir.resolve(UUID.randomUUID() + ".xlsx"));
        Path alive = Files.createFile(dir.resolve(UUID.randomUUID() + ".xlsx"));
        registry.register(new PendingUploadRegistry.Pending("e", "alice", expired, clock.instant().minusSeconds(1), java.util.List.of("h"), 1, "h"));
        registry.register(new PendingUploadRegistry.Pending("a", "alice", alive, clock.instant().plus(Duration.ofMinutes(10)), java.util.List.of("h"), 1, "h"));
        Path orphan = Files.createFile(dir.resolve(UUID.randomUUID() + ".xlsx"));   // 서버 재시작으로 목록에서 사라진 파일
        Files.setLastModifiedTime(orphan, java.nio.file.attribute.FileTime.from(clock.instant().minus(Duration.ofHours(3))));

        maintenance.sweepPreviews();

        assertThat(Files.exists(expired)).isFalse();
        assertThat(Files.exists(alive)).isTrue();
        assertThat(Files.exists(orphan)).isFalse();
    }

    @Test
    void 실패_메시지는_500자에_맞춰_저장한다() {
        long id = layer("PROCESSING", NOW);
        assertThat(store.markFailed(id, "가".repeat(900))).isTrue();
        assertThat(message(id)).hasSize(500);
        assertThat(store.markFailed(99999L, "없는 레이어")).isFalse();   // 지워진 레이어는 0행 — 되살리지 않는다
    }

    @Test
    void 정리_작업_예외는_밖으로_번지지_않는다() {
        UserMapImportStore broken = new UserMapImportStore(null);     // JdbcTemplate이 없어 호출하면 NullPointerException
        MyMapMaintenance m = new MyMapMaintenance(broken, registry, props);
        assertThat(m.failStalledImports(NOW)).isZero();
        assertThat(m.purgeOldFailures(NOW)).isZero();
    }
}
