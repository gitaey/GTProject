package com.gtp.domain.mymap.infra;

import com.gtp.domain.mymap.config.MyMapProperties;
import com.gtp.domain.mymap.infra.AddressRefReader.BuildingPage;
import com.gtp.domain.mymap.infra.AddressRefReader.BuildingRow;
import com.gtp.domain.mymap.infra.AddressRefReader.JibunKey;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;

import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;

/**
 * 필지 건물 조회(U25a·U25b) — SQL 모양은 문자열로, 실제 실행과 열 매핑은 H2로 확인한다(DISTINCT ON·count() OVER()·LEFT JOIN은 H2도 지원).
 * 실제 PostgreSQL 실행 계획(색인 사용)은 운영 DB라 못 돌리고 _workspace/parcel-card/sql/ 의 D5로 메인이 확인한다.
 */
class JdbcAddressRefReaderBuildingsTest {

    JdbcTemplate jdbc;
    JdbcAddressRefReader reader;

    @BeforeEach
    void setUp() {
        H2Functions.INDEXES.clear();
        jdbc = new JdbcTemplate(new DriverManagerDataSource("jdbc:h2:mem:bld_" + UUID.randomUUID() + ";DB_CLOSE_DELAY=-1"));
        jdbc.execute("CREATE ALIAS TO_REGCLASS FOR \"com.gtp.domain.mymap.infra.H2Functions.toRegclass\"");
        jdbc.execute("CREATE SCHEMA ref");
        jdbc.execute("CREATE TABLE ref.load_meta (dataset varchar(40), sido varchar(2), version varchar(7), status varchar(10))");
        jdbc.execute("CREATE TABLE ref.ti_spbd_buld (bd_mgt_sn varchar(25), adm_cd varchar(10), ctp_kor_nm varchar(40), sig_kor_nm varchar(40), "
                + "emd_kor_nm varchar(40), li_kor_nm varchar(40), mntn_yn varchar(1), lnbr_mnnm int, lnbr_slno int, road_cd varchar(12), "
                + "rn varchar(80), udgd_yn varchar(1), buld_mnnm int, buld_slno int, buld_nm varchar(100), buld_nm_dc varchar(100), "
                + "emd_no varchar(2), zip_cd varchar(5), mv_rs_cd varchar(2), sgg_buld_nm varchar(100), apt_yn varchar(1))");
        jdbc.execute("CREATE TABLE ref.ti_sprd_stret (sgg_cd varchar(5), road_no varchar(7), emd_no varchar(2), emd_gb varchar(1))");
        jdbc.execute("CREATE TABLE ref.ti_scco_mvmn (adm_cd varchar(10), mntn_yn varchar(1), lnbr_mnnm int, lnbr_slno int, road_cd varchar(12), "
                + "udgd_yn varchar(1), buld_mnnm int, buld_slno int, jibun_seq int, mv_rs_cd varchar(2))");
        jdbc.update("INSERT INTO ref.load_meta VALUES ('ti_spbd_buld', '00', '2026-09', 'READY')");
        jdbc.update("INSERT INTO ref.load_meta VALUES ('ti_sprd_stret', '00', '2026-09', 'READY')");
        jdbc.update("INSERT INTO ref.ti_sprd_stret VALUES ('36110', '2000002', '01', '1')");
        reader = new JdbcAddressRefReader(jdbc, new MyMapProperties.Ref());
    }

    @AfterEach
    void tearDown() {
        H2Functions.INDEXES.clear();
    }

    private void building(String sn, String adm, String mntn, int lm, int ls, String road, String udgd, int bm, int bs, String name,
                          String dc, String sgg, String apt, String mv) {
        jdbc.update("INSERT INTO ref.ti_spbd_buld VALUES (?, ?, '세종특별자치시', '', '보람동', '', ?, ?, ?, ?, '한누리대로', ?, ?, ?, ?, ?, '01', '30151', ?, ?, ?)",
                sn, adm, mntn, lm, ls, road, udgd, bm, bs, name, dc, mv, sgg, apt);
    }

    private static final JibunKey KEY = new JibunKey("3611010300", "0", 718, 0);

    @Test
    void SQL_모양_대표지번은_색인_키_4열_등호와_전체건수_폐지_제외() {
        String sql = reader.buildingsByJibunSql();
        assertThat(sql).contains("b.adm_cd = ? AND b.mntn_yn = ? AND b.lnbr_mnnm = ? AND b.lnbr_slno = ?")
                .contains("count(*) OVER () AS total")
                .contains("coalesce(b.mv_rs_cd, '') NOT IN ('63', '72')")
                .contains("FROM ref.ti_spbd_buld b")
                .contains("LEFT JOIN ref.ti_sprd_stret s ON s.sgg_cd = substr(b.road_cd, 1, 5) AND s.road_no = substr(b.road_cd, 6, 7) AND s.emd_no = b.emd_no")
                .endsWith("LIMIT ?")
                .doesNotContain("ti_scco_mvmn");
        // 키 값은 문자열에 이어 붙이지 않고 바인딩한다
        assertThat(sql).doesNotContain("3611").doesNotContain("718");
    }

    @Test
    void SQL_모양_관련지번은_같은_4열_등호_폐지_제외_건물당_1줄() {
        String sql = reader.buildingsByJibunRelatedSql();
        assertThat(sql).contains("FROM ref.ti_scco_mvmn m JOIN ref.ti_spbd_buld b ON b.road_cd = m.road_cd AND b.udgd_yn = m.udgd_yn "
                        + "AND b.buld_mnnm = m.buld_mnnm AND b.buld_slno = m.buld_slno")
                .contains("m.adm_cd = ? AND m.mntn_yn = ? AND m.lnbr_mnnm = ? AND m.lnbr_slno = ?")
                .contains("coalesce(m.mv_rs_cd, '') <> '63'")
                .contains("UNION ALL").contains("DISTINCT ON (u.bd_mgt_sn)").contains("ORDER BY u.bd_mgt_sn, u.rel_ord")
                .contains("count(*) OVER () AS total").endsWith("LIMIT ?");
        assertThat(sql.split("b.adm_cd = \\? AND b.mntn_yn = \\? AND b.lnbr_mnnm = \\? AND b.lnbr_slno = \\?", -1)).hasSize(2);
        assertThat(reader.relatedIndexName()).isEqualTo("ref.ix_ti_scco_mvmn_jibun");
    }

    @Test
    void 관련지번_표_이름은_설정을_따르고_식별자_모양만_허용한다() {
        MyMapProperties.Ref ref = new MyMapProperties.Ref();
        ref.getAddress().setRelatedJibunTable("juso.rel");
        JdbcAddressRefReader r = new JdbcAddressRefReader(mock(org.springframework.jdbc.core.JdbcOperations.class), ref);
        assertThat(r.buildingsByJibunRelatedSql()).contains("FROM juso.rel m JOIN");
        assertThat(r.relatedIndexName()).isEqualTo("juso.ix_rel_jibun");
        MyMapProperties.Ref evil = new MyMapProperties.Ref();
        evil.getAddress().setRelatedJibunTable("ref.x; DROP TABLE y");
        org.assertj.core.api.Assertions.assertThatThrownBy(
                () -> new JdbcAddressRefReader(mock(org.springframework.jdbc.core.JdbcOperations.class), evil))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void 대표지번만_실행_열_매핑_폐지_제외_전체건수와_limit() {
        building("A1", "3611010300", "0", 718, 0, "361102000002", "0", 2130, 0, "청사", "2동", "청사", "1", null);
        building("A2", "3611010300", "0", 718, 0, "361102000002", "0", 2130, 0, "청사", "10동", "청사", "1", "31");
        building("A3", "3611010300", "0", 718, 0, "361102000002", "0", 2130, 0, "청사", "1동", "청사", "1", "63");   // 폐지 — 빠진다
        building("A4", "3611010300", "0", 718, 0, "361102000002", "1", 2130, 0, "주차장", null, null, "0", "72");     // 폐지(72)
        building("B1", "3611010300", "1", 718, 0, "361102000002", "0", 1, 0, "산 건물", null, null, "0", null);       // 산(키 다름)
        building("B2", "3611010300", "0", 718, 1, "361102000002", "0", 1, 0, "부번 다름", null, null, "0", null);     // 부번 다름
        building("B3", "3611010400", "0", 718, 0, "361102000002", "0", 1, 0, "동 다름", null, null, "0", null);       // 법정동 다름

        BuildingPage page = reader.buildingsByJibun(KEY, 200);
        assertThat(page.total()).isEqualTo(2);
        assertThat(page.relatedIncluded()).isFalse();
        assertThat(page.rows()).extracting(BuildingRow::id).containsExactlyInAnyOrder("A1", "A2");
        BuildingRow a = page.rows().stream().filter(r -> r.id().equals("A1")).findFirst().orElseThrow();
        assertThat(a.sido()).isEqualTo("세종특별자치시");
        assertThat(a.emd()).isEqualTo("보람동");
        assertThat(a.roadName()).isEqualTo("한누리대로");
        assertThat(a.roadCd()).isEqualTo("361102000002");
        assertThat(a.udgd()).isEqualTo("0");
        assertThat(a.main()).isEqualTo(2130);
        assertThat(a.detailName()).isEqualTo("2동");
        assertThat(a.sggName()).isEqualTo("청사");
        assertThat(a.apartment()).isTrue();
        assertThat(a.zipCode()).isEqualTo("30151");
        assertThat(a.emdGb()).isEqualTo("1");   // 도로명코드 표 조인
        assertThat(a.relation()).isEqualTo("MAIN");

        BuildingPage one = reader.buildingsByJibun(KEY, 1);
        assertThat(one.total()).isEqualTo(2);   // limit과 무관한 전체
        assertThat(one.rows()).hasSize(1);
    }

    @Test
    void 산_필지_키와_건물_없음() {
        building("B1", "3611010300", "1", 12, 3, "361102000002", "0", 1, 0, "산 건물", null, null, "0", null);
        BuildingPage san = reader.buildingsByJibun(new JibunKey("3611010300", "1", 12, 3), 10);
        assertThat(san.total()).isEqualTo(1);
        assertThat(reader.buildingsByJibun(new JibunKey("3611010300", "0", 12, 3), 10).total()).isZero();
        assertThat(reader.buildingsByJibun(new JibunKey("3611010300", "0", 9999, 0), 10).rows()).isEmpty();
    }

    @Test
    void 관련지번_색인이_있으면_관련지번_건물도_합치고_대표지번이_우선() {
        H2Functions.INDEXES.add("ref.ix_ti_scco_mvmn_jibun");
        // 대표지번이 이 필지인 건물 + 대표지번은 다른 필지(719)지만 관련지번으로 이 필지(718)가 걸린 건물(같은 건물번호 묶음)
        building("A1", "3611010300", "0", 718, 0, "361102000002", "0", 2130, 0, "청사", "1동", "청사", "1", null);
        building("R1", "3611010300", "0", 719, 0, "361102000002", "0", 2200, 0, "별관", null, null, "0", null);
        building("R2", "3611010300", "0", 720, 0, "361102000002", "0", 2300, 0, "폐지 관련", null, null, "0", "63");     // 건물 폐지 — 제외
        // 관련지번 표: R1 건물번호(2200)와 A1 건물번호(2130, 대표와 겹침), R2는 관련지번이 폐지(63)
        jdbc.update("INSERT INTO ref.ti_scco_mvmn VALUES ('3611010300','0',718,0,'361102000002','0',2200,0,1,'31')");
        jdbc.update("INSERT INTO ref.ti_scco_mvmn VALUES ('3611010300','0',718,0,'361102000002','0',2130,0,2,'31')");
        jdbc.update("INSERT INTO ref.ti_scco_mvmn VALUES ('3611010300','0',718,0,'361102000002','0',2300,0,1,'63')");
        jdbc.update("INSERT INTO ref.ti_scco_mvmn VALUES ('3611010300','0',999,0,'361102000002','0',2200,0,2,'31')");   // 다른 필지

        BuildingPage page = reader.buildingsByJibun(KEY, 200);
        assertThat(page.relatedIncluded()).isTrue();
        assertThat(page.total()).isEqualTo(2);
        assertThat(page.rows()).extracting(BuildingRow::id, BuildingRow::relation)
                .containsExactly(org.assertj.core.groups.Tuple.tuple("A1", "MAIN"), org.assertj.core.groups.Tuple.tuple("R1", "RELATED"));
        assertThat(page.rows().get(0).emdGb()).isEqualTo("1");
        assertThat(reader.buildingsByJibun(KEY, 1).total()).isEqualTo(2);
    }

    @Test
    void 관련지번_색인이_없으면_표를_읽지_않고_대표지번만() {
        building("A1", "3611010300", "0", 718, 0, "361102000002", "0", 2130, 0, "청사", "1동", "청사", "1", null);
        building("R1", "3611010300", "0", 719, 0, "361102000002", "0", 2200, 0, "별관", null, null, "0", null);
        jdbc.update("INSERT INTO ref.ti_scco_mvmn VALUES ('3611010300','0',718,0,'361102000002','0',2200,0,1,'31')");
        BuildingPage page = reader.buildingsByJibun(KEY, 200);
        assertThat(page.relatedIncluded()).isFalse();
        assertThat(page.rows()).extracting(BuildingRow::id).containsExactly("A1");
    }

    @Test
    void 색인_확인은_이름별로_따로_기억하고_기준월이_바뀌면_다시_확인() {
        assertThat(reader.jibunLookupReady()).isFalse();
        assertThat(reader.relatedJibunLookupReady()).isFalse();

        H2Functions.INDEXES.add("ref.ix_ti_scco_mvmn_jibun");          // 관련지번만 생겼다 — 지번 색인과 서로 영향 없음
        // "없음"은 5분 동안 기억하므로 바로는 안 바뀐다(재확인 시간 전)
        assertThat(reader.relatedJibunLookupReady()).isFalse();
        assertThat(reader.jibunLookupReady()).isFalse();

        // 적재 기준월이 바뀌면 둘 다 다시 확인한다
        jdbc.update("UPDATE ref.load_meta SET version = '2026-10'");
        H2Functions.INDEXES.add("ref.ix_ti_spbd_buld_jibun");
        assertThat(reader.jibunLookupReady()).isTrue();
        assertThat(reader.relatedJibunLookupReady()).isTrue();

        // 켜졌다고 확인한 결과는 기준월이 같은 동안 기억(색인이 사라져도 이 기준월에는 true — 기존 지번 색인과 같은 규칙)
        H2Functions.INDEXES.clear();
        assertThat(reader.jibunLookupReady()).isTrue();
        jdbc.update("UPDATE ref.load_meta SET version = '2026-11'");
        assertThat(reader.jibunLookupReady()).isFalse();
        assertThat(reader.relatedJibunLookupReady()).isFalse();
    }

    @Test
    void 적재_교체_중이면_둘_다_준비_안_됨() {
        H2Functions.INDEXES.add("ref.ix_ti_spbd_buld_jibun");
        H2Functions.INDEXES.add("ref.ix_ti_scco_mvmn_jibun");
        assertThat(reader.jibunLookupReady()).isTrue();
        jdbc.update("UPDATE ref.load_meta SET status = 'SWAPPING' WHERE dataset = 'ti_spbd_buld'");
        assertThat(reader.jibunLookupReady()).isFalse();
        assertThat(reader.relatedJibunLookupReady()).isFalse();
    }
}
