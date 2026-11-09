package com.gtp.domain.mymap.infra;

import com.gtp.domain.mymap.config.MyMapProperties;
import com.gtp.domain.mymap.port.RefLoadMetaReader.LoadRecord;
import com.gtp.domain.mymap.service.RefStatusService;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** 적재 기록 읽기 — 메모리 H2에 load_meta를 같은 칸으로 만들어 SELECT 모양·변환·실패 전파를 확인한다(운영 DB 접속 없음). */
class JdbcRefLoadMetaReaderTest {

    static JdbcTemplate h2(String name) {
        DriverManagerDataSource ds = new DriverManagerDataSource("jdbc:h2:mem:" + name + System.nanoTime() + ";DB_CLOSE_DELAY=-1", "sa", "");
        JdbcTemplate jdbc = new JdbcTemplate(ds);
        jdbc.execute("CREATE SCHEMA ref");
        jdbc.execute("CREATE TABLE ref.load_meta (dataset varchar(30) NOT NULL, sido char(2) NOT NULL, version varchar(7) NOT NULL, "
                + "status varchar(12) NOT NULL, row_count bigint NOT NULL, base_date date, loaded_at timestamp NOT NULL, PRIMARY KEY (dataset, sido))");
        return jdbc;
    }

    static void put(JdbcTemplate j, String dataset, String sido, String version, String status, long rows, String base, String loaded) {
        j.update("INSERT INTO ref.load_meta VALUES (?, ?, ?, ?, ?, " + (base == null ? "NULL" : "DATE '" + base + "'") + ", TIMESTAMP '" + loaded + "')",
                dataset, sido, version, status, rows);
    }

    @Test
    void 필요한_데이터셋만_읽고_칸을_옮긴다() {
        JdbcTemplate j = h2("lm1_");
        put(j, "ti_spbd_buld", "00", "2026-09", "READY", 7_000_000L, "2026-09-01", "2026-10-05 02:30:45");
        put(j, "ti_sprd_stret", "00", "2026-09", "SWAPPING", 300_000L, null, "2026-10-05 02:40:00");
        put(j, "ti_scco_mvmn", "00", "2026-09", "READY", 9L, "2026-09-01", "2026-10-05 02:50:00");
        put(j, "parcel", "11", "2026-10", "READY", 1_000L, "2026-10-01", "2026-10-06 03:00:00");
        put(j, "parcel", "36", "2026-09", "READY", 500L, "2026-09-01", "2026-10-06 03:10:00");
        put(j, "other_dataset", "00", "2026-01", "READY", 1L, "2026-01-01", "2026-01-02 00:00:00");   // 관심 없는 데이터셋

        List<LoadRecord> all = new JdbcRefLoadMetaReader(j, new MyMapProperties().getRef()).records();
        assertThat(all).hasSize(5).noneMatch(r -> r.dataset().equals("other_dataset"));
        LoadRecord b = all.stream().filter(r -> r.dataset().equals("ti_spbd_buld")).findFirst().orElseThrow();
        assertThat(b.sido()).isEqualTo("00");
        assertThat(b.version()).isEqualTo("2026-09");
        assertThat(b.status()).isEqualTo("READY");
        assertThat(b.rowCount()).isEqualTo(7_000_000L);
        assertThat(b.baseDate()).isEqualTo(LocalDate.of(2026, 9, 1));
        assertThat(b.loadedAt()).isEqualTo(LocalDateTime.of(2026, 10, 5, 2, 30, 45));
        LoadRecord road = all.stream().filter(r -> r.dataset().equals("ti_sprd_stret")).findFirst().orElseThrow();
        assertThat(road.baseDate()).isNull();   // 기준일이 비어도 읽힌다
        assertThat(road.status()).isEqualTo("SWAPPING");
    }

    @Test
    void 기록이_없으면_빈_목록_표가_없으면_예외() {
        JdbcTemplate j = h2("lm2_");
        assertThat(new JdbcRefLoadMetaReader(j, new MyMapProperties().getRef()).records()).isEmpty();

        MyMapProperties.Ref ref = new MyMapProperties().getRef();
        ref.setLoadMetaTable("ref.no_such_table");
        assertThatThrownBy(() -> new JdbcRefLoadMetaReader(j, ref).records()).isInstanceOf(RuntimeException.class);   // 서비스가 UNAVAILABLE로 바꾼다
    }

    @Test
    void 서비스까지_실제_표_모양으로_이어진다_한도_응답과_같은_판정() {
        JdbcTemplate j = h2("lm3_");
        put(j, "ti_spbd_buld", "00", "2026-09", "READY", 1L, "2026-09-01", "2026-10-05 02:30:45");
        put(j, "ti_sprd_stret", "00", "2026-09", "READY", 1L, "2026-09-01", "2026-10-05 02:30:45");
        put(j, "ti_scco_mvmn", "00", "2026-09", "READY", 1L, "2026-09-01", "2026-10-05 02:30:45");
        MyMapProperties props = new MyMapProperties();
        for (String s : props.getRef().getExpectedSidoCodes()) put(j, "parcel", s, "2026-10", "READY", 10L, "2026-10-01", "2026-10-06 03:00:00");
        var res = new RefStatusService(new JdbcRefLoadMetaReader(j, props.getRef()), props,
                Clock.fixed(Instant.parse("2026-11-09T05:03:00Z"), RefStatusService.KST)).status();
        assertThat(res.datasets()).extracting(d -> d.status()).containsOnly("READY");
        assertThat(res.datasets().get(3).coverage().nationwide()).isTrue();
        assertThat(res.datasets().get(3).rowCount()).isEqualTo(160L);
    }

    @Test
    void SELECT_한_번_표_이름은_설정에서_검사한다() {
        MyMapProperties.Ref ref = new MyMapProperties().getRef();
        JdbcRefLoadMetaReader r = new JdbcRefLoadMetaReader(new JdbcTemplate(), ref);
        assertThat(r.sql()).isEqualTo("SELECT dataset, sido, version, status, row_count, base_date, loaded_at FROM ref.load_meta "
                + "WHERE dataset IN (?, ?, ?, 'parcel')");
        assertThat(r.sql().toLowerCase()).doesNotContain("insert").doesNotContain("update ").doesNotContain("delete");

        ref.setLoadMetaTable("ref.load_meta; DROP TABLE x");
        assertThatThrownBy(() -> new JdbcRefLoadMetaReader(new JdbcTemplate(), ref)).isInstanceOf(IllegalArgumentException.class);
    }
}
